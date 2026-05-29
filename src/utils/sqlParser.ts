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

  // Normalize line endings
  const normalized = sql.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  // Match CREATE TABLE blocks
  const createTableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"[\]]?(\w+)[`"\].]?(?:\s*\.\s*[`"[\]]?(\w+)[`"\]]?)?\s*\(([\s\S]*?)\)\s*(?:ENGINE\s*=\s*\w+)?(?:\s*(?:DEFAULT\s+)?(?:CHARSET|CHARACTER\s+SET)\s*=?\s*\w+)?(?:\s*COLLATE\s*=?\s*\w+)?(?:\s*COMMENT\s*=?\s*'[^']*')?(?:\s*AUTO_INCREMENT\s*=?\s*\d+)?\s*;?/gi

  let match: RegExpExecArray | null
  while ((match = createTableRegex.exec(normalized)) !== null) {
    try {
      // Use the last captured group as the table name (handles schema.table)
      const tableName = match[2] || match[1]
      const body = match[3]
      const table = parseTableBody(tableName, body)
      tables.push(table)
    } catch (e) {
      errors.push(`解析表 "${match[1]}" 失败: ${(e as Error).message}`)
    }
  }

  if (tables.length === 0 && sql.trim().length > 0) {
    errors.push('未找到有效的 CREATE TABLE 语句')
  }

  return { tables, errors }
}

function parseTableBody(tableName: string, body: string): SqlTable {
  const columns: SqlColumn[] = []
  const primaryKeys: string[] = []
  const foreignKeys: SqlForeignKey[] = []

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
    const fkMatch = trimmed.match(/^(?:CONSTRAINT\s+[`"[\]]?\w+[`"\]]?\s+)?FOREIGN\s+KEY\s*\(([^)]+)\)\s*REFERENCES\s+[`"[\]]?(\w+)[`"\]]?\s*\(([^)]+)\)/i)
    if (fkMatch) {
      const fkCol = cleanName(fkMatch[1].trim())
      const refTable = cleanName(fkMatch[2].trim())
      const refCol = cleanName(fkMatch[3].trim())
      foreignKeys.push({ column: fkCol, refTable, refColumn: refCol })
      continue
    }

    // Check for UNIQUE, INDEX, KEY, CHECK constraints (skip)
    if (/^(?:UNIQUE|INDEX|KEY|CHECK|CONSTRAINT)\s/i.test(trimmed)) {
      continue
    }

    // Parse column definition
    const colMatch = trimmed.match(/^[`"[\]]?(\w+)[`"\]]?\s+(\w+(?:\s*\([^)]*\))?(?:\s+\w+)*)/i)
    if (colMatch) {
      const colName = cleanName(colMatch[1])
      const rest = colMatch[2]

      // Extract type (first word + optional parenthesized args)
      const typeMatch = rest.match(/^(\w+(?:\s*\([^)]*\))?)/i)
      const colType = typeMatch ? typeMatch[1].toUpperCase() : 'TEXT'

      const isPK = /\bPRIMARY\s+KEY\b/i.test(rest)
      const isNotNull = /\bNOT\s+NULL\b/i.test(rest)

      if (isPK) {
        primaryKeys.push(colName)
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

  return { name: tableName, columns, primaryKeys, foreignKeys }
}

function cleanName(name: string): string {
  return name.replace(/[`"[\]]/g, '').trim()
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

const RELATION_LABELS = ['关联', '所属', '包含', '对应', '关系', '连接', '引用', '归属']

export function deriveRelationships(tables: SqlTable[]): ERRelationship[] {
  const relationships: ERRelationship[] = []
  const tableNames = new Set(tables.map(t => t.name))
  let labelIdx = 0

  // Track used relationship pairs to avoid duplicates
  const usedPairs = new Set<string>()

  for (const table of tables) {
    for (const fk of table.foreignKeys) {
      if (!tableNames.has(fk.refTable)) continue

      const pairKey = [table.name, fk.refTable].sort().join('::')
      if (usedPairs.has(pairKey)) continue
      usedPairs.add(pairKey)

      // FK side is N, referenced side is 1
      const label = RELATION_LABELS[labelIdx % RELATION_LABELS.length]
      labelIdx++

      relationships.push({
        id: `rel_${table.name}_${fk.refTable}`,
        label,
        sourceTable: fk.refTable,
        targetTable: table.name,
        sourceCardinality: '1',
        targetCardinality: 'N',
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
  for (const table of result.tables) {
    nodes.push({
      id: `ent_${table.name}`,
      type: 'erEntity',
      label: table.name,
    })
  }

  // Derive and create relationship nodes + edges
  const relationships = deriveRelationships(result.tables)
  for (const rel of relationships) {
    const diamondId = `dia_${rel.sourceTable}_${rel.targetTable}`
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
