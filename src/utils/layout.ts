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
  lv2Y: 100,
  subtreeGap: 40,
  lv3W: 20,
  lv3H: 110,
  lv3Gap: 26,
  lv3Y: 175,
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
  const parentMap = new Map<string, string[]>()

  nodes.forEach((n) => parentMap.set(n.id, []))
  edges.forEach((e) => {
    const list = childrenMap.get(e.source) || []
    list.push(e.target)
    childrenMap.set(e.source, list)
    const parents = parentMap.get(e.target) || []
    parents.push(e.source)
    parentMap.set(e.target, parents)
  })

  // 支持多根（森林）
  const rootIds = nodes.filter((n) => (parentMap.get(n.id) || []).length === 0).map((n) => n.id)
  if (rootIds.length === 0) return { nodes, edges }

  // BFS 分层（带已访问检查）
  const levels = new Map<string, number>()
  const queue: string[] = [...rootIds]
  rootIds.forEach((id) => levels.set(id, 0))

  while (queue.length > 0) {
    const id = queue.shift()!
    const lv = levels.get(id)!
    ;(childrenMap.get(id) || []).forEach((cid) => {
      if (!levels.has(cid)) {
        levels.set(cid, lv + 1)
        queue.push(cid)
      }
    })
  }

  const levelNodes = new Map<number, string[]>()
  levels.forEach((lv, id) => {
    const list = levelNodes.get(lv) || []
    list.push(id)
    levelNodes.set(lv, list)
  })

  const maxLevel = levelNodes.size > 0 ? Math.max(...levelNodes.keys()) : 0
  const nodeMap = new Map(nodes.map((n) => [n.id, { ...n, data: { ...n.data } }]))

  // 读取第一个根节点的设置参数
  const rootNd = nodeMap.get(rootIds[0])
  const userFontSize = (rootNd?.data?.fontSize as number) || 14
  const userFontFamily = (rootNd?.data?.fontFamily as string) || 'SimSun'
  const userSpacing = (rootNd?.data?.spacing as number) || 26
  if (userSpacing !== o.lv3Gap) o.lv3Gap = userSpacing
  const ls = Math.max(1, userFontSize * 0.15)
  const charPx = userFontSize + ls  // 竖排字高 = 字号 + 字间距
  // 根据字号调整节点尺寸
  o.lv3W = Math.max(18, Math.round(userFontSize * 1.2))
  const padV = Math.round(userFontSize * 0.4)
  o.lv2H = userFontSize + padV * 2 + 2
  o.rootH = o.lv2H

  // 根据功能节点最长文字动态计算竖排矩形高度
  let funcMaxChars = 0
  for (let lv = 2; lv <= maxLevel; lv++) {
    (levelNodes.get(lv) || []).forEach((id) => {
      const nd = nodeMap.get(id)
      if (nd) {
        nd.data = { ...nd.data, fontSize: userFontSize, fontFamily: userFontFamily }
        funcMaxChars = Math.max(funcMaxChars, String(nd.data.label || '').length)
      }
    })
  }
  if (funcMaxChars > 0) o.lv3H = Math.max(50, funcMaxChars * charPx + 8)
  // 所有节点设置 fontSize + 横排节点统一高度
  const padH = Math.round(userFontSize * 1.1)
  const textW = (s: string) => { let w = 0; for (const ch of s) w += ch.charCodeAt(0) > 127 ? userFontSize : userFontSize * 0.6; return Math.ceil(w) }
  let maxRootW = o.rootW; let maxLv2W = o.lv2W
  nodeMap.forEach((nd, id) => {
    const lv = levels.get(id)
    if (lv === undefined) return
    nd.data = { ...nd.data, fontSize: userFontSize, fontFamily: userFontFamily }
    if (lv === 0) { nd.data.nodeH = o.rootH; nd.data.nodeW = textW(String(nd.data.label)) + padH * 2; maxRootW = Math.max(maxRootW, nd.data.nodeW as number) }
    else if (lv === 1) { nd.data.nodeH = o.lv2H; nd.data.nodeW = textW(String(nd.data.label)) + padH * 2; maxLv2W = Math.max(maxLv2W, nd.data.nodeW as number) }
  })
  o.rootW = maxRootW; o.lv2W = maxLv2W

  const positioned = new Map<string, { x: number; y: number }>()

  // 计算子树宽度 (叶子用 lv3W，其它用 lv2W) - 带环检测
  const calcVisited = new Set<string>()
  function calcSubtreeWidth(id: string): number {
    if (calcVisited.has(id)) return o.lv3W
    calcVisited.add(id)
    const kids = childrenMap.get(id) || []
    if (kids.length === 0) {
      const lv = levels.get(id) || 0
      calcVisited.delete(id)
      return lv >= 2 ? o.lv3W : o.lv2W
    }
    const sum = kids.reduce((s, k) => s + calcSubtreeWidth(k), 0)
    const gaps = (kids.length - 1) * o.lv3Gap
    calcVisited.delete(id)
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
  const rootNd2 = nodeMap.get(rootIds[0])
  const rw = (rootNd2?.data?.nodeW as number) || o.rootW
  positioned.set(rootIds[0], { x: rootX - rw / 2, y: o.rootY })

  let currentX = 0
  lv1Ids.forEach((id, i) => {
    const sw = lv1SubWidths[i]
    const nd = nodeMap.get(id)
    const w = (nd?.data?.nodeW as number) || o.lv2W
    const x = currentX + sw / 2 - w / 2
    positioned.set(id, { x, y: o.lv2Y })
    currentX += sw + o.subtreeGap
  })

  // 第 2 层+：分组排在父节点下方
  for (let lv = 2; lv <= maxLevel; lv++) {
    const ids = levelNodes.get(lv) || []

    const groups = new Map<string, string[]>()
    ids.forEach((id) => {
      const parents = parentMap.get(id) || []
      if (parents.length === 0) return
      const p = parents[0]
      const list = groups.get(p) || []
      list.push(id)
      groups.set(p, list)
    })

    groups.forEach((childIds, parentId) => {
      const parentPos = positioned.get(parentId)
      if (!parentPos) return

      const parentNd = nodeMap.get(parentId)
      const parentW = lv === 2 ? ((parentNd?.data?.nodeW as number) || o.lv2W) : o.lv3W
      const totalW =
        childIds.length * o.lv3W + (childIds.length - 1) * o.lv3Gap
      const startX = parentPos.x + parentW / 2 - totalW / 2

      childIds.forEach((cid, j) => {
        const x = startX + j * (o.lv3W + o.lv3Gap)
        const nd = nodeMap.get(cid)
        if (nd) nd.data = { ...nd.data, vertical: true, nodeH: o.lv3H }
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

  // 自定义 StructureEdge：步进折线，同一父节点所有子边水平段精确对齐
  const styledEdges = edges.map((e) => ({
    ...e,
    type: 'structure',
    style: { stroke: '#000', strokeWidth: 1 },
  }))

  return { nodes: layoutedNodes, edges: styledEdges }
}

/**
 * 流程图分层（活动图用）：从 start 出发 BFS 求每个节点的层号。
 *
 * 关键点：已经分过层的节点不再改动 —— 像「重新派单 → 上门维修」这种回边会让 BFS
 * 回到浅层节点，若允许覆盖就会在环上无限循环。回边保持原层由图形库自己绕行。
 *
 * drawio 导出与 SVG 导出共用这一份实现，避免两处排版算法各写一套、行为不一致。
 */
export function rankOfFlow(
  nodes: { id: string; type?: string }[],
  edges: { source: string; target: string }[],
): Map<string, number> {
  const adj = new Map<string, string[]>(nodes.map((n) => [n.id, []]))
  for (const e of edges) {
    const list = adj.get(e.source)
    if (list && adj.has(e.target)) list.push(e.target)
  }
  const rank = new Map<string, number>()
  const queue: string[] = nodes.filter((n) => n.type === 'start').map((n) => n.id)
  if (!queue.length && nodes.length) queue.push(nodes[0].id)
  queue.forEach((id) => rank.set(id, 0))
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head]
    const next = (rank.get(cur) ?? 0) + 1
    for (const nx of adj.get(cur) || []) {
      if (rank.has(nx)) continue
      rank.set(nx, next)
      queue.push(nx)
    }
  }
  // 未与 start 连通的节点排在最后
  let maxRank = 0
  rank.forEach((r) => {
    if (r > maxRank) maxRank = r
  })
  nodes.forEach((n) => {
    if (!rank.has(n.id)) rank.set(n.id, maxRank + 1)
  })
  return rank
}

export interface LayeredItem {
  id: string
  w: number
  h: number
}

/**
 * 分层布局（类图用）：把"被依赖方"放上层、依赖方放下层。
 *
 * 类图里箭头指向被依赖的一方（子类 → 父类、实现类 → 接口、使用方 → 被使用方），
 * 所以层号取"沿出边走到汇点的最长路径"：汇点（没人可依赖的基础类/接口）在第 0 层，
 * 越往下越是具体的业务类 —— 这正是类图习惯的阅读顺序，继承箭头也自然朝上。
 *
 * 之后做一轮重心排序（层内按上一层邻居的平均位置排），最后每层横向居中。
 * 原来的 sqrt 网格会让关系线长距离斜穿整张图，标签也会被框压住。
 */
export function layeredLayoutOf(
  nodes: LayeredItem[],
  edges: { source: string; target: string }[],
  opts: {
    hGap?: number
    vGap?: number
    startX?: number
    startY?: number
    /**
     * 参与"定层"的边（缺省表示全部）。类图应只传继承/实现边：
     * 关联/依赖只影响层内排序 —— 否则一条 业主 → 维修评价 → 报修单 → 设施 的依赖链
     * 会把子类压到最底层，拉出几百像素的长斜线。
     */
    rankEdges?: { source: string; target: string }[]
  } = {},
): Map<string, { x: number; y: number }> {
  const hGap = opts.hGap ?? 60
  const vGap = opts.vGap ?? 90
  const startX = opts.startX ?? 100
  const startY = opts.startY ?? 60

  const rankEdges = (opts.rankEdges && opts.rankEdges.length ? opts.rankEdges : edges).filter(
    (e) => e.source !== e.target,
  )

  // 层内排序用的（全部）邻接
  const inn = new Map<string, string[]>(nodes.map((n) => [n.id, []]))
  for (const e of edges) {
    if (e.source === e.target) continue
    if (inn.has(e.source) && inn.has(e.target)) inn.get(e.target)!.push(e.source)
  }

  // 定层用的（只含 rankEdges）邻接
  const rankOut = new Map<string, string[]>(nodes.map((n) => [n.id, []]))
  const touched = new Set<string>()
  for (const e of rankEdges) {
    if (rankOut.has(e.source) && rankOut.has(e.target)) {
      rankOut.get(e.source)!.push(e.target)
      touched.add(e.source)
      touched.add(e.target)
    }
  }

  // 层号 = 沿 rankEdges 到汇点的最长路径（DFS + 记忆化；环上不死循环）
  const rank = new Map<string, number>()
  const visiting = new Set<string>()
  const rankOf = (id: string): number => {
    const cached = rank.get(id)
    if (cached !== undefined) return cached
    if (visiting.has(id)) return 0
    visiting.add(id)
    let r = 0
    for (const nx of rankOut.get(id) || []) r = Math.max(r, rankOf(nx) + 1)
    visiting.delete(id)
    rank.set(id, r)
    return r
  }
  nodes.forEach((n) => rankOf(n.id))

  // 不参与继承/实现的类（如报修单/设施）统一排到继承层次之下，
  // 而不是跟基础类一起挤在第 0 层
  const hierarchyNodes = nodes.filter((n) => touched.has(n.id))
  if (hierarchyNodes.length && hierarchyNodes.length < nodes.length) {
    const maxHier = Math.max(...hierarchyNodes.map((n) => rank.get(n.id) ?? 0))
    nodes.forEach((n) => {
      if (!touched.has(n.id)) rank.set(n.id, maxHier + 1)
    })
  }

  // 层内排序：按上一层邻居的平均 x 位置（重心）迭代两轮
  const byRank = new Map<number, LayeredItem[]>()
  nodes.forEach((n) => {
    const r = rank.get(n.id) ?? 0
    const list = byRank.get(r)
    if (list) list.push(n)
    else byRank.set(r, [n])
  })
  const ranks = [...byRank.keys()].sort((a, b) => a - b)
  const orderIndex = new Map<string, number>()
  for (const r of ranks) {
    const list = byRank.get(r)!
    list.forEach((n, i) => orderIndex.set(n.id, i))
  }
  for (let pass = 0; pass < 2; pass++) {
    for (const r of ranks) {
      const list = byRank.get(r)!
      const bary = new Map<string, number>()
      list.forEach((n) => {
        const prev = inn.get(n.id) || []
        const vals = prev.map((p) => orderIndex.get(p)).filter((v): v is number => v !== undefined)
        bary.set(n.id, vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : orderIndex.get(n.id) ?? 0)
      })
      list.sort((a, b) => (bary.get(a.id) ?? 0) - (bary.get(b.id) ?? 0))
      list.forEach((n, i) => orderIndex.set(n.id, i))
    }
  }

  // 计算每层的行高与行宽，逐层横向居中
  const rowInfo = new Map<number, { y: number; items: LayeredItem[]; width: number }>()
  let cursorY = startY
  const maxRowWidth = Math.max(
    ...ranks.map((r) => byRank.get(r)!.reduce((acc, n) => acc + n.w, 0) + Math.max(0, byRank.get(r)!.length - 1) * hGap),
    1,
  )
  for (const r of ranks) {
    const list = byRank.get(r)!
    const rowH = Math.max(...list.map((n) => n.h))
    const rowW = list.reduce((acc, n) => acc + n.w, 0) + Math.max(0, list.length - 1) * hGap
    rowInfo.set(r, { y: cursorY, items: list, width: rowW })
    cursorY += rowH + vGap
  }

  const pos = new Map<string, { x: number; y: number }>()
  for (const r of ranks) {
    const info = rowInfo.get(r)!
    let x = startX + (maxRowWidth - info.width) / 2
    for (const n of info.items) {
      pos.set(n.id, { x: Math.round(x), y: Math.round(info.y) })
      x += n.w + hGap
    }
  }
  return pos
}
