import type { Node, Edge } from '@xyflow/react'

// ====== 原有节点类型 ======
export type NodeType = 'actor' | 'usecase' | 'rectangle' | 'ellipse'

// ====== 新增节点类型 ======
export type SequenceNodeType = 'participant' | 'activation'
export type ClassNodeType = 'class' | 'interface' | 'enum'
export type ActivityNodeType = 'start' | 'end' | 'action' | 'decision' | 'fork' | 'join'
export type DeploymentNodeType = 'server' | 'database' | 'node' | 'artifact' | 'component'

// 联合类型
export type AllNodeType = NodeType | SequenceNodeType | ClassNodeType | ActivityNodeType | DeploymentNodeType

// ====== 边类型 ======
export type SequenceEdgeType = 'sync' | 'async' | 'return'
export type ClassEdgeType = 'association' | 'inheritance' | 'implementation' | 'dependency' | 'aggregation' | 'composition'
export type ActivityEdgeType = 'flow' | 'condition'
export type DeploymentEdgeType = 'communication' | 'association'

// ====== 节点数据接口 ======
export interface DiagramNodeData extends Record<string, unknown> {
  label: string
  rx?: number
  ry?: number
  vertical?: boolean
  /** 竖排矩形动态高度 */
  nodeH?: number
  fontSize?: number
  fontFamily?: string
  spacing?: number
  nodeW?: number
}

// 时序图参与者数据
export interface ParticipantNodeData extends DiagramNodeData {
  participantType?: 'actor' | 'system' | 'database'
}

// 类图类节点数据
export interface ClassNodeData extends DiagramNodeData {
  stereotype?: string
  attributes: string[]
  methods: string[]
  isAbstract?: boolean
}

// 活动图决策节点数据
export interface DecisionNodeData extends DiagramNodeData {
  conditions?: { label: string; targetId: string }[]
}

// 部署图节点数据
export interface DeploymentNodeData extends DiagramNodeData {
  nodeType?: 'server' | 'database' | 'browser' | 'mobile'
  technology?: string
}

// ====== 边数据接口 ======
export interface DiagramEdgeData extends Record<string, unknown> {
  label?: string
}

// 时序图消息数据
export interface MessageEdgeData extends DiagramEdgeData {
  messageType?: 'sync' | 'async' | 'return'
}

// 类图关系数据
export interface ClassRelationData extends DiagramEdgeData {
  relationType: ClassEdgeType
  sourceMultiplicity?: string
  targetMultiplicity?: string
}

// 活动图流数据
export interface ActivityFlowData extends DiagramEdgeData {
  guard?: string
}

// ====== 图表配置接口 ======
export interface DiagramConfig {
  nodes: Node<DiagramNodeData>[]
  edges: Edge[]
}

// ====== 图表类型枚举 ======
export type DiagramType = 'usecase' | 'structure' | 'entity' | 'sequence' | 'class' | 'activity' | 'deployment'

// ====== 配置映射 ======
export type ConfigMap = Record<DiagramType, DiagramConfig>
