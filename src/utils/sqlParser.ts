// ====== SQL DDL Parser for ER Diagram Generation ======

export interface SqlColumn {
  name: string
  type: string
  isPrimaryKey: boolean
  isNotNull: boolean
}

export interface SqlForeignKey {
  column: string
  refTable: string
  refColumn: string
}

export interface SqlTable {
  name: string
  columns: SqlColumn[]
  primaryKeys: string[]
  foreignKeys: SqlForeignKey[]
  uniqueKeys: string[][]
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
  sourceCardinality: string  // '1' or 'N'
  targetCardinality: string  // '1' or 'N'
}

/**
 * Parse SQL CREATE TABLE statements and extract tables + relationships.
 */
export function parseSql(sql: string): SqlParseResult {
  const tables: SqlTable[] = []
  const errors: string[] = []

  const withoutLineComments = sql.replace(/--.*$/gm, '')
  const withoutComments = withoutLineComments.replace(/\/\*[\s\S]*?\*\//g, '')
  const normalized = withoutComments.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const blocks = extractCreateTableBlocks(normalized)

  for (const block of blocks) {
    try {
      tables.push(parseTableBody(block.name, block.body))
    } catch (e) {
      errors.push(`解析表 "${block.name}" 失败: ${(e as Error).message}`)
    }
  }

  if (tables.length === 0 && withoutComments.trim().length > 0) {
    errors.push('未找到可解析的 CREATE TABLE 语句')
  }

  return { tables, errors }
}

function extractCreateTableBlocks(sql: string): { name: string; body: string }[] {
  const blocks: { name: string; body: string }[] = []
  const createRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?/gi
  let match: RegExpExecArray | null

  while ((match = createRe.exec(sql)) !== null) {
    const nameInfo = readTableName(sql, match.index + match[0].length)
    if (!nameInfo) continue

    const open = sql.indexOf('(', nameInfo.end)
    if (open === -1) continue
    const close = findMatchingParen(sql, open)
    if (close === -1) continue

    blocks.push({ name: nameInfo.name, body: sql.slice(open + 1, close) })
    createRe.lastIndex = close + 1
  }

  return blocks
}

function readTableName(sql: string, start: number): { name: string; end: number } | null {
  const first = readIdentifier(sql, start)
  if (!first) return null
  let name = first.name
  let end = first.end

  const dot = skipSpace(sql, end)
  if (sql[dot] === '.') {
    const second = readIdentifier(sql, dot + 1)
    if (second) {
      name = second.name
      end = second.end
    }
  }

  return { name: cleanName(name), end }
}

function skipSpace(s: string, idx: number): number {
  while (idx < s.length && /\s/.test(s[idx])) idx++
  return idx
}

function readIdentifier(s: string, start: number): { name: string; end: number } | null {
  let idx = skipSpace(s, start)
  if (idx >= s.length) return null

  const open = s[idx]
  const close = open === '`' ? '`' : open === '"' ? '"' : open === '[' ? ']' : ''
  if (close) {
    const closeIdx = s.indexOf(close, idx + 1)
    const parenIdx = s.indexOf('(', idx + 1)
    if (closeIdx !== -1 && (parenIdx === -1 || closeIdx < parenIdx)) {
      return { name: s.slice(idx + 1, closeIdx), end: closeIdx + 1 }
    }
    const end = parenIdx === -1 ? s.length : parenIdx
    return { name: s.slice(idx + 1, end).trim(), end }
  }

  const match = s.slice(idx).match(/^[^\s(),;]+/)
  return match ? { name: match[0], end: idx + match[0].length } : null
}

function parseTableBody(tableName: string, body: string): SqlTable {
  const columns: SqlColumn[] = []
  const primaryKeys: string[] = []
  const foreignKeys: SqlForeignKey[] = []
  const uniqueKeys: string[][] = []

  // Split by comma, but respect parentheses
  const parts = splitByComma(body)

  for (const part of parts) {
    const trimmed = part.trim()
    if (!trimmed) continue

    // Check for table-level PRIMARY KEY
    const pkMatch = trimmed.match(/^PRIMARY\s+KEY\s*\(([^)]+)\)/i)
    if (pkMatch) {
      const pkCols = pkMatch[1].split(',').map(c => cleanName(c.trim()))
      primaryKeys.push(...pkCols)
      continue
    }

    // Check for FOREIGN KEY
    const parsedFk = parseForeignKey(trimmed)
    if (parsedFk) {
      foreignKeys.push(parsedFk)
      continue
    }

    const fkMatch = trimmed.match(/^(?:CONSTRAINT\s+(?:`[^`]+`|"[^"]+"|\[[^\]]+\]|[^\s]+)\s+)?FOREIGN\s+KEY\s*\(([^)]+)\)\s*REFERENCES\s+((?:`[^`]+`|"[^"]+"|\[[^\]]+\]|[^\s(.`"\[\]]+)(?:\s*\.\s*(?:`[^`]+`|"[^"]+"|\[[^\]]+\]|[^\s(.`"\[\]]+))?)\s*\(([^)]+)\)/i)
    if (fkMatch) {
      const fkCol = cleanName(fkMatch[1].trim())
      const refTable = cleanName(fkMatch[2].trim().split('.').pop() || fkMatch[2].trim())
      const refCol = cleanName(fkMatch[3].trim())
      foreignKeys.push({ column: fkCol, refTable, refColumn: refCol })
      continue
    }

    const uniqueMatch = trimmed.match(/^UNIQUE\s+(?:INDEX|KEY)?\s*(?:`[^`]+`|"[^"]+"|\[[^\]]+\]|[^\s(]+)?\s*\(([^)]+)\)/i)
    if (uniqueMatch) {
      uniqueKeys.push(uniqueMatch[1].split(',').map(c => cleanName(c.trim())))
      continue
    }

    // Check for INDEX, KEY, CHECK constraints (skip)
    if (/^(?:UNIQUE|INDEX|KEY|CHECK|CONSTRAINT)\s/i.test(trimmed)) {
      continue
    }

    const columnName = readIdentifier(trimmed, 0)
    if (columnName) {
      const colName = cleanName(columnName.name)
      const rest = trimmed.slice(columnName.end).trim()
      if (!rest) continue

      // Extract type (first word + optional parenthesized args)
      const typeMatch = rest.match(/^(\w+(?:\s*\([^)]*\))?)/i)
      const colType = typeMatch ? typeMatch[1].toUpperCase() : 'TEXT'

      const isPK = /\bPRIMARY\s+KEY\b/i.test(rest)
      const isNotNull = /\bNOT\s+NULL\b/i.test(rest)

      if (isPK) {
        primaryKeys.push(colName)
      }

      const inlineFk = parseInlineForeignKey(colName, rest)
      if (inlineFk) {
        foreignKeys.push(inlineFk)
      }

      columns.push({
        name: colName,
        type: colType,
        isPrimaryKey: isPK,
        isNotNull,
      })
    }
  }

  // Mark columns that were declared PK at table level
  for (const pk of primaryKeys) {
    const col = columns.find(c => c.name === pk)
    if (col) col.isPrimaryKey = true
  }

  return { name: tableName, columns, primaryKeys, foreignKeys, uniqueKeys }
}

function parseForeignKey(input: string): SqlForeignKey | null {
  let rest = input.trim()
  if (/^CONSTRAINT\s+/i.test(rest)) {
    rest = rest.replace(/^CONSTRAINT\s+/i, '')
    const constraintName = readIdentifier(rest, 0)
    if (!constraintName) return null
    rest = rest.slice(constraintName.end).trim()
  }

  const prefix = rest.match(/^FOREIGN\s+KEY\s*\(([^)]+)\)\s*REFERENCES\s+/i)
  if (!prefix) return null
  const column = cleanName(prefix[1].split(',')[0] || prefix[1])
  rest = rest.slice(prefix[0].length)

  const refTable = readIdentifier(rest, 0)
  if (!refTable) return null
  const afterTable = rest.slice(refTable.end)
  const refCol = afterTable.match(/^\s*\(([^)]+)\)/)
  if (!refCol) return null

  return {
    column,
    refTable: cleanName(refTable.name.split('.').pop() || refTable.name),
    refColumn: cleanName(refCol[1].split(',')[0] || refCol[1]),
  }
}

function parseInlineForeignKey(column: string, input: string): SqlForeignKey | null {
  const refMatch = input.match(/\bREFERENCES\s+/i)
  if (!refMatch || refMatch.index === undefined) return null

  const rest = input.slice(refMatch.index + refMatch[0].length)
  const refTable = readIdentifier(rest, 0)
  if (!refTable) return null

  const afterTable = rest.slice(refTable.end)
  const refCol = afterTable.match(/^\s*\(([^)]+)\)/)
  if (!refCol) return null

  return {
    column,
    refTable: cleanName(refTable.name.split('.').pop() || refTable.name),
    refColumn: cleanName(refCol[1].split(',')[0] || refCol[1]),
  }
}

function cleanName(name: string): string {
  return name.trim().replace(/^[`"\[]+/, '').replace(/[`"\]]+$/, '').trim()
}

function findMatchingParen(text: string, openIndex: number): number {
  let depth = 0
  let quote: string | null = null

  for (let i = openIndex; i < text.length; i++) {
    const ch = text[i]
    const prev = text[i - 1]
    if (quote) {
      if (ch === quote && prev !== '\\') quote = null
      continue
    }
    if (ch === '\'' || ch === '"') {
      quote = ch
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

function splitByComma(body: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''

  for (const ch of body) {
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

// ====== Derive ER relationships from foreign keys ======

const RELATION_LABELS = ['关联', '归属', '包含', '对应', '连接', '引用', '记录', '评价']

export function isJunctionTable(table: SqlTable): boolean {
  return table.foreignKeys.length === 2 && table.columns.length <= 4
}

export function deriveRelationships(tables: SqlTable[]): ERRelationship[] {
  const relationships: ERRelationship[] = []
  const tableNames = new Set(tables.map(t => t.name))
  let labelIdx = 0

  const usedKeys = new Set<string>()

  for (const table of tables) {
    if (isJunctionTable(table)) {
      const [left, right] = table.foreignKeys
      if (left && right && tableNames.has(left.refTable) && tableNames.has(right.refTable) && left.refTable !== right.refTable) {
        relationships.push({
          id: `rel_nm_${table.name}`,
          label: table.name,
          sourceTable: left.refTable,
          targetTable: right.refTable,
          sourceCardinality: 'N',
          targetCardinality: 'M',
        })
        continue
      }
    }

    for (const fk of table.foreignKeys) {
      if (!tableNames.has(fk.refTable)) continue

      const relKey = `${table.name}::${fk.column}::${fk.refTable}::${fk.refColumn}`
      if (usedKeys.has(relKey)) continue
      usedKeys.add(relKey)

      // FK side is N, referenced side is 1
      const label = RELATION_LABELS[labelIdx % RELATION_LABELS.length]
      labelIdx++
      const isUniqueFk = table.primaryKeys.includes(fk.column) || table.uniqueKeys.some(cols => cols.length === 1 && cols[0] === fk.column)

      relationships.push({
        id: `rel_${table.name}_${fk.column}_${fk.refTable}`,
        label,
        sourceTable: fk.refTable,
        targetTable: table.name,
        sourceCardinality: '1',
        targetCardinality: isUniqueFk ? '1' : 'N',
      })
    }
  }

  return relationships
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

export function sqlToERConfig(result: SqlParseResult): {
  nodes: ERNodeConfig[]
  edges: EREdgeConfig[]
  relationships: ERRelationship[]
} {
  const nodes: ERNodeConfig[] = []
  const edges: EREdgeConfig[] = []

  // Create entity nodes
  for (const table of result.tables.filter(table => !isJunctionTable(table))) {
    nodes.push({
      id: `ent_${table.name}`,
      type: 'erEntity',
      label: table.name,
    })
  }

  // Derive and create relationship nodes + edges
  const relationships = deriveRelationships(result.tables)
  for (const rel of relationships) {
    const diamondId = `dia_${rel.id}`
    nodes.push({
      id: diamondId,
      type: 'erDiamond',
      label: rel.label,
    })

    edges.push({
      id: `e_${rel.sourceTable}_${diamondId}`,
      source: `ent_${rel.sourceTable}`,
      target: diamondId,
      sourceCard: rel.sourceCardinality,
      targetCard: '',
    })

    edges.push({
      id: `e_${diamondId}_${rel.targetTable}`,
      source: diamondId,
      target: `ent_${rel.targetTable}`,
      sourceCard: '',
      targetCard: rel.targetCardinality,
    })
  }

  return { nodes, edges, relationships }
}
