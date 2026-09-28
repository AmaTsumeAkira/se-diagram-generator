// ====== SQL DDL Parser for ER Diagram Generation ======
//
// 不依赖 AI 的实体 / 关系识别。
//
// 历史问题：原实现用 `\(([\s\S]*?)\)` 非贪婪捕获建表体，遇到 `VARCHAR(50)` 这类
// 带括号的列类型就会提前截断 —— 该表之后的列、外键、表级主键全部丢失，
// 于是任何含 VARCHAR 的真实 schema 都推不出关系。
// 现在改为「引号与注释感知的括号配对扫描」，并在其上补：
//   · 列级 REFERENCES / 表级 FOREIGN KEY / ALTER TABLE ADD CONSTRAINT
//   · 表级 PRIMARY KEY / UNIQUE（用于判定 1:1）
//   · 注释（COMMENT、COMMENT ON、建表语句上方的 -- 行注释）→ 中文实体名与联系名
//   · 同表多个外键不再被折叠
// 命名与联系动词的推断见 utils/sqlNaming.ts（注释优先，其次内置词表，未命中保留原文）。

import { resolveRelationLabel, resolveTableLabel } from './sqlNaming'

export interface SqlColumn {
  name: string
  type: string
  isPrimaryKey: boolean
  isNotNull: boolean
  isUnique?: boolean
  comment?: string
  /** 列级外键：user_id INT REFERENCES users(id) */
  references?: { table: string; column: string }
}

export interface SqlForeignKey {
  /** 外键列（复合外键为逗号分隔的列名） */
  column: string
  refTable: string
  refColumn: string
  /** 该外键列被主键或唯一约束覆盖 → 1:1 而非 1:N */
  isUnique?: boolean
  comment?: string
}

export interface SqlTable {
  name: string
  /** 展示用名称：注释优先，其次内置词表，最后等于 name */
  label: string
  columns: SqlColumn[]
  primaryKeys: string[]
  foreignKeys: SqlForeignKey[]
  /** DDL 显式表注释（COMMENT '...' / COMMENT ON TABLE） */
  comment?: string
  /** 建表语句上方紧邻的 -- 行注释（仅作命名兜底） */
  lineComment?: string
  /** 表级唯一约束的列集合（含单列 UNIQUE 与主键），用于 1:1 判定 */
  uniqueSets?: string[][]
}

export interface SqlParseResult {
  tables: SqlTable[]
  errors: string[]
}

// ====== Relationship derivation ======

export interface ERRelationship {
  id: string
  label: string
  sourceTable: string
  targetTable: string
  sourceCardinality: string  // '1' 或 'N'
  targetCardinality: string  // '1' 或 'N'
}

// ====== 低层扫描工具 ======

function cleanName(name: string): string {
  return name.replace(/[`"[\]]/g, '').trim()
}

/** 归一整定名（去掉引号/方括号与 `.` 两侧空白）：`` `shop` . `users` `` → `shop.users` */
function normalizeName(name: string): string {
  return cleanName(name)
    .split('.')
    .map((p) => p.trim())
    .filter(Boolean)
    .join('.')
}

/** 取 schema 限定部分：`shop.users` → `shop`；无 schema 前缀 → '' */
function qualifierOf(name: string): string {
  const n = normalizeName(name)
  return n.includes('.') ? n.slice(0, n.lastIndexOf('.')) : ''
}

/** 去掉 schema 前缀，`shop.order_item` → `order_item`（让跨 schema 引用也能对上） */
function baseName(name: string): string {
  const cleaned = normalizeName(name)
  return cleaned.includes('.') ? cleaned.split('.').pop()!.trim() : cleaned
}

/**
 * 标识符字符类：支持裸标识符 / `` `x` `` / "x" / [x]，并支持 CJK（PHP/MySQL 中文表名很常见）。
 * `\w` 不匹配中文，旧写法会把 `` CREATE TABLE `学生` `` 整条丢掉。
 */
const IDENT_BODY = '[^\\s`"\\[\\](),;]+'
const IDENT = '(?:\\[[^\\]]+\\]|"[^"]+"|`[^`]+`|' + IDENT_BODY + ')'
/** 限定名 schema.table（每一段都可带引号） */
const QUALIFIED_IDENT = IDENT + '(?:\\s*\\.\\s*' + IDENT + ')*'
/** 可选的 `CONSTRAINT <name> ` 前缀 */
const CONSTRAINT_PREFIX = '(?:CONSTRAINT\\s+' + IDENT + '\\s+)?'

const PK_RE = new RegExp('^' + CONSTRAINT_PREFIX + 'PRIMARY\\s+KEY\\s*\\(([^)]+)\\)', 'i')
const FK_RE = new RegExp(
  '^' + CONSTRAINT_PREFIX + 'FOREIGN\\s+KEY\\s*\\(([^)]+)\\)\\s*REFERENCES\\s+(' + QUALIFIED_IDENT + ')\\s*\\(([^)]+)\\)',
  'i',
)
const UQ_RE = new RegExp(
  '^' + CONSTRAINT_PREFIX + 'UNIQUE(?:\\s+(?:KEY|INDEX))?(?:\\s+' + IDENT + ')?\\s*\\(([^)]+)\\)',
  'i',
)
const COL_RE = new RegExp('^(' + IDENT + ')\\s+([\\s\\S]+)$')
const COL_REF_RE = new RegExp(
  '\\bREFERENCES\\s+(' + QUALIFIED_IDENT + ')\\s*\\(([^)]+)\\)',
  'i',
)

/**
 * 括号配对扫描：从 openIdx 处的 '(' 开始，返回与之配对的 ')' 的下标。
 * 跳过单/双引号、反引号字符串与 `--`、`/* *\/` 注释，因此列类型里的括号不会被误当成结束。
 */
function matchParen(s: string, openIdx: number): number {
  let depth = 0
  for (let i = openIdx; i < s.length; i++) {
    const ch = s[i]
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch
      i++
      while (i < s.length) {
        if (s[i] === '\\' && quote !== '`') { i += 2; continue }
        if (s[i] === quote) {
          if (s[i + 1] === quote) { i += 2; continue }  // 转义的双写引号
          break
        }
        i++
      }
      continue
    }
    if (ch === '-' && s[i + 1] === '-') {
      while (i < s.length && s[i] !== '\n') i++
      continue
    }
    if (ch === '/' && s[i + 1] === '*') {
      const end = s.indexOf('*/', i + 2)
      i = end < 0 ? s.length : end + 1
      continue
    }
    if (ch === '(') depth++
    else if (ch === ')') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

/** 多词类型里允许的「续接词」：前一个词 → 可跟随的词 */
const TYPE_CONTINUATIONS: Record<string, string[]> = {
  DOUBLE: ['PRECISION'],
  NATIONAL: ['CHARACTER'],
  CHARACTER: ['VARYING', 'LARGE'],
  BIT: ['VARYING'],
  BINARY: ['VARYING', 'LARGE'],
  TIMESTAMP: ['WITH', 'WITHOUT'],
  TIME: ['WITH', 'WITHOUT'],
  LOCAL: ['TIME'],
  LONG: ['VARCHAR', 'RAW'],
  INTERVAL: ['DAY', 'YEAR', 'MONTH', 'HOUR', 'MINUTE', 'SECOND'],
  DAY: ['TO'],
  YEAR: ['TO'],
  MONTH: ['TO'],
  HOUR: ['TO'],
  MINUTE: ['TO'],
  TO: ['SECOND', 'MINUTE', 'HOUR', 'DAY', 'MONTH', 'YEAR'],
}
/** MySQL 类型修饰词（可跟在任意类型后） */
const TYPE_MODIFIERS = new Set(['UNSIGNED', 'SIGNED', 'ZEROFILL', 'BINARY'])

function continuesType(lastWord: string, next: string): boolean {
  const n = next.toUpperCase()
  if (TYPE_MODIFIERS.has(n)) return true
  if (lastWord === 'WITH' || lastWord === 'WITHOUT') return n === 'TIME' || n === 'LOCAL'
  if (lastWord === 'TIME') return n === 'ZONE'
  return (TYPE_CONTINUATIONS[lastWord] || []).includes(n)
}

/** 只把单引号外的部分大写，`'x'` 这类字面量保持原样（ENUM('x','y','z') 不被改写） */
function upperOutsideQuotes(s: string): string {
  let out = ''
  let inQuote = false
  for (const ch of s) {
    if (ch === "'") {
      inQuote = !inQuote
      out += ch
      continue
    }
    out += inQuote ? ch : ch.toUpperCase()
  }
  return out
}

/**
 * 解析列类型（保留多词类型整体）：
 *   DOUBLE PRECISION / TIMESTAMP WITH TIME ZONE / NATIONAL CHARACTER VARYING(30)
 *   BIT VARYING(8) / ENUM('x','y','z') / INT UNSIGNED / DECIMAL(10,2)
 * 旧实现只取第一个词，导致 `DOUBLE PRECISION` 退化成 `DOUBLE`。
 * 约束关键字（PRIMARY KEY / NOT NULL / DEFAULT / COMMENT…）不是续接词，因此不会被吞进类型。
 */
function readColumnType(rest: string): string {
  const head = /^[A-Za-z][A-Za-z0-9_]*/.exec(rest)
  if (!head) return 'TEXT'

  let out = head[0]
  let lastWord = head[0].toUpperCase()
  let i = head[0].length

  for (;;) {
    let j = i
    while (j < rest.length && /\s/.test(rest[j])) j++

    if (rest[j] === '(') {
      const close = matchParen(rest, j)
      if (close < 0) break
      out += rest.slice(j, close + 1)
      i = close + 1
      continue
    }

    const word = /^[A-Za-z][A-Za-z0-9_]*/.exec(rest.slice(j))
    if (!word || !continuesType(lastWord, word[0])) break
    out += ' ' + word[0]
    lastWord = word[0].toUpperCase()
    i = j + word[0].length
  }

  return upperOutsideQuotes(out)
}

/** 顶层逗号切分（同样跳过引号与注释） */
function splitTopLevel(body: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch
      current += ch
      i++
      while (i < body.length) {
        current += body[i]
        if (body[i] === '\\' && quote !== '`') { i++; current += body[i] ?? ''; i++; continue }
        if (body[i] === quote) {
          if (body[i + 1] === quote) { current += body[++i]; i++; continue }
          break
        }
        i++
      }
      continue
    }
    if (ch === '-' && body[i + 1] === '-') {
      while (i < body.length && body[i] !== '\n') i++
      current += ' '
      continue
    }
    if (ch === '/' && body[i + 1] === '*') {
      const end = body.indexOf('*/', i + 2)
      i = end < 0 ? body.length : end + 1
      continue
    }
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) {
      parts.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  if (current.trim()) parts.push(current)
  return parts
}

/** 取反引号/引号里的字符串字面量 */
function quoted(s: string): string | null {
  const m = s.match(/'((?:[^']|'')*)'/)
  return m ? m[1].replace(/''/g, "'") : null
}

/** 建表语句上方紧邻的 `-- 注释`（多次出现取最后一段连续注释块） */
function leadingComment(sql: string, createIdx: number): string | undefined {
  const before = sql.slice(0, createIdx)
  const lines = before.split('\n')
  const collected: string[] = []
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim()
    if (!line) {
      if (collected.length) break
      continue
    }
    const c = line.match(/^--\s*(.+)$/) || line.match(/^\/\/\s*(.+)$/)
    if (!c) break
    collected.unshift(c[1].trim())
  }
  return collected.length ? collected.join(' ') : undefined
}

// ====== 列与约束解析 ======

const TABLE_CONSTRAINT_SKIP = /^(?:UNIQUE\s+)?(?:FULLTEXT\s+|SPATIAL\s+)?(?:INDEX|KEY)\s/i
const CHECK_CONSTRAINT_RE = new RegExp('^(?:CONSTRAINT\\s+' + IDENT + '\\s+)?CHECK\\s', 'i')

function parseTableBody(
  body: string,
  tableName: string,
  tableComment: string | undefined,
  lineComment: string | undefined,
  errors: string[],
): SqlTable {
  const columns: SqlColumn[] = []
  const primaryKeys: string[] = []
  const foreignKeys: SqlForeignKey[] = []
  const uniqueSets: string[][] = []

  for (const rawPart of splitTopLevel(body)) {
    const trimmed = rawPart.trim()
    if (!trimmed) continue

    // 表级 PRIMARY KEY
    const pkMatch = trimmed.match(PK_RE)
    if (pkMatch) {
      primaryKeys.push(...pkMatch[1].split(',').map((c) => cleanName(c.trim())))
      continue
    }

    // 表级 FOREIGN KEY（可带 CONSTRAINT 名，支持复合列）
    const fkMatch = trimmed.match(FK_RE)
    if (fkMatch) {
      const cols = fkMatch[1].split(',').map((c) => cleanName(c.trim()))
      const refCols = fkMatch[3].split(',').map((c) => cleanName(c.trim()))
      // 先按原样保留 schema 前缀，全部表解析完后再统一解析成真实表名
      const refTable = normalizeName(fkMatch[2])
      if (cols.length > 1) {
        // 复合外键：合成一条联系（列为逗号串），避免同一约束裂成多条
        foreignKeys.push({
          column: cols.join(','),
          refTable,
          refColumn: refCols.join(','),
        })
      } else {
        foreignKeys.push({
          column: cols[0],
          refTable,
          refColumn: refCols[0] ?? '',
        })
      }
      continue
    }

    // 表级 UNIQUE
    const uqMatch = trimmed.match(UQ_RE)
    if (uqMatch) {
      uniqueSets.push(uqMatch[1].split(',').map((c) => cleanName(c.trim())))
      continue
    }

    // INDEX / KEY / CHECK 等跳过
    if (TABLE_CONSTRAINT_SKIP.test(trimmed) || CHECK_CONSTRAINT_RE.test(trimmed)) continue

    // 列定义
    const colMatch = trimmed.match(COL_RE)
    if (!colMatch) {
      // 不要静默丢弃：无法识别的定义至少落到 errors（例如中文列名解析失败）
      errors.push(`表 "${tableName}" 中的定义无法解析：${trimmed.slice(0, 60)}`)
      continue
    }
    const colName = cleanName(colMatch[1])
    const rest = colMatch[2]

    const colType = readColumnType(rest)

    const isPK = /\bPRIMARY\s+KEY\b/i.test(rest)
    const isNotNull = /\bNOT\s+NULL\b/i.test(rest)
    const isUnique = /\bUNIQUE\b/i.test(rest)
    const comment = quoted(rest.match(/COMMENT\s+'((?:[^']|'')*)'/i)?.[0] ?? '') || undefined
    const refMatch = rest.match(COL_REF_RE)
    const references = refMatch
      ? { table: normalizeName(refMatch[1]), column: cleanName(refMatch[2].trim()) }
      : undefined

    if (isPK) primaryKeys.push(colName)
    if (isUnique) uniqueSets.push([colName])

    columns.push({ name: colName, type: colType, isPrimaryKey: isPK, isNotNull, isUnique, comment, references })

    // 列级外键：并入统一的外键列表
    if (references) {
      foreignKeys.push({ column: colName, refTable: references.table, refColumn: references.column })
    }
  }

  // 补齐表级主键标记
  for (const pk of primaryKeys) {
    const col = columns.find((c) => c.name === pk)
    if (col) col.isPrimaryKey = true
  }
  if (primaryKeys.length) uniqueSets.push([...primaryKeys])

  // 外键列注释继承列注释
  for (const fk of foreignKeys) {
    const col = columns.find((c) => c.name === fk.column)
    if (col?.comment) fk.comment = col.comment
  }

  return { name: tableName, label: tableName, columns, primaryKeys, foreignKeys, comment: tableComment, lineComment, uniqueSets }
}

/** 外键列是否被主键 / 唯一约束覆盖 → 1:1 */
function isUniqueFk(table: SqlTable, fk: SqlForeignKey): boolean {
  const set = new Set(fk.column.split(',').map((c) => c.trim()))
  const covered = (group: string[]) => group.length === set.size && group.every((c) => set.has(c))
  return (table.uniqueSets || []).some(covered)
}

// ====== 主解析 ======

const CREATE_TABLE_RE = new RegExp(
  'CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(' + QUALIFIED_IDENT + ')\\s*\\(',
  'gi',
)
const ALTER_FK_RE = new RegExp(
  'ALTER\\s+TABLE\\s+(' + QUALIFIED_IDENT + ')\\s+ADD\\s+' + CONSTRAINT_PREFIX +
    'FOREIGN\\s+KEY\\s*\\(([^)]+)\\)\\s*REFERENCES\\s+(' + QUALIFIED_IDENT + ')\\s*\\(([^)]+)\\)',
  'gi',
)
const COMMENT_ON_TABLE_RE = new RegExp(
  'COMMENT\\s+ON\\s+TABLE\\s+(' + QUALIFIED_IDENT + ")\\s+IS\\s+'((?:[^']|'')*)'",
  'gi',
)
const COMMENT_ON_COLUMN_RE = new RegExp(
  'COMMENT\\s+ON\\s+COLUMN\\s+(' + QUALIFIED_IDENT + ")\\s+IS\\s+'((?:[^']|'')*)'",
  'gi',
)

interface CreateEntry {
  index: number
  /** 原样（去引号）限定名，如 shop.users */
  qualified: string
  /** 去掉 schema 后的表名 */
  base: string
  openIdx: number
  closeIdx: number
}

export function parseSql(sql: string): SqlParseResult {
  const tables: SqlTable[] = []
  const errors: string[] = []
  const normalized = sql.replace(/\r\n?/g, '\n')

  // ---- 第一遍：定位所有 CREATE TABLE 与其表体范围 ----
  const entries: CreateEntry[] = []
  CREATE_TABLE_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = CREATE_TABLE_RE.exec(normalized)) !== null) {
    const qualified = normalizeName(m[1])
    const base = baseName(qualified)
    const openIdx = m.index + m[0].length - 1
    const closeIdx = matchParen(normalized, openIdx)
    if (closeIdx < 0) {
      errors.push(`表 "${qualified || m[1]}" 的括号未闭合，已跳过`)
      continue
    }
    if (qualified) entries.push({ index: m.index, qualified, base, openIdx, closeIdx })
    CREATE_TABLE_RE.lastIndex = closeIdx + 1
  }

  // ---- 表名归一：跨 schema 同名表用 schema 前缀区分（shop.users / public.users → shop_users / public_users），
  //      并保证返回的 tables 名称唯一（否则节点 id 相撞、实体框完全重叠） ----
  const baseCount = new Map<string, number>()
  for (const e of entries) {
    const key = e.base.toLowerCase()
    baseCount.set(key, (baseCount.get(key) ?? 0) + 1)
  }
  const usedNames = new Set<string>()
  const claimName = (want: string): string => {
    let name = want
    let i = 2
    while (!name || usedNames.has(name.toLowerCase())) name = `${want}_${i++}`
    usedNames.add(name.toLowerCase())
    return name
  }

  // ---- 第二遍：解析表体 ----
  const parsed: { table: SqlTable; entry: CreateEntry }[] = []
  for (const entry of entries) {
    const { qualified, base, index, openIdx, closeIdx } = entry
    const schema = qualifierOf(qualified)
    const name = claimName(
      (baseCount.get(base.toLowerCase()) ?? 0) > 1 && schema
        ? `${schema.replace(/\./g, '_')}_${base}`
        : base,
    )
    try {
      const body = normalized.slice(openIdx + 1, closeIdx)
      const tail = normalized.slice(closeIdx + 1, Math.min(normalized.length, closeIdx + 600))
      const stop = tail.search(/;/)
      const tailClause = stop >= 0 ? tail.slice(0, stop) : tail
      const comment = quoted(tailClause.match(/COMMENT\s*=?\s*'((?:[^']|'')*)'/i)?.[0] ?? '') || undefined
      const lineComment = leadingComment(normalized, index)
      const table = parseTableBody(body, name, comment, lineComment, errors)
      tables.push(table)
      parsed.push({ table, entry })
    } catch (e) {
      errors.push(`解析表 "${qualified}" 失败: ${(e as Error).message}`)
    }
  }

  // ---- 引用查表：支持 限定名 / 归一名 / 唯一的 base 名 ----
  const byLookup = new Map<string, SqlTable>()
  for (const p of parsed) {
    byLookup.set(p.entry.qualified.toLowerCase(), p.table)
    byLookup.set(p.entry.base.toLowerCase(), p.table)
    byLookup.set(p.table.name.toLowerCase(), p.table)
  }
  // base 名撞车（同名表来自不同 schema）时不可用 base 名反查，避免张冠李戴
  const ambiguousBases = new Set<string>()
  for (const [key, count] of baseCount) {
    if (count > 1) {
      ambiguousBases.add(key)
      byLookup.delete(key)
    }
  }
  const lookupTable = (ref: string): SqlTable | undefined => {
    const key = normalizeName(ref).toLowerCase()
    if (key && byLookup.has(key)) return byLookup.get(key)
    const b = baseName(ref).toLowerCase()
    if (b && !ambiguousBases.has(b) && byLookup.has(b)) return byLookup.get(b)
    return undefined
  }
  const canonicalRef = (ref: string): string => lookupTable(ref)?.name ?? normalizeName(ref)

  // 外键目标统一成真实表名（qualified → shop_users），否则跨 schema 引用对不上
  for (const table of tables) {
    for (const fk of table.foreignKeys) fk.refTable = canonicalRef(fk.refTable)
    for (const col of table.columns) {
      if (col.references) col.references.table = canonicalRef(col.references.table)
    }
  }

  // ---- ALTER TABLE ... ADD FOREIGN KEY ----
  ALTER_FK_RE.lastIndex = 0
  while ((m = ALTER_FK_RE.exec(normalized)) !== null) {
    const table = lookupTable(m[1])
    if (!table) continue
    const cols = m[2].split(',').map((c) => cleanName(c.trim()))
    const refTable = canonicalRef(m[3])
    const refCols = m[4].split(',').map((c) => cleanName(c.trim()))
    const column = cols.length > 1 ? cols.join(',') : cols[0]
    const refColumn = refCols.length > 1 ? refCols.join(',') : refCols[0]
    if (!table.foreignKeys.some((f) => f.column === column && f.refTable === refTable)) {
      const col = table.columns.find((c) => c.name === cols[0])
      table.foreignKeys.push({ column, refTable, refColumn, comment: col?.comment })
    }
  }

  // ---- COMMENT ON TABLE / COLUMN ----
  COMMENT_ON_TABLE_RE.lastIndex = 0
  while ((m = COMMENT_ON_TABLE_RE.exec(normalized)) !== null) {
    const table = lookupTable(m[1])
    if (table) table.comment = m[2].replace(/''/g, "'")
  }
  COMMENT_ON_COLUMN_RE.lastIndex = 0
  while ((m = COMMENT_ON_COLUMN_RE.exec(normalized)) !== null) {
    const path = normalizeName(m[1]).split('.')
    if (path.length < 2) continue
    const table = lookupTable(path.slice(0, -1).join('.'))
    const col = table?.columns.find((c) => c.name === path[path.length - 1])
    if (col) col.comment = m[2].replace(/''/g, "'")
  }

  // ---- 收尾：唯一性判定 + 展示名 ----
  for (const table of tables) {
    for (const fk of table.foreignKeys) {
      fk.isUnique = isUniqueFk(table, fk)
    }
    table.label = resolveTableLabel({ name: table.name, comment: table.comment, lineComment: table.lineComment })
  }

  // 展示名同样不能重复（shop.users / public.users 都会译成「用户」）：重复时补 schema 限定
  const labelCount = new Map<string, number>()
  for (const table of tables) labelCount.set(table.label, (labelCount.get(table.label) ?? 0) + 1)
  const usedLabels = new Set<string>()
  for (const { table, entry } of parsed) {
    if ((labelCount.get(table.label) ?? 0) > 1) {
      table.label = `${table.label} (${qualifierOf(entry.qualified) || table.name})`
    }
    let label = table.label
    let i = 2
    while (usedLabels.has(label)) label = `${table.label} #${i++}`
    usedLabels.add(label)
    table.label = label
  }

  if (tables.length === 0 && sql.trim().length > 0) {
    errors.push('未找到有效的 CREATE TABLE 语句')
  }

  return { tables, errors }
}

// ====== 由外键推导联系 ======

export function deriveRelationships(tables: SqlTable[]): ERRelationship[] {
  const relationships: ERRelationship[] = []
  const tableNames = new Set(tables.map((t) => t.name))
  const used = new Set<string>()

  for (const table of tables) {
    for (const fk of table.foreignKeys) {
      if (!tableNames.has(fk.refTable)) continue
      // 同表同列同目标视为重复；同一目标的不同列（如收件人 / 发件人）不再被折叠
      const key = `${table.name}.${fk.column}->${fk.refTable}`
      if (used.has(key)) continue
      used.add(key)

      // 外键侧是"多"侧；被唯一约束覆盖时（PK 兼 FK、UNIQUE 外键）退化为 1:1
      const oneToOne = !!fk.isUnique
      relationships.push({
        id: `rel_${table.name}_${fk.column}`,
        label: resolveRelationLabel(fk.column, fk.refTable, fk.comment),
        sourceTable: fk.refTable,
        targetTable: table.name,
        sourceCardinality: '1',
        targetCardinality: oneToOne ? '1' : 'N',
      })
    }
  }

  return relationships
}

// ====== 概念层视图：纯连接表折叠为 M:N ======

/** 只有审计/备注类附加列时，仍视为"纯连接表" */
const AUDIT_COLUMN = /^(created?_?(at|time|by)|updated?_?(at|time|by)|deleted?_?(at|flag)|is_?deleted|create_?time|update_?time|create_?by|update_?by|remark|note|memo|sort|order_?num|seq|version|备注|创建时间|更新时间|创建人|修改时间|排序|序号)$/i

/**
 * 是否为"纯连接表"：恰好两个外键、主键正好是这两列、且没有业务附加列。
 * 这类表在 Chen 表示法里应折叠成一个 M:N 联系（菱形），而不是保留关联实体。
 */
export function isPureJunction(table: SqlTable): boolean {
  if (table.foreignKeys.length !== 2) return false
  const fkCols = table.foreignKeys.flatMap((f) => f.column.split(',').map((c) => c.trim()))
  if (fkCols.length !== 2 || new Set(fkCols).size !== 2) return false
  if (table.primaryKeys.length !== 2) return false
  const pk = new Set(table.primaryKeys)
  if (!fkCols.every((c) => pk.has(c))) return false
  if (table.foreignKeys[0].refTable === table.foreignKeys[1].refTable) return false
  const keyCols = new Set(fkCols)
  const payload = table.columns.filter(
    (c) => !keyCols.has(c.name) && !c.isPrimaryKey && !AUDIT_COLUMN.test(c.name),
  )
  return payload.length === 0
}

export interface DeriveOptions {
  /** 是否把纯连接表折叠成 M:N 联系（Chen 表示法）。默认 true */
  mergeManyToMany?: boolean
}

export interface ErModel {
  /** 参与绘图的实体（已剔除被折叠的连接表） */
  entities: SqlTable[]
  relationships: ERRelationship[]
}

/** 概念层 ER 模型：实体 + 联系（可选折叠纯连接表为 M:N） */
export function buildErModel(tables: SqlTable[], opts: DeriveOptions = {}): ErModel {
  if (opts.mergeManyToMany === false) {
    return { entities: tables, relationships: deriveRelationships(tables) }
  }

  // 候选连接表：其父表若也是候选，则本表不折叠（避免把联系指向一个已被折叠的表）
  const candidates = tables.filter(isPureJunction)
  const candidateNames = new Set(candidates.map((t) => t.name))
  const junctions = candidates.filter(
    (t) => !t.foreignKeys.some((fk) => candidateNames.has(fk.refTable)),
  )
  const collapsedNames = new Set(junctions.map((t) => t.name))
  const entities = tables.filter((t) => !collapsedNames.has(t.name))

  const relationships: ERRelationship[] = junctions.map((j) => {
    const [a, b] = j.foreignKeys
    const label = (j.comment || '').trim() || (j.label && j.label !== j.name ? j.label : '关联')
    return {
      id: `rel_mn_${j.name}`,
      label,
      sourceTable: a.refTable,
      targetTable: b.refTable,
      sourceCardinality: 'M',
      targetCardinality: 'N',
    }
  })

  // 其余联系仍按外键推导（已剔除被折叠的表，避免出现指向空实体的联系）
  const refNames = new Set(entities.map((t) => t.name))
  relationships.push(
    ...deriveRelationships(entities).filter(
      (r) => refNames.has(r.sourceTable) && refNames.has(r.targetTable),
    ),
  )

  return { entities, relationships }
}

// ====== Convert parse result to ER diagram node/edge config ======

export interface ERNodeConfig {
  id: string
  type: string  // 'erEntity' or 'erDiamond'
  label: string
}

export interface EREdgeConfig {
  id: string
  source: string
  target: string
  sourceCard?: string
  targetCard?: string
}

export function sqlToERConfig(result: SqlParseResult, opts: DeriveOptions = {}): {
  nodes: ERNodeConfig[]
  edges: EREdgeConfig[]
  relationships: ERRelationship[]
} {
  const nodes: ERNodeConfig[] = []
  const edges: EREdgeConfig[] = []

  const { entities, relationships } = buildErModel(result.tables, opts)

  // id 兜底唯一化：名称归一后仍然保证节点 id 不撞车（撞车会让两个实体框完全重叠）
  const usedIds = new Set<string>()
  const claimId = (base: string): string => {
    const safe = base.replace(/[.\s]+/g, '_')
    let id = safe
    let i = 2
    while (!id || usedIds.has(id)) id = `${safe}_${i++}`
    usedIds.add(id)
    return id
  }
  const entityId = new Map<string, string>()
  for (const table of entities) {
    const id = claimId(`ent_${table.name}`)
    entityId.set(table.name, id)
    nodes.push({ id, type: 'erEntity', label: table.label || table.name })
  }

  for (const rel of relationships) {
    // 用联系自身的 id 做菱形 id：同一对实体之间的多条联系（如收件人 / 发件人）不会撞名
    const diamondId = claimId(`dia_${rel.id}`)
    nodes.push({ id: diamondId, type: 'erDiamond', label: rel.label })

    const source = entityId.get(rel.sourceTable) ?? `ent_${rel.sourceTable}`
    const target = entityId.get(rel.targetTable) ?? `ent_${rel.targetTable}`
    edges.push({
      id: `e_${source}_${diamondId}`,
      source,
      target: diamondId,
      sourceCard: rel.sourceCardinality,
      targetCard: '',
    })
    edges.push({
      id: `e_${diamondId}_${target}`,
      source: diamondId,
      target,
      sourceCard: '',
      targetCard: rel.targetCardinality,
    })
  }

  return { nodes, edges, relationships }
}
