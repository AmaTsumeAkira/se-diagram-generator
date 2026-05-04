import type { Node, Edge } from '@xyflow/react'

export type NodeType = 'actor' | 'usecase' | 'rectangle' | 'ellipse'

export interface DiagramNodeData extends Record<string, unknown> {
  label: string
  rx?: number
  ry?: number
  vertical?: boolean
  /** 竖排矩形动态高度 */
  nodeH?: number
}

export interface DiagramConfig {
  nodes: Node<DiagramNodeData>[]
  edges: Edge[]
}
