import type { Node, Edge } from '@xyflow/react'

// ====== 原有节点类型 ======
export type NodeType = 'actor' | 'usecase' | 'rectangle' | 'ellipse'

// ====== 新增节点类型 ======
export type SequenceNodeType = 'participant' | 'activation'
export type ClassNodeType = 'class' | 'interface' | 'enum'
export type ActivityNodeType = 'start' | 'end' | 'action' | 'decision' | 'fork' | 'join'
export type DeploymentNodeType = 'server' | 'database' | 'node' | 'artifact' | 'component' | 'browser' | 'mobile'
export type ERNodeType = 'erEntity' | 'erDiamond'

// 联合类型
export type AllNodeType = NodeType | SequenceNodeType | ClassNodeType | ActivityNodeType | DeploymentNodeType | ERNodeType

// ====== 边类型 ======
export type SequenceEdgeType = 'sync' | 'async' | 'return'
export type ClassEdgeType = 'association' | 'inheritance' | 'implementation' | 'dependency' | 'aggregation' | 'composition'
export type ActivityEdgeType = 'flow' | 'condition'
export type DeploymentEdgeType = 'communication' | 'association'

// ====== 节点数据接口 ======

/** ER 图：实体字段（"字段环绕"与"表格型"两种表示法使用；Chen 表示法不需要） */
export interface ERField {
  name: string
  type?: string
  /** 主键 */
  pk?: boolean
  /** 外键 */
  fk?: boolean
  comment?: string
}

/** ER 图表示法：陈氏（实体+菱形联系）/ 实体直连 / 实体+字段环绕 / 表格型 */
export type ERNotation = 'chen' | 'entity' | 'attribute' | 'table'

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
  row?: number
  col?: number
  /** ER 图：所属虚线分组模块名称 */
  group?: string
  /** ER 图：绝对坐标（px）。实体为左上角，菱形为中心点；缺省则回退网格自动布局 */
  x?: number
  y?: number
  /** ER 图：实体字段列表 */
  fields?: ERField[]
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

// ER图边数据
export interface EREdgeData extends DiagramEdgeData {
  sourceCard?: string
  targetCard?: string
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
export type DiagramType = 'usecase' | 'structure' | 'entity' | 'er' | 'sequence' | 'class' | 'activity' | 'deployment' | 'flowchart'

/** 程序流程图节点：开始/结束（胶囊）、处理（直角矩形）、判断（菱形） */
export type FlowNodeType = 'start' | 'end' | 'process' | 'decision'

// ====== 配置映射 ======
export type ConfigMap = Record<DiagramType, DiagramConfig>
