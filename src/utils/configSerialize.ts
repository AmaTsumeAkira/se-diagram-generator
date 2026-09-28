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
    // 形状校验：必须是对象，且至少含一个图表类型的键。
    // 否则（例如单图 `{nodes,edges}`、空对象 `{}`、数组）返回 null，
    // 由调用方提示「JSON 格式不正确」，不再静默把 8 张图全部清空。
    if (!flat || typeof flat !== 'object' || Array.isArray(flat)) return null
    if (!TAB_KEYS.some((key) => flat[key] !== undefined)) return null

    const configs = {} as Record<DiagramType, ConfigLike>
    for (const key of TAB_KEYS) {
      configs[key] = flat[key] ? parseDiagram(JSON.stringify(flat[key])) : { nodes: [], edges: [] }
      // 读入时归一化，避免历史/导入数据里"同一个子节点被多个父级引用"而膨胀
      if (key === 'usecase') configs[key] = normalizeUseCaseConfig(configs[key])
      if (key === 'entity') configs[key] = normalizeEntityConfig(configs[key])
    }
    return configs
  } catch { return null }
}

/**
 * 用例图配置归一化 —— 项目里**不存在「共享用例」**：每个角色各自持有自己的用例节点，
 * id 全局唯一，编辑 / 删除 / 排序互不影响（方案 B）。
 *
 * 归一化规则：
 * - 角色按原顺序输出；每个角色的用例**按该角色的关联边顺序**输出（顺序即左侧列表顺序）；
 * - 同一角色内对同一个用例的重复引用只保留第一条；
 * - 同一用例 id 被多个角色引用时，从第二个角色起派生独立 id（`原id__角色id`），
 *   这样历史遗留的"共享"配置以及已经膨胀出重复节点的配置都会被就地修好；
 * - 没有任何角色引用的节点与边原样保留，不静默丢数据。
 *
 * 已归一化的配置再次传入结果不变（幂等），因此可以放心地在载入 / 应用时调用。
 */
export function normalizeUseCaseConfig(cfg: ConfigLike): ConfigLike {
  const nodes = Array.isArray(cfg?.nodes) ? cfg.nodes : []
  const edges = Array.isArray(cfg?.edges) ? cfg.edges : []

  // 同一个 id 出现多份时以第一份为准（膨胀数据里的副本直接丢弃）
  const firstById = new Map<string, Node<DiagramNodeData>>()
  for (const n of nodes) if (!firstById.has(n.id)) firstById.set(n.id, n)

  const actors: Node<DiagramNodeData>[] = []
  const actorIds = new Set<string>()
  for (const n of nodes) {
    if (n.type !== 'actor' || actorIds.has(n.id)) continue
    actorIds.add(n.id)
    actors.push(n)
  }

  const usedIds = new Set<string>(actorIds)
  const outNodes: Node<DiagramNodeData>[] = []
  const outEdges: Edge[] = []
  const consumedEdge = new Set<number>()

  for (const actor of actors) {
    outNodes.push(actor)
    const seenTargets = new Set<string>()
    edges.forEach((e, i) => {
      if (consumedEdge.has(i) || String(e.source) !== actor.id) return
      const src = firstById.get(String(e.target))
      if (!src || src.type !== 'usecase') return
      consumedEdge.add(i)
      if (seenTargets.has(src.id)) return
      seenTargets.add(src.id)

      let id = src.id
      if (usedIds.has(id)) {
        let k = 1
        let candidate = `${src.id}__${actor.id}`
        while (usedIds.has(candidate)) candidate = `${src.id}__${actor.id}_${++k}`
        id = candidate
      }
      usedIds.add(id)
      outNodes.push(id === src.id ? src : { ...src, id })
      outEdges.push({ ...e, target: id })
    })
  }

  // 未被任何角色引用的节点 / 边原样保留（例如导入数据里的未关联用例）
  const emitted = new Set(outNodes.map((n) => n.id))
  for (const n of nodes) {
    if (emitted.has(n.id)) continue
    emitted.add(n.id)
    outNodes.push(n)
  }
  edges.forEach((e, i) => { if (!consumedEdge.has(i)) outEdges.push(e) })

  return { nodes: outNodes, edges: outEdges }
}

/**
 * 实体属性图配置归一化 —— 与用例图同源的问题：一个属性（ellipse）被多个实体引用时，
 * 「配置（一个属性一个节点）」与「编辑态（每个实体一份属性清单）」互转会交叉放大
 * （实测每次「应用修改」节点数翻倍）。
 *
 * 规则与 normalizeUseCaseConfig 完全一致：按实体出边顺序收集属性、同实体内重复引用只留第一条、
 * 同一属性 id 被多个实体引用时从第二个实体起派生 `${attrId}__${entityId}`；
 * 未被任何实体引用的节点/边原样保留（编辑器里有「未关联属性」区块可管理）。
 */
export function normalizeEntityConfig(cfg: ConfigLike): ConfigLike {
  const nodes = Array.isArray(cfg?.nodes) ? cfg.nodes : []
  const edges = Array.isArray(cfg?.edges) ? cfg.edges : []

  const firstById = new Map<string, Node<DiagramNodeData>>()
  for (const n of nodes) if (!firstById.has(n.id)) firstById.set(n.id, n)

  const entities: Node<DiagramNodeData>[] = []
  const entityIds = new Set<string>()
  for (const n of nodes) {
    if (n.type !== 'rectangle' || entityIds.has(n.id)) continue
    entityIds.add(n.id)
    entities.push(n)
  }

  const usedIds = new Set<string>(entityIds)
  const outNodes: Node<DiagramNodeData>[] = []
  const outEdges: Edge[] = []
  const consumedEdge = new Set<number>()

  for (const entity of entities) {
    outNodes.push(entity)
    const seenTargets = new Set<string>()
    edges.forEach((e, i) => {
      if (consumedEdge.has(i) || String(e.source) !== entity.id) return
      const src = firstById.get(String(e.target))
      if (!src || src.type !== 'ellipse') return
      consumedEdge.add(i)
      if (seenTargets.has(src.id)) return
      seenTargets.add(src.id)

      let id = src.id
      if (usedIds.has(id)) {
        let k = 1
        let candidate = `${src.id}__${entity.id}`
        while (usedIds.has(candidate)) candidate = `${src.id}__${entity.id}_${++k}`
        id = candidate
      }
      usedIds.add(id)
      outNodes.push(id === src.id ? src : { ...src, id })
      outEdges.push({ ...e, target: id })
    })
  }

  const emitted = new Set(outNodes.map((n) => n.id))
  for (const n of nodes) {
    if (emitted.has(n.id)) continue
    emitted.add(n.id)
    outNodes.push(n)
  }
  edges.forEach((e, i) => { if (!consumedEdge.has(i)) outEdges.push(e) })

  return { nodes: outNodes, edges: outEdges }
}
