import type { Node, Edge } from '@xyflow/react'
import type { DiagramNodeData, DiagramType } from '../types/diagram'

/**
 * 图表配置的序列化 / 反序列化（唯一实现）
 *
 * 背景：此前 App.tsx 的 `configsToJson`（localStorage 持久化）与
 * ExportDataModal 内的 JSON 导出各自维护了一份「字段白名单」，
 * 两份都漏掉了 ER 图的绝对坐标 `x` / `y`，导致：
 *   - 刷新页面后总体 ER 图从手工排布退化为自动网格；
 *   - 「导出全部数据」→ 重新导入后同样丢失布局。
 *
 * 因此这里改为「排除式」：node.data 里除内部字段外一律序列化。
 * 以后给 DiagramNodeData 增加新字段时无需再改这里 —— 不会再漏。
 */

/** 不参与序列化的 data 字段（label 单独提到顶层） */
const INTERNAL_DATA_KEYS = new Set(['label'])

export interface SerializedDiagram {
  nodes: Record<string, unknown>[]
  edges: Record<string, unknown>[]
}

export interface ConfigLike {
  nodes: Node<DiagramNodeData>[]
  edges: Edge[]
}

function serializeNode(n: Node<DiagramNodeData>): Record<string, unknown> {
  const data = (n.data || {}) as Record<string, unknown>
  const out: Record<string, unknown> = { id: n.id, type: n.type, label: data.label }
  for (const [key, value] of Object.entries(data)) {
    if (INTERNAL_DATA_KEYS.has(key)) continue
    if (value === undefined) continue
    out[key] = value
  }
  return out
}

function serializeEdge(e: Edge): Record<string, unknown> {
  const out: Record<string, unknown> = { id: e.id, source: e.source, target: e.target }
  if (e.data) out.data = e.data
  if (e.label) out.label = e.label
  return out
}

export function serializeDiagram(cfg: ConfigLike): SerializedDiagram {
  return {
    nodes: cfg.nodes.map(serializeNode),
    edges: cfg.edges.map(serializeEdge),
  }
}

/** 全量配置 → JSON（localStorage 持久化 与「导出全部数据」共用） */
export function configsToJson(configs: Record<string, ConfigLike>): string {
  const flat: Record<string, SerializedDiagram> = {}
  for (const [key, cfg] of Object.entries(configs)) {
    if (!cfg) continue
    flat[key] = serializeDiagram(cfg)
  }
  return JSON.stringify(flat, null, 2)
}

// ====== 反序列化（导入 / 持久化恢复） ======

/** 全部图表类型，顺序即工具栏标签顺序 */
export const TAB_KEYS: DiagramType[] = [
  'usecase', 'structure', 'entity', 'er', 'sequence', 'class', 'activity', 'deployment',
]

/** 单张图的平面 JSON → 运行时配置 */
export function parseDiagram(text: string): ConfigLike {
  const data = JSON.parse(text)
  const nodes: Node<DiagramNodeData>[] = (data.nodes || []).map((n: any) => {
    // 除 id / type 外的字段整体保留（排除式）：读入侧此前是白名单，
    // 任何新增字段（例如 ER 图的 fields）都会在"写盘 → 读回"之间被静默丢掉。
    const { id: rawId, type: rawType, ...rest } = n || {}
    return {
      id: String(rawId),
      type: rawType ?? 'rectangle',
      data: { ...rest, label: String(rest.label ?? rawId) } as DiagramNodeData,
      position: { x: 0, y: 0 },
    }
  })
  const edges: Edge[] = (data.edges || []).map((e: any, i: number) => ({
    id: e.id ?? `edge_${i}`,
    source: String(e.source),
    target: String(e.target),
    ...(e.data && { data: e.data }),
    ...(e.label && { label: e.label }),
  }))
  return { nodes, edges }
}

/** 全量 JSON → ConfigMap（每张图独立空配置，避免共享同一对象） */
export function jsonToConfigs(json: string): Record<DiagramType, ConfigLike> | null {
  try {
    const flat = JSON.parse(json)
    const configs = {} as Record<DiagramType, ConfigLike>
    for (const key of TAB_KEYS) {
      configs[key] = flat[key] ? parseDiagram(JSON.stringify(flat[key])) : { nodes: [], edges: [] }
    }
    return configs
  } catch { return null }
}
