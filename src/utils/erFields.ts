import type { ERField } from '../types/diagram'
import type { SqlTable } from './sqlParser'

/**
 * ER 字段的文本表示（编辑器与 AI 结果共用一套格式）：
 *   每行一个字段：`字段名 类型 [PK] [FK] [-- 注释]`
 * 例：`user_id INT PK -- 主键`
 */
export function parseFieldsText(text: string): ERField[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [head, ...commentParts] = line.split(/\s+--\s+|\s+\/\/\s+/)
      const tokens = head.trim().split(/\s+/).filter(Boolean)
      const name = tokens.shift() || ''
      const flags = new Set<string>()
      const rest: string[] = []
      for (const tk of tokens) {
        const up = tk.toUpperCase()
        if (up === 'PK' || up === 'PRIMARY') flags.add('pk')
        else if (up === 'FK' || up === 'FOREIGN') flags.add('fk')
        else rest.push(tk)
      }
      const field: ERField = { name }
      const type = rest.join(' ')
      if (type) field.type = type
      if (flags.has('pk')) field.pk = true
      if (flags.has('fk')) field.fk = true
      const comment = commentParts.join(' ').trim()
      if (comment) field.comment = comment
      return field
    })
    .filter((f) => f.name)
}

/** ERField[] → 文本（每行一个字段） */
export function fieldsToText(fields?: ERField[]): string {
  return (fields || [])
    .map((f) =>
      [f.name, f.type, f.pk ? 'PK' : '', f.fk ? 'FK' : '', f.comment ? `-- ${f.comment}` : '']
        .filter(Boolean)
        .join(' '),
    )
    .join('\n')
}

/** 是否所有字段都没有子类型信息（用于判断能不能从别处补） */
export function hasFieldType(fields?: ERField[]): boolean {
  return !!fields && fields.some((f) => !!f.type)
}

/**
 * 从 SQL 表结构生成 ER 实体字段（供"字段环绕"/"表格型"表示法使用）。
 * 外键列标 FK、主键列标 PK，列注释作为字段说明。
 */
export function fieldsFromTable(table: SqlTable): ERField[] | undefined {
  if (!table.columns.length) return undefined
  const fkCols = new Set(table.foreignKeys.flatMap((f) => f.column.split(',').map((c) => c.trim())))
  return table.columns.map((c) => {
    const field: ERField = { name: c.name }
    if (c.type) field.type = c.type
    if (c.isPrimaryKey) field.pk = true
    if (fkCols.has(c.name)) field.fk = true
    if (c.comment) field.comment = c.comment
    return field
  })
}
