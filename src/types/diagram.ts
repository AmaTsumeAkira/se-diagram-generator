import type { Node, Edge } from '@xyflow/react'

export type NodeType = 'actor' | 'usecase' | 'rectangle' | 'ellipse'

export interface DiagramNodeData extends Record<string, unknown> {
  label: string
  /** 椭圆节点水平半径 */
  rx?: number
  /** 椭圆节点垂直半径 */
  ry?: number
  /** 矩形节点是否竖排文字 */
  vertical?: boolean
}

export interface DiagramConfig {
  nodes: Node<DiagramNodeData>[]
  edges: Edge[]
}
