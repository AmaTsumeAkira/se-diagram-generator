import dagre from 'dagre'
import type { Node, Edge } from '@xyflow/react'
import type { DiagramNodeData } from '../types/diagram'

// ===== dagre layout (保留) =====
const NODE_WIDTH = 120
const NODE_HEIGHT = 40

export function getLayoutedElements(
  nodes: Node<DiagramNodeData>[],
  edges: Edge[],
  direction: 'TB' | 'LR' = 'TB'
): { nodes: Node<DiagramNodeData>[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: direction, nodesep: 60, ranksep: 80 })

  nodes.forEach((node) => {
    const w = (node.measured?.width ?? node.width ?? NODE_WIDTH) as number
    const h = (node.measured?.height ?? node.height ?? NODE_HEIGHT) as number
    g.setNode(node.id, { width: w, height: h })
  })

  edges.forEach((edge) => g.setEdge(edge.source, edge.target))
  dagre.layout(g)

  const layoutedNodes = nodes.map((node) => {
    const pos = g.node(node.id)
    if (!pos) return node
    return {
      ...node,
      position: {
        x: pos.x - (pos.width as number) / 2,
        y: pos.y - (pos.height as number) / 2,
      },
    }
  })

  return { nodes: layoutedNodes, edges }
}

// ===== 树状层次结构布局 =====

interface TreeLayoutOptions {
  /** 根节点 Y */
  rootY: number
  /** 根节点宽/高 */
  rootW: number
  rootH: number
  /** Level-1 横向矩形宽/高 */
  lv2W: number
  lv2H: number
  /** Level-1 节点 Y */
  lv2Y: number
  /** 子树间最小间隙 */
  subtreeGap: number
  /** Level-2 竖排矩形宽/高 */
  lv3W: number
  lv3H: number
  /** Level-2 节点间隙 (相邻叶子矩形边缘间距) */
  lv3Gap: number
  /** Level-2 节点 Y */
  lv3Y: number
  /** 垂直级间距，用于 step edge offset 计算 */
  levelVSpacing: number
}

const defaultOptions: TreeLayoutOptions = {
  rootY: 20,
  rootW: 200,
  rootH: 30,
  lv2W: 80,
  lv2H: 30,
  lv2Y: 110,
  subtreeGap: 40,
  lv3W: 20,
  lv3H: 110,
  lv3Gap: 26,
  lv3Y: 200,
  levelVSpacing: 60,
}

export function layoutTreeStructure(
  nodes: Node<DiagramNodeData>[],
  edges: Edge[],
  opts: Partial<TreeLayoutOptions> = {}
): { nodes: Node<DiagramNodeData>[]; edges: Edge[] } {
  const o = { ...defaultOptions, ...opts }

  // 构建父子关系
  const childrenMap = new Map<string, string[]>()
  const parentMap = new Map<string, string | null>()

  nodes.forEach((n) => parentMap.set(n.id, null))
  edges.forEach((e) => {
    const list = childrenMap.get(e.source) || []
    list.push(e.target)
    childrenMap.set(e.source, list)
    parentMap.set(e.target, e.source)
  })

  const rootId = nodes.find((n) => parentMap.get(n.id) === null)?.id
  if (!rootId) return { nodes, edges }

  // BFS 分层
  const levels = new Map<string, number>()
  const queue: string[] = [rootId]
  levels.set(rootId, 0)

  while (queue.length > 0) {
    const id = queue.shift()!
    const lv = levels.get(id)!
    ;(childrenMap.get(id) || []).forEach((cid) => {
      levels.set(cid, lv + 1)
      queue.push(cid)
    })
  }

  const levelNodes = new Map<number, string[]>()
  levels.forEach((lv, id) => {
    const list = levelNodes.get(lv) || []
    list.push(id)
    levelNodes.set(lv, list)
  })

  const maxLevel = Math.max(...levelNodes.keys())
  const nodeMap = new Map(nodes.map((n) => [n.id, { ...n, data: { ...n.data } }]))

  const positioned = new Map<string, { x: number; y: number }>()

  // 计算子树宽度 (叶子用 lv3W，其它用 lv2W)
  function calcSubtreeWidth(id: string): number {
    const kids = childrenMap.get(id) || []
    if (kids.length === 0) {
      const lv = levels.get(id) || 0
      return lv >= 2 ? o.lv3W : o.lv2W
    }
    const sum = kids.reduce((s, k) => s + calcSubtreeWidth(k), 0)
    const gaps = (kids.length - 1) * o.lv3Gap
    return Math.max(o.lv2W, sum + gaps)
  }

  // 第 1 层：根据子树宽度分配位置
  const lv1Ids = levelNodes.get(1) || []
  const lv1SubWidths = lv1Ids.map((id) => calcSubtreeWidth(id))
  const lv1TotalW =
    lv1SubWidths.reduce((a, b) => a + b, 0) +
    (lv1Ids.length - 1) * o.subtreeGap

  // 动态计算根节点 X，使其居中对齐整棵树
  const rootX = lv1TotalW / 2
  positioned.set(rootId, { x: rootX - o.rootW / 2, y: o.rootY })

  let currentX = 0
  lv1Ids.forEach((id, i) => {
    const sw = lv1SubWidths[i]
    const x = currentX + sw / 2 - o.lv2W / 2
    positioned.set(id, { x, y: o.lv2Y })
    currentX += sw + o.subtreeGap
  })

  // 第 2 层+：分组排在父节点下方
  for (let lv = 2; lv <= maxLevel; lv++) {
    const ids = levelNodes.get(lv) || []

    const groups = new Map<string, string[]>()
    ids.forEach((id) => {
      const p = parentMap.get(id)
      if (!p) return
      const list = groups.get(p) || []
      list.push(id)
      groups.set(p, list)
    })

    groups.forEach((childIds, parentId) => {
      const parentPos = positioned.get(parentId)
      if (!parentPos) return

      const parentW = lv === 2 ? o.lv2W : o.lv3W
      const totalW =
        childIds.length * o.lv3W + (childIds.length - 1) * o.lv3Gap
      const startX = parentPos.x + parentW / 2 - totalW / 2

      childIds.forEach((cid, j) => {
        const x = startX + j * (o.lv3W + o.lv3Gap)
        const nd = nodeMap.get(cid)
        if (nd) nd.data = { ...nd.data, vertical: true }
        positioned.set(cid, {
          x,
          y: lv === 2 ? o.lv3Y : o.lv3Y + (lv - 2) * (o.lv3H + o.levelVSpacing),
        })
      })
    })
  }

  const layoutedNodes = nodes.map((n) => {
    const pos = positioned.get(n.id)
    const nd = nodeMap.get(n.id)
    if (!pos) return n
    return { ...(nd || n), position: pos }
  })

  // 统一 step edge offset：所有边用相同 offset，水平段对齐在同一高度
  const styledEdges = edges.map((e) => ({
    ...e,
    type: 'step' as const,
    pathOptions: { offset: o.levelVSpacing / 2 } as { offset?: number },
    style: { stroke: '#000', strokeWidth: 1 },
  }))

  return { nodes: layoutedNodes, edges: styledEdges }
}
