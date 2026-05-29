import type { Node, Edge } from '@xyflow/react'
import type { DiagramNodeData, DiagramType } from '../types/diagram'

// ====== 布局算法类型 ======
export type LayoutAlgorithm = 'dagre' | 'tree' | 'sequence' | 'class' | 'activity' | 'deployment' | 'grid'

// ====== 布局配置 ======
export interface DagreConfig {
  rankdir?: 'TB' | 'LR'
  nodesep?: number
  ranksep?: number
}

export interface SequenceLayoutConfig {
  participantGap?: number
  messageGap?: number
  participantY?: number
}

export interface ClassLayoutConfig {
  direction?: 'TB' | 'LR'
  classGap?: number
}

export interface ActivityLayoutConfig {
  direction?: 'TB' | 'LR'
  actionSpacing?: number
}

export interface DeploymentLayoutConfig {
  layers?: string[]
  layerGap?: number
  nodeGap?: number
}

export interface LayoutOptions {
  algorithm: LayoutAlgorithm
  dagre?: DagreConfig
  sequence?: SequenceLayoutConfig
  class?: ClassLayoutConfig
  activity?: ActivityLayoutConfig
  deployment?: DeploymentLayoutConfig
}

export interface LayoutResult {
  nodes: Node<DiagramNodeData>[]
  edges: Edge[]
}

// ====== dagre 布局 ======
export function layoutWithDagre(
  nodes: Node<DiagramNodeData>[],
  edges: Edge[],
  config: DagreConfig = {}
): LayoutResult {
  const { rankdir = 'TB', nodesep = 60, ranksep = 80 } = config
  
  // 简化版 dagre 布局 - 使用层次化计算
  const childrenMap = new Map<string, string[]>()
  const parentMap = new Map<string, string | null>()
  
  nodes.forEach(n => parentMap.set(n.id, null))
  edges.forEach(e => {
    const list = childrenMap.get(e.source) || []
    list.push(e.target)
    childrenMap.set(e.source, list)
    parentMap.set(e.target, e.source)
  })
  
  // 找根节点
  const rootIds = nodes.filter(n => parentMap.get(n.id) === null).map(n => n.id)
  if (rootIds.length === 0 && nodes.length > 0) rootIds.push(nodes[0].id)
  
  // BFS 分层
  const levels = new Map<string, number>()
  const queue: string[] = [...rootIds]
  rootIds.forEach(id => levels.set(id, 0))
  
  while (queue.length > 0) {
    const id = queue.shift()!
    const lv = levels.get(id)!
    ;(childrenMap.get(id) || []).forEach(cid => {
      if (!levels.has(cid)) {
        levels.set(cid, lv + 1)
        queue.push(cid)
      }
    })
  }
  
  // 按层分组
  const levelGroups = new Map<number, string[]>()
  levels.forEach((lv, id) => {
    const list = levelGroups.get(lv) || []
    list.push(id)
    levelGroups.set(lv, list)
  })
  
  const maxLevel = Math.max(...levelGroups.keys(), 0)
  
  // 计算位置
  const positions = new Map<string, { x: number; y: number }>()
  
  if (rankdir === 'TB') {
    // 垂直布局
    for (let lv = 0; lv <= maxLevel; lv++) {
      const ids = levelGroups.get(lv) || []
      const totalWidth = ids.length * nodesep
      const startX = -totalWidth / 2
      
      ids.forEach((id, i) => {
        positions.set(id, {
          x: startX + i * nodesep + nodesep / 2,
          y: lv * ranksep
        })
      })
    }
  } else {
    // 水平布局
    for (let lv = 0; lv <= maxLevel; lv++) {
      const ids = levelGroups.get(lv) || []
      const totalHeight = ids.length * nodesep
      const startY = -totalHeight / 2
      
      ids.forEach((id, i) => {
        positions.set(id, {
          x: lv * ranksep,
          y: startY + i * nodesep + nodesep / 2
        })
      })
    }
  }
  
  const layoutedNodes = nodes.map(node => {
    const pos = positions.get(node.id)
    return pos ? { ...node, position: pos } : node
  })
  
  return { nodes: layoutedNodes, edges }
}

// ====== 时序图布局 ======
export function layoutSequence(
  nodes: Node<DiagramNodeData>[],
  edges: Edge[],
  config: SequenceLayoutConfig = {}
): LayoutResult {
  const { participantGap = 200, participantY = 60, messageGap = 60 } = config
  
  const participants = nodes.filter(n => n.type === 'participant')
  const others = nodes.filter(n => n.type !== 'participant')
  const layoutedNodes: Node<DiagramNodeData>[] = []
  const participantPositions = new Map<string, number>()
  
  // 布局参与者
  participants.forEach((p, i) => {
    const x = i * participantGap
    participantPositions.set(p.id, x)
    layoutedNodes.push({
      ...p,
      position: { x: x - 60, y: participantY }
    })
  })
  
  // 非参与方节点（消息等）按序排列在参与方下方
  let msgY = participantY + 100
  others.forEach((node) => {
    layoutedNodes.push({ ...node, position: { x: 0, y: msgY } })
    msgY += messageGap
  })
  
  return { nodes: layoutedNodes, edges }
}

// ====== 类图布局 ======
export function layoutClass(
  nodes: Node<DiagramNodeData>[],
  edges: Edge[],
  config: ClassLayoutConfig = {}
): LayoutResult {
  const { direction = 'TB', classGap = 100 } = config
  return layoutWithDagre(nodes, edges, { rankdir: direction, nodesep: classGap, ranksep: 120 })
}

// ====== 活动图布局 ======
export function layoutActivity(
  nodes: Node<DiagramNodeData>[],
  edges: Edge[],
  config: ActivityLayoutConfig = {}
): LayoutResult {
  const { direction = 'TB', actionSpacing = 80 } = config
  return layoutWithDagre(nodes, edges, { rankdir: direction, nodesep: 60, ranksep: actionSpacing })
}

// ====== 部署图布局 ======
export function layoutDeployment(
  nodes: Node<DiagramNodeData>[],
  edges: Edge[],
  config: DeploymentLayoutConfig = {}
): LayoutResult {
  const { layerGap = 200, nodeGap = 150 } = config
  
  // 按层分组
  const layers = new Map<string, Node<DiagramNodeData>[]>()
  nodes.forEach(node => {
    const layer = (node.data as any).layer || 'default'
    const list = layers.get(layer) || []
    list.push(node)
    layers.set(layer, list)
  })
  
  const layoutedNodes: Node<DiagramNodeData>[] = []
  let currentY = 50
  
  layers.forEach((layerNodes) => {
    const totalWidth = layerNodes.length * nodeGap
    const startX = -totalWidth / 2
    
    layerNodes.forEach((node, i) => {
      layoutedNodes.push({
        ...node,
        position: {
          x: startX + i * nodeGap,
          y: currentY
        }
      })
    })
    
    currentY += layerGap
  })
  
  return { nodes: layoutedNodes, edges }
}

// ====== 网格布局 ======
export function layoutGrid(
  nodes: Node<DiagramNodeData>[],
  edges: Edge[],
  cellW = 200,
  cellH = 150
): LayoutResult {
  const cols = Math.ceil(Math.sqrt(nodes.length))
  
  const layoutedNodes = nodes.map((node, i) => ({
    ...node,
    position: {
      x: (i % cols) * cellW,
      y: Math.floor(i / cols) * cellH
    }
  }))
  
  return { nodes: layoutedNodes, edges }
}

// ====== 统一布局入口 ======
export function applyLayout(
  nodes: Node<DiagramNodeData>[],
  edges: Edge[],
  options: LayoutOptions
): LayoutResult {
  switch (options.algorithm) {
    case 'dagre':
      return layoutWithDagre(nodes, edges, options.dagre)
    case 'sequence':
      return layoutSequence(nodes, edges, options.sequence)
    case 'class':
      return layoutClass(nodes, edges, options.class)
    case 'activity':
      return layoutActivity(nodes, edges, options.activity)
    case 'deployment':
      return layoutDeployment(nodes, edges, options.deployment)
    case 'grid':
      return layoutGrid(nodes, edges)
    default:
      return layoutWithDagre(nodes, edges)
  }
}

// ====== 根据图表类型自动选择布局 ======
export function autoLayout(
  nodes: Node<DiagramNodeData>[],
  edges: Edge[],
  diagramType: DiagramType
): LayoutResult {
  const options: Record<DiagramType, LayoutOptions> = {
    usecase: { algorithm: 'dagre', dagre: { rankdir: 'LR', nodesep: 100, ranksep: 120 } },
    structure: { algorithm: 'dagre', dagre: { rankdir: 'TB', nodesep: 80, ranksep: 100 } },
    entity: { algorithm: 'dagre', dagre: { rankdir: 'TB', nodesep: 100, ranksep: 120 } },
    sequence: { algorithm: 'sequence', sequence: { participantGap: 200, messageGap: 60 } },
    class: { algorithm: 'class', class: { direction: 'TB', classGap: 100 } },
    activity: { algorithm: 'activity', activity: { direction: 'TB', actionSpacing: 80 } },
    deployment: { algorithm: 'deployment', deployment: { layerGap: 200, nodeGap: 150 } },
  }
  
  return applyLayout(nodes, edges, options[diagramType])
}
