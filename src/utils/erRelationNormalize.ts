import type { Edge, Node } from '@xyflow/react'
import type { DiagramNodeData } from '../types/diagram'

/**
 * ER 图关系补全（编辑器 / MCP / HTTP 桥接共用一份实现）
 *
 * 背景：ER 图的排版与寻线引擎（src/utils/erRouting.ts 的 collectERRelations）只从
 * erDiamond 节点推导关系；直接在实体之间连边（entity ↔ entity）会被完全忽略 ——
 * SVG 里只剩实体框，没有联系线和基数标注。
 *
 * 编辑器自己的 ER 配置一直是「实体 → 菱形 → 实体」三段式，但外部导入 / MCP / HTTP
 * 桥接传进来的数据往往是最直白的 entity ↔ entity 直连边。这里把直连边就地改写成
 * 三段式（保留 label 作为联系名、sourceCard/targetCard 作为两端基数），
 * 让外部输入与编辑器内部格式一致。
 *
 * 幂等：没有直连边时原样返回；已存在菱形的关系不动。
 */
export function normalizeErRelations<T extends { nodes: Node<DiagramNodeData>[]; edges: Edge[] }>(cfg: T): T {
  const nodes = Array.isArray(cfg?.nodes) ? cfg.nodes : []
  const edges = Array.isArray(cfg?.edges) ? cfg.edges : []
  const entityIds = new Set(nodes.filter((n) => n.type === 'erEntity').map((n) => n.id))
  if (entityIds.size === 0) return cfg

  const direct = edges.filter((e) => entityIds.has(String(e.source)) && entityIds.has(String(e.target)))
  if (direct.length === 0) return cfg

  const keptEdges = edges.filter((e) => !direct.includes(e))
  const addedNodes: Node<DiagramNodeData>[] = []
  const addedEdges: Edge[] = []

  direct.forEach((edge, index) => {
    const relId = String(edge.id || `rel_${index + 1}`).replace(/[^a-zA-Z0-9_]/g, '_')
    const diamondId = `dia_${relId}`
    const data = (edge.data ?? {}) as Record<string, unknown>
    const srcCard = (data.sourceCard as string) || '1'
    const tgtCard = (data.targetCard as string) || 'N'
    const label = typeof edge.label === 'string' && edge.label.trim() ? edge.label : '关联'
    addedNodes.push({
      id: diamondId,
      type: 'erDiamond',
      data: { label },
      position: { x: 0, y: 0 },
    })
    addedEdges.push(
      { id: `e_${diamondId}_in`, source: String(edge.source), target: diamondId, data: { sourceCard: srcCard } },
      { id: `e_${diamondId}_out`, source: diamondId, target: String(edge.target), data: { targetCard: tgtCard } },
    )
  })

  return {
    ...cfg,
    nodes: [...nodes, ...addedNodes],
    edges: [...keptEdges, ...addedEdges],
  }
}
