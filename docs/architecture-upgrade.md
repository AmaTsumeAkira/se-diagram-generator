# 软件工程图生成器 - 架构升级方案

## 1. 目录结构优化

### 1.1 新目录结构

```
src/
├── core/                           # 核心抽象层
│   ├── types/                      # 核心类型定义
│   │   ├── diagram.ts              # 图表基础类型
│   │   ├── node.ts                 # 节点类型定义
│   │   ├── edge.ts                 # 边类型定义
│   │   ├── plugin.ts               # 插件接口类型
│   │   └── template.ts             # 模板类型定义
│   ├── registry/                   # 注册中心
│   │   ├── DiagramRegistry.ts      # 图表注册表
│   │   ├── NodeRegistry.ts         # 节点类型注册表
│   │   ├── EdgeRegistry.ts         # 边类型注册表
│   │   ├── ExportRegistry.ts       # 导出格式注册表
│   │   └── LayoutRegistry.ts       # 布局算法注册表
│   └── hooks/                      # 核心Hooks
│       ├── useDiagram.ts           # 图表状态管理
│       ├── useUndoRedo.ts          # 撤销/重做
│       └── usePlugin.ts            # 插件加载
│
├── plugins/                        # 插件目录
│   ├── diagrams/                   # 图表插件
│   │   ├── usecase/                # 用例图
│   │   │   ├── index.ts            # 插件入口
│   │   │   ├── UseCaseDiagram.tsx  # 图表组件
│   │   │   ├── nodes/              # 专用节点
│   │   │   │   ├── ActorNode.tsx
│   │   │   │   └── UseCaseNode.tsx
│   │   │   ├── edges/              # 专用边
│   │   │   ├── layout.ts           # 专用布局
│   │   │   └── i18n/               # 国际化
│   │   │       ├── zh.ts
│   │   │       └── en.ts
│   │   │
│   │   ├── structure/              # 功能结构图
│   │   │   ├── index.ts
│   │   │   ├── StructureDiagram.tsx
│   │   │   ├── nodes/
│   │   │   │   └── RectangleNode.tsx
│   │   │   ├── edges/
│   │   │   │   └── StepEdge.tsx
│   │   │   └── layout.ts
│   │   │
│   │   ├── entity/                 # 实体属性图
│   │   │   ├── index.ts
│   │   │   ├── EntityDiagram.tsx
│   │   │   ├── nodes/
│   │   │   │   ├── EntityNode.tsx
│   │   │   │   └── AttributeNode.tsx
│   │   │   └── layout.ts
│   │   │
│   │   ├── sequence/               # 时序图 [新增]
│   │   │   ├── index.ts
│   │   │   ├── SequenceDiagram.tsx
│   │   │   ├── nodes/
│   │   │   │   ├── LifelineNode.tsx
│   │   │   │   ├── ActivationNode.tsx
│   │   │   │   └── MessageNode.tsx
│   │   │   ├── edges/
│   │   │   │   └── MessageEdge.tsx
│   │   │   └── layout.ts
│   │   │
│   │   ├── class/                  # 类图 [新增]
│   │   │   ├── index.ts
│   │   │   ├── ClassDiagram.tsx
│   │   │   ├── nodes/
│   │   │   │   └── ClassNode.tsx
│   │   │   ├── edges/
│   │   │   │   ├── InheritanceEdge.tsx
│   │   │   │   ├── AssociationEdge.tsx
│   │   │   │   └── DependencyEdge.tsx
│   │   │   └── layout.ts
│   │   │
│   │   ├── activity/               # 活动图 [新增]
│   │   │   ├── index.ts
│   │   │   ├── ActivityDiagram.tsx
│   │   │   ├── nodes/
│   │   │   │   ├── ActionNode.tsx
│   │   │   │   ├── DecisionNode.tsx
│   │   │   │   ├── ForkNode.tsx
│   │   │   │   └── MergeNode.tsx
│   │   │   ├── edges/
│   │   │   │   └── FlowEdge.tsx
│   │   │   └── layout.ts
│   │   │
│   │   └── deployment/             # 部署图 [新增]
│   │       ├── index.ts
│   │       ├── DeploymentDiagram.tsx
│   │       ├── nodes/
│   │       │   ├── ServerNode.tsx
│   │       │   ├── DeviceNode.tsx
│   │       │   └── ArtifactNode.tsx
│   │       ├── edges/
│   │       │   └── CommunicationEdge.tsx
│   │       └── layout.ts
│   │
│   ├── exporters/                  # 导出插件
│   │   ├── svg/                    # SVG导出
│   │   │   ├── index.ts
│   │   │   └── SvgExporter.ts
│   │   ├── drawio/                 # Draw.io导出
│   │   │   ├── index.ts
│   │   │   └── DrawioExporter.ts
│   │   ├── visio/                  # Visio导出 [新增]
│   │   │   ├── index.ts
│   │   │   ├── VisioExporter.ts
│   │   │   └── vdx-template.ts     # VDX模板
│   │   └── png/                    # PNG导出 [新增]
│   │       ├── index.ts
│   │       └── PngExporter.ts
│   │
│   └── layouts/                    # 布局算法插件
│       ├── dagre/                  # dagre布局
│       │   ├── index.ts
│       │   └── DagreLayout.ts
│       ├── tree/                   # 树形布局
│       │   ├── index.ts
│       │   └── TreeLayout.ts
│       ├── sequence/               # 时序图布局
│       │   ├── index.ts
│       │   └── SequenceLayout.ts
│       └── force/                  # 力导向布局 [新增]
│           ├── index.ts
│           └── ForceLayout.ts
│
├── components/                     # 通用组件
│   ├── canvas/                     # 画布组件
│   │   ├── DiagramCanvas.tsx       # 统一画布
│   │   ├── Toolbar.tsx             # 工具栏
│   │   └── Minimap.tsx             # 小地图
│   ├── panels/                     # 面板组件
│   │   ├── PropertyPanel.tsx       # 属性面板
│   │   ├── TemplatePanel.tsx       # 模板面板 [新增]
│   │   └── ExportPanel.tsx         # 导出面板
│   ├── nodes/                      # 通用节点
│   │   ├── BaseNode.tsx            # 节点基类
│   │   └── TextNode.tsx            # 文本节点
│   └── edges/                      # 通用边
│       ├── BaseEdge.tsx            # 边基类
│       └── StepEdge.tsx            # 阶梯边
│
├── templates/                      # 模板库 [新增]
│   ├── index.ts                    # 模板注册
│   ├── usecase/                    # 用例图模板
│   │   ├── login-system.json
│   │   ├── e-commerce.json
│   │   └── library-system.json
│   ├── class/                      # 类图模板
│   │   ├── design-pattern.json
│   │   └── mvc-pattern.json
│   ├── sequence/                   # 时序图模板
│   │   ├── api-call.json
│   │   └── auth-flow.json
│   └── activity/                   # 活动图模板
│       ├── order-process.json
│       └── user-registration.json
│
├── store/                          # 状态管理
│   ├── diagramStore.ts             # 图表状态
│   ├── templateStore.ts            # 模板状态 [新增]
│   └── settingsStore.ts            # 设置状态
│
├── utils/                          # 工具函数
│   ├── geometry.ts                 # 几何计算
│   ├── style.ts                    # 样式工具
│   └── i18n.ts                     # 国际化工具
│
├── i18n/                           # 国际化
│   ├── index.ts
│   ├── zh/
│   │   ├── common.json
│   │   └── diagrams.json
│   └── en/
│       ├── common.json
│       └── diagrams.json
│
└── App.tsx
```

### 1.2 目录结构设计原则

| 原则 | 说明 |
|------|------|
| **插件化** | 每种图表、导出格式、布局算法都是独立插件 |
| **高内聚** | 相关功能集中在同一目录（节点、边、布局） |
| **低耦合** | 插件通过注册中心交互，避免直接依赖 |
| **可扩展** | 新增图表只需创建新目录并注册 |

---

## 2. 类型系统设计

### 2.1 核心类型定义

```typescript
// src/core/types/diagram.ts

import type { Node, Edge, ReactFlowInstance } from '@xyflow/react'

// ==================== 图表类型枚举 ====================

export type DiagramType = 
  | 'usecase'       // 用例图
  | 'structure'     // 功能结构图
  | 'entity'        // 实体属性图
  | 'sequence'      // 时序图
  | 'class'         // 类图
  | 'activity'      // 活动图
  | 'deployment'    // 部署图

// ==================== 图表配置 ====================

export interface DiagramConfig {
  type: DiagramType
  title: string
  nodes: Node[]
  edges: Edge[]
  metadata?: DiagramMetadata
}

export interface DiagramMetadata {
  author?: string
  createdAt?: string
  updatedAt?: string
  version?: string
  description?: string
}

// ==================== 图表实例 ====================

export interface DiagramInstance {
  id: string
  type: DiagramType
  config: DiagramConfig
  flowInstance?: ReactFlowInstance
}
```

```typescript
// src/core/types/node.ts

import type { Node, NodeProps } from '@xyflow/react'

// ==================== 节点类型注册 ====================

export interface NodeTypeDef<T extends Record<string, unknown> = Record<string, unknown>> {
  /** 节点类型标识 */
  type: string
  /** 节点组件 */
  component: React.ComponentType<NodeProps<Node<T>>>
  /** 默认数据 */
  defaultData: T
  /** 默认尺寸 */
  defaultSize?: { width: number; height: number }
  /** 是否可连接 */
  connectable?: boolean
  /** 是否可拖拽 */
  draggable?: boolean
  /** 节点图标（用于工具栏） */
  icon?: React.ReactNode
  /** 节点描述 */
  description?: string
}

// ==================== 通用节点数据 ====================

export interface BaseNodeData extends Record<string, unknown> {
  label: string
  description?: string
  style?: NodeStyle
}

export interface NodeStyle {
  backgroundColor?: string
  borderColor?: string
  borderWidth?: number
  borderStyle?: 'solid' | 'dashed' | 'dotted'
  textColor?: string
  fontSize?: number
  fontFamily?: string
}

// ==================== 特定节点数据 ====================

export interface ActorNodeData extends BaseNodeData {
  type: 'actor'
}

export interface ClassNodeData extends BaseNodeData {
  type: 'class'
  stereotype?: string
  attributes: ClassAttribute[]
  methods: ClassMethod[]
}

export interface ClassAttribute {
  visibility: '+' | '-' | '#' | '~'
  name: string
  type: string
  isStatic?: boolean
}

export interface ClassMethod {
  visibility: '+' | '-' | '#' | '~'
  name: string
  params: string
  returnType: string
  isStatic?: boolean
  isAbstract?: boolean
}

export interface LifelineNodeData extends BaseNodeData {
  type: 'lifeline'
  participantType: 'actor' | 'object' | 'system'
}

export interface ActivationNodeData extends BaseNodeData {
  type: 'activation'
  lifelineId: string
  startTime: number
  endTime: number
}
```

```typescript
// src/core/types/edge.ts

import type { Edge, EdgeProps } from '@xyflow/react'

// ==================== 边类型注册 ====================

export interface EdgeTypeDef<T extends Record<string, unknown> = Record<string, unknown>> {
  /** 边类型标识 */
  type: string
  /** 边组件 */
  component: React.ComponentType<EdgeProps<Edge<T>>>
  /** 默认数据 */
  defaultData?: T
  /** 默认样式 */
  defaultStyle?: EdgeStyle
  /** 边图标 */
  icon?: React.ReactNode
  /** 边描述 */
  description?: string
}

// ==================== 边样式 ====================

export interface EdgeStyle {
  stroke?: string
  strokeWidth?: number
  strokeDasharray?: string
  animated?: boolean
  markerStart?: MarkerStyle
  markerEnd?: MarkerStyle
}

export interface MarkerStyle {
  type: 'arrow' | 'arrowclosed' | 'diamond' | 'circle' | 'none'
  color?: string
  size?: number
}

// ==================== 特定边数据 ====================

export interface MessageEdgeData extends Record<string, unknown> {
  messageType: 'sync' | 'async' | 'return' | 'create' | 'destroy'
  label?: string
  sequenceNumber?: number
}

export interface AssociationEdgeData extends Record<string, unknown> {
  multiplicitySource?: string
  multiplicityTarget?: string
  roleSource?: string
  roleTarget?: string
  isNavigable?: boolean
}

export interface DependencyEdgeData extends Record<string, unknown> {
  stereotype?: string
}
```

```typescript
// src/core/types/plugin.ts

import type { DiagramType } from './diagram'
import type { NodeTypeDef } from './node'
import type { EdgeTypeDef } from './edge'

// ==================== 图表插件接口 ====================

export interface DiagramPlugin {
  /** 插件ID */
  id: string
  /** 图表类型 */
  type: DiagramType
  /** 显示名称 */
  name: string
  /** 描述 */
  description?: string
  /** 图标 */
  icon?: React.ReactNode
  
  /** 节点类型定义 */
  nodeTypes: NodeTypeDef[]
  /** 边类型定义 */
  edgeTypes: EdgeTypeDef[]
  
  /** 图表主组件 */
  DiagramComponent: React.ComponentType<DiagramComponentProps>
  /** 编辑面板组件 */
  EditorComponent?: React.ComponentType<EditorComponentProps>
  
  /** 默认配置 */
  defaultConfig: DiagramConfig
  
  /** 初始化钩子 */
  onInit?: (instance: DiagramInstance) => void
  /** 销毁钩子 */
  onDestroy?: () => void
}

export interface DiagramComponentProps {
  nodes: Node[]
  edges: Edge[]
  onNodesChange?: (changes: NodeChange[]) => void
  onEdgesChange?: (changes: EdgeChange[]) => void
  showGrid?: boolean
  readOnly?: boolean
}

export interface EditorComponentProps {
  selectedNode?: Node
  selectedEdge?: Edge
  onUpdateNode?: (id: string, data: Record<string, unknown>) => void
  onUpdateEdge?: (id: string, data: Record<string, unknown>) => void
}

// ==================== 导出插件接口 ====================

export interface ExportPlugin {
  /** 插件ID */
  id: string
  /** 导出格式 */
  format: ExportFormat
  /** 显示名称 */
  name: string
  /** 文件扩展名 */
  extension: string
  /** MIME类型 */
  mimeType: string
  /** 图标 */
  icon?: React.ReactNode
  
  /** 导出函数 */
  export: (config: ExportConfig) => Promise<Blob | string>
  /** 导出选项面板 */
  OptionsComponent?: React.ComponentType<ExportOptionsProps>
}

export type ExportFormat = 'svg' | 'png' | 'drawio' | 'visio' | 'pdf'

export interface ExportConfig {
  diagramType: DiagramType
  nodes: Node[]
  edges: Edge[]
  options?: Record<string, unknown>
}

export interface ExportOptionsProps {
  options: Record<string, unknown>
  onChange: (options: Record<string, unknown>) => void
}

// ==================== 布局插件接口 ====================

export interface LayoutPlugin {
  /** 插件ID */
  id: string
  /** 布局算法名称 */
  name: string
  /** 适用的图表类型 */
  supportedTypes: DiagramType[]
  /** 描述 */
  description?: string
  
  /** 布局函数 */
  layout: (params: LayoutParams) => LayoutResult
  /** 配置面板 */
  OptionsComponent?: React.ComponentType<LayoutOptionsProps>
}

export interface LayoutParams {
  nodes: Node[]
  edges: Edge[]
  direction?: 'TB' | 'LR' | 'BT' | 'RL'
  options?: Record<string, unknown>
}

export interface LayoutResult {
  nodes: Node[]
  edges: Edge[]
}

export interface LayoutOptionsProps {
  options: Record<string, unknown>
  onChange: (options: Record<string, unknown>) => void
}
```

```typescript
// src/core/types/template.ts

import type { DiagramType } from './diagram'
import type { Node, Edge } from '@xyflow/react'

// ==================== 模板定义 ====================

export interface DiagramTemplate {
  /** 模板ID */
  id: string
  /** 模板名称 */
  name: string
  /** 模板描述 */
  description?: string
  /** 图表类型 */
  diagramType: DiagramType
  /** 缩略图URL */
  thumbnail?: string
  /** 分类标签 */
  tags: string[]
  /** 模板数据 */
  data: TemplateData
  /** 是否内置 */
  builtin?: boolean
  /** 创建时间 */
  createdAt?: string
}

export interface TemplateData {
  nodes: TemplateNode[]
  edges: TemplateEdge[]
}

export interface TemplateNode extends Omit<Node, 'id' | 'position'> {
  /** 模板中的相对位置 */
  position: { x: number; y: number }
}

export interface TemplateEdge extends Omit<Edge, 'id' | 'source' | 'target'> {
  /** 源节点引用（模板中的ID） */
  source: string
  /** 目标节点引用（模板中的ID） */
  target: string
}

// ==================== 模板分类 ====================

export interface TemplateCategory {
  id: string
  name: string
  icon?: React.ReactNode
  templates: DiagramTemplate[]
}
```

### 2.2 节点类型注册机制

```typescript
// src/core/registry/NodeRegistry.ts

import type { NodeTypeDef } from '../types/node'

class NodeRegistry {
  private types = new Map<string, NodeTypeDef>()
  
  register<T extends Record<string, unknown>>(def: NodeTypeDef<T>): void {
    if (this.types.has(def.type)) {
      console.warn(`Node type "${def.type}" already registered, overwriting.`)
    }
    this.types.set(def.type, def as NodeTypeDef)
  }
  
  unregister(type: string): void {
    this.types.delete(type)
  }
  
  get(type: string): NodeTypeDef | undefined {
    return this.types.get(type)
  }
  
  getAll(): NodeTypeDef[] {
    return Array.from(this.types.values())
  }
  
  getByDiagramType(diagramType: string): NodeTypeDef[] {
    // 可以根据图表类型过滤节点类型
    return this.getAll().filter(def => 
      def.type.startsWith(diagramType + '.') || 
      !def.type.includes('.')
    )
  }
  
  getNodeComponent(type: string): React.ComponentType<any> | undefined {
    return this.types.get(type)?.component
  }
  
  getDefaultData(type: string): Record<string, unknown> | undefined {
    return this.types.get(type)?.defaultData
  }
}

export const nodeRegistry = new NodeRegistry()
```

### 2.3 边类型注册机制

```typescript
// src/core/registry/EdgeRegistry.ts

import type { EdgeTypeDef } from '../types/edge'

class EdgeRegistry {
  private types = new Map<string, EdgeTypeDef>()
  
  register<T extends Record<string, unknown>>(def: EdgeTypeDef<T>): void {
    if (this.types.has(def.type)) {
      console.warn(`Edge type "${def.type}" already registered, overwriting.`)
    }
    this.types.set(def.type, def as EdgeTypeDef)
  }
  
  unregister(type: string): void {
    this.types.delete(type)
  }
  
  get(type: string): EdgeTypeDef | undefined {
    return this.types.get(type)
  }
  
  getAll(): EdgeTypeDef[] {
    return Array.from(this.types.values())
  }
  
  getEdgeComponent(type: string): React.ComponentType<any> | undefined {
    return this.types.get(type)?.component
  }
}

export const edgeRegistry = new EdgeRegistry()
```

### 2.4 布局算法接口

```typescript
// src/core/registry/LayoutRegistry.ts

import type { LayoutPlugin, DiagramType } from '../types/plugin'

class LayoutRegistry {
  private plugins = new Map<string, LayoutPlugin>()
  private defaultLayouts = new Map<DiagramType, string>()
  
  register(plugin: LayoutPlugin): void {
    this.plugins.set(plugin.id, plugin)
  }
  
  unregister(id: string): void {
    this.plugins.delete(id)
  }
  
  get(id: string): LayoutPlugin | undefined {
    return this.plugins.get(id)
  }
  
  getDefault(diagramType: DiagramType): LayoutPlugin | undefined {
    const defaultId = this.defaultLayouts.get(diagramType)
    if (defaultId) {
      return this.plugins.get(defaultId)
    }
    // 返回第一个支持该图表类型的布局
    return Array.from(this.plugins.values()).find(p => 
      p.supportedTypes.includes(diagramType)
    )
  }
  
  setDefault(diagramType: DiagramType, layoutId: string): void {
    this.defaultLayouts.set(diagramType, layoutId)
  }
  
  getByDiagramType(diagramType: DiagramType): LayoutPlugin[] {
    return Array.from(this.plugins.values()).filter(p => 
      p.supportedTypes.includes(diagramType)
    )
  }
}

export const layoutRegistry = new LayoutRegistry()
```

---

## 3. 插件化架构

### 3.1 图表插件示例

```typescript
// src/plugins/sequence/index.ts

import type { DiagramPlugin } from '../../core/types/plugin'
import { SequenceDiagram } from './SequenceDiagram'
import { LifelineNode } from './nodes/LifelineNode'
import { ActivationNode } from './nodes/ActivationNode'
import { MessageEdge } from './edges/MessageEdge'
import { sequenceLayout } from './layout'

export const sequencePlugin: DiagramPlugin = {
  id: 'sequence',
  type: 'sequence',
  name: '时序图',
  description: '展示对象之间的交互顺序',
  
  nodeTypes: [
    {
      type: 'lifeline',
      component: LifelineNode,
      defaultData: { 
        label: '对象', 
        participantType: 'object' 
      },
      defaultSize: { width: 120, height: 40 },
      connectable: true,
      draggable: true,
    },
    {
      type: 'activation',
      component: ActivationNode,
      defaultData: { 
        label: '', 
        lifelineId: '', 
        startTime: 0, 
        endTime: 100 
      },
      defaultSize: { width: 20, height: 60 },
      connectable: false,
      draggable: false,
    },
  ],
  
  edgeTypes: [
    {
      type: 'message',
      component: MessageEdge,
      defaultData: { 
        messageType: 'sync' 
      },
      defaultStyle: {
        stroke: '#000',
        strokeWidth: 1,
      },
    },
  ],
  
  DiagramComponent: SequenceDiagram,
  
  defaultConfig: {
    type: 'sequence',
    title: '时序图',
    nodes: [],
    edges: [],
  },
}

export default sequencePlugin
```

```typescript
// src/plugins/sequence/SequenceDiagram.tsx

import { useMemo } from 'react'
import { 
  ReactFlow, 
  Background, 
  type Node, 
  type Edge 
} from '@xyflow/react'
import { useTranslation } from 'react-i18next'
import { LifelineNode } from './nodes/LifelineNode'
import { ActivationNode } from './nodes/ActivationNode'
import { MessageEdge } from './edges/MessageEdge'
import { sequenceLayout } from './layout'
import type { DiagramComponentProps } from '../../core/types/plugin'

const nodeTypes = {
  lifeline: LifelineNode,
  activation: ActivationNode,
}

const edgeTypes = {
  message: MessageEdge,
}

export function SequenceDiagram({ 
  nodes, 
  edges, 
  showGrid = true,
  readOnly = false 
}: DiagramComponentProps) {
  const { t } = useTranslation()
  
  const { layoutedNodes, layoutedEdges } = useMemo(() => 
    sequenceLayout(nodes, edges), 
    [nodes, edges]
  )
  
  return (
    <ReactFlow
      nodes={layoutedNodes}
      edges={layoutedEdges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      fitView
      fitViewOptions={{ padding: 0.3 }}
      nodesDraggable={!readOnly}
      nodesConnectable={!readOnly}
      elementsSelectable={!readOnly}
      style={{ backgroundColor: '#fff' }}
    >
      {showGrid && <Background color="#e5e5e5" gap={20} />}
    </ReactFlow>
  )
}
```

### 3.2 导出插件接口

```typescript
// src/plugins/visio/index.ts

import type { ExportPlugin } from '../../core/types/plugin'
import { VisioExporter } from './VisioExporter'

export const visioExportPlugin: ExportPlugin = {
  id: 'visio',
  format: 'visio',
  name: 'Visio',
  extension: '.vdx',
  mimeType: 'application/vnd.visio',
  
  export: async (config) => {
    const exporter = new VisioExporter()
    return exporter.export(config)
  },
}

export default visioExportPlugin
```

```typescript
// src/plugins/visio/VisioExporter.ts

import type { ExportConfig } from '../../core/types/plugin'
import type { Node, Edge } from '@xyflow/react'

export class VisioExporter {
  async export(config: ExportConfig): Promise<string> {
    const { nodes, edges, options } = config
    
    const xml = this.generateVDX(nodes, edges, options)
    return xml
  }
  
  private generateVDX(
    nodes: Node[], 
    edges: Edge[], 
    options?: Record<string, unknown>
  ): string {
    const pageWidth = (options?.pageWidth as number) || 1400
    const pageHeight = (options?.pageHeight as number) || 1000
    
    // 计算节点位置（归一化到Visio坐标系）
    const bounds = this.calculateBounds(nodes)
    const scaleX = pageWidth / bounds.width
    const scaleY = pageHeight / bounds.height
    const scale = Math.min(scaleX, scaleY) * 0.8 // 留边距
    
    const shapes = nodes.map(node => this.nodeToShape(node, bounds, scale))
    const connectors = edges.map(edge => this.edgeToConnector(edge, nodes, bounds, scale))
    
    return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<VisioDocument xmlns="urn:schemas-microsoft-com:office:visio">
  <DocumentProperties>
    <Title>软件工程图</Title>
    <Creator>SE Diagram Generator</Creator>
  </DocumentProperties>
  
  <Pages>
    <Page ID="1" Name="Page-1">
      <PageSheet>
        <PageProps>
          <PageWidth>${pageWidth}</PageWidth>
          <PageHeight>${pageHeight}</PageHeight>
        </PageProps>
      </PageSheet>
      
      <Shapes>
        ${shapes.join('\n        ')}
        ${connectors.join('\n        ')}
      </Shapes>
    </Page>
  </Pages>
</VisioDocument>`
  }
  
  private nodeToShape(
    node: Node, 
    bounds: { minX: number; minY: number },
    scale: number
  ): string {
    const x = (node.position.x - bounds.minX) * scale
    const y = (node.position.y - bounds.minY) * scale
    const width = ((node.width || 120) as number) * scale
    const height = ((node.height || 40) as number) * scale
    const label = (node.data?.label as string) || ''
    
    return `<Shape ID="${node.id}" Type="Shape">
      <Transform>
        <PinX>${x + width / 2}</PinX>
        <PinY>${y + height / 2}</PinY>
        <Width>${width}</Width>
        <Height>${height}</Height>
      </Transform>
      <Text>${this.escapeXml(label)}</Text>
      <Cell N="FillForegnd" V="#FFFFFF"/>
      <Cell N="LineColor" V="#000000"/>
    </Shape>`
  }
  
  private edgeToConnector(
    edge: Edge, 
    nodes: Node[],
    bounds: { minX: number; minY: number },
    scale: number
  ): string {
    const source = nodes.find(n => n.id === edge.source)
    const target = nodes.find(n => n.id === edge.target)
    
    if (!source || !target) return ''
    
    const sx = (source.position.x - bounds.minX) * scale
    const sy = (source.position.y - bounds.minY) * scale
    const tx = (target.position.x - bounds.minX) * scale
    const ty = (target.position.y - bounds.minY) * scale
    
    return `<Shape ID="${edge.id}" Type="Group">
      <Connect>
        <FromSheet>${edge.source}</FromSheet>
        <ToSheet>${edge.target}</ToSheet>
      </Connect>
      <Cell N="LineColor" V="#000000"/>
    </Shape>`
  }
  
  private calculateBounds(nodes: Node[]) {
    let minX = Infinity, minY = Infinity
    let maxX = -Infinity, maxY = -Infinity
    
    nodes.forEach(node => {
      minX = Math.min(minX, node.position.x)
      minY = Math.min(minY, node.position.y)
      maxX = Math.max(maxX, node.position.x + ((node.width || 120) as number))
      maxY = Math.max(maxY, node.position.y + ((node.height || 40) as number))
    })
    
    return { 
      minX, 
      minY, 
      width: maxX - minX, 
      height: maxY - minY 
    }
  }
  
  private escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }
}
```

### 3.3 布局插件接口

```typescript
// src/plugins/layouts/dagre/index.ts

import type { LayoutPlugin } from '../../../core/types/plugin'
import dagre from 'dagre'

export const dagreLayoutPlugin: LayoutPlugin = {
  id: 'dagre',
  name: 'Dagre 自动布局',
  supportedTypes: [
    'usecase', 
    'structure', 
    'entity', 
    'class', 
    'activity', 
    'deployment'
  ],
  description: '基于Dagre的层次化自动布局',
  
  layout: ({ nodes, edges, direction = 'TB', options }) => {
    const g = new dagre.graphlib.Graph()
    g.setDefaultEdgeLabel(() => ({}))
    
    const nodeSep = (options?.nodeSep as number) || 60
    const rankSep = (options?.rankSep as number) || 80
    
    g.setGraph({ 
      rankdir: direction, 
      nodesep: nodeSep, 
      ranksep: rankSep 
    })
    
    nodes.forEach(node => {
      const width = (node.measured?.width ?? node.width ?? 120) as number
      const height = (node.measured?.height ?? node.height ?? 40) as number
      g.setNode(node.id, { width, height })
    })
    
    edges.forEach(edge => g.setEdge(edge.source, edge.target))
    dagre.layout(g)
    
    const layoutedNodes = nodes.map(node => {
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
  },
}

export default dagreLayoutPlugin
```

---

## 4. 状态管理优化

### 4.1 图表状态管理

```typescript
// src/store/diagramStore.ts

import { create } from 'zustand'
import { devtools, subscribeWithSelector } from 'zustand/middleware'
import type { Node, Edge, NodeChange, EdgeChange } from '@xyflow/react'
import type { DiagramType, DiagramConfig } from '../core/types/diagram'
import type { ExportFormat } from '../core/types/plugin'
import { applyNodeChanges, applyEdgeChanges } from '@xyflow/react'

// ==================== 状态接口 ====================

interface DiagramState {
  // 当前图表
  currentType: DiagramType
  nodes: Node[]
  edges: Edge[]
  selectedNodeId: string | null
  selectedEdgeId: string | null
  
  // 撤销/重做
  history: DiagramSnapshot[]
  historyIndex: number
  
  // UI状态
  showGrid: boolean
  showMinimap: boolean
  isReadOnly: boolean
  
  // 操作
  setDiagramType: (type: DiagramType) => void
  setNodes: (nodes: Node[]) => void
  setEdges: (edges: Edge[]) => void
  onNodesChange: (changes: NodeChange[]) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  addNode: (node: Node) => void
  removeNode: (id: string) => void
  updateNodeData: (id: string, data: Record<string, unknown>) => void
  addEdge: (edge: Edge) => void
  removeEdge: (id: string) => void
  selectNode: (id: string | null) => void
  selectEdge: (id: string | null) => void
  
  // 历史操作
  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean
  pushHistory: () => void
  
  // UI操作
  toggleGrid: () => void
  toggleMinimap: () => void
  setReadOnly: (readOnly: boolean) => void
  
  // 配置操作
  loadConfig: (config: DiagramConfig) => void
  exportConfig: () => DiagramConfig
  clear: () => void
}

interface DiagramSnapshot {
  nodes: Node[]
  edges: Edge[]
}

// ==================== 状态实现 ====================

const MAX_HISTORY = 50

export const useDiagramStore = create<DiagramState>()(
  devtools(
    subscribeWithSelector((set, get) => ({
      // 初始状态
      currentType: 'usecase',
      nodes: [],
      edges: [],
      selectedNodeId: null,
      selectedEdgeId: null,
      history: [],
      historyIndex: -1,
      showGrid: true,
      showMinimap: true,
      isReadOnly: false,
      
      // 设置图表类型
      setDiagramType: (type) => {
        set({ currentType: type })
      },
      
      // 设置节点
      setNodes: (nodes) => {
        set({ nodes })
      },
      
      // 设置边
      setEdges: (edges) => {
        set({ edges })
      },
      
      // 节点变更处理
      onNodesChange: (changes) => {
        const { nodes } = get()
        const updatedNodes = applyNodeChanges(changes, nodes) as Node[]
        set({ nodes: updatedNodes })
        
        // 如果是位置变更，标记需要保存历史
        const hasPositionChange = changes.some(c => 
          c.type === 'position' && c.dragging === false
        )
        if (hasPositionChange) {
          get().pushHistory()
        }
      },
      
      // 边变更处理
      onEdgesChange: (changes) => {
        const { edges } = get()
        const updatedEdges = applyEdgeChanges(changes, edges) as Edge[]
        set({ edges: updatedEdges })
      },
      
      // 添加节点
      addNode: (node) => {
        const { nodes } = get()
        set({ nodes: [...nodes, node] })
        get().pushHistory()
      },
      
      // 删除节点
      removeNode: (id) => {
        const { nodes, edges } = get()
        set({
          nodes: nodes.filter(n => n.id !== id),
          edges: edges.filter(e => e.source !== id && e.target !== id),
        })
        get().pushHistory()
      },
      
      // 更新节点数据
      updateNodeData: (id, data) => {
        const { nodes } = get()
        set({
          nodes: nodes.map(n => 
            n.id === id 
              ? { ...n, data: { ...n.data, ...data } }
              : n
          ),
        })
        get().pushHistory()
      },
      
      // 添加边
      addEdge: (edge) => {
        const { edges } = get()
        set({ edges: [...edges, edge] })
        get().pushHistory()
      },
      
      // 删除边
      removeEdge: (id) => {
        const { edges } = get()
        set({ edges: edges.filter(e => e.id !== id) })
        get().pushHistory()
      },
      
      // 选择节点
      selectNode: (id) => {
        set({ selectedNodeId: id, selectedEdgeId: null })
      },
      
      // 选择边
      selectEdge: (id) => {
        set({ selectedEdgeId: id, selectedNodeId: null })
      },
      
      // 撤销
      undo: () => {
        const { history, historyIndex, nodes, edges } = get()
        if (historyIndex < 0) return
        
        const snapshot = history[historyIndex]
        set({
          nodes: snapshot.nodes,
          edges: snapshot.edges,
          historyIndex: historyIndex - 1,
        })
      },
      
      // 重做
      redo: () => {
        const { history, historyIndex } = get()
        if (historyIndex >= history.length - 2) return
        
        const snapshot = history[historyIndex + 2]
        set({
          nodes: snapshot.nodes,
          edges: snapshot.edges,
          historyIndex: historyIndex + 1,
        })
      },
      
      // 是否可撤销
      canUndo: () => {
        const { historyIndex } = get()
        return historyIndex >= 0
      },
      
      // 是否可重做
      canRedo: () => {
        const { history, historyIndex } = get()
        return historyIndex < history.length - 2
      },
      
      // 保存历史快照
      pushHistory: () => {
        const { nodes, edges, history, historyIndex } = get()
        const snapshot: DiagramSnapshot = {
          nodes: JSON.parse(JSON.stringify(nodes)),
          edges: JSON.parse(JSON.stringify(edges)),
        }
        
        // 截断后续历史
        const newHistory = history.slice(0, historyIndex + 2)
        newHistory.push(snapshot)
        
        // 限制历史长度
        if (newHistory.length > MAX_HISTORY) {
          newHistory.shift()
        }
        
        set({
          history: newHistory,
          historyIndex: newHistory.length - 2,
        })
      },
      
      // 切换网格
      toggleGrid: () => {
        set(state => ({ showGrid: !state.showGrid }))
      },
      
      // 切换小地图
      toggleMinimap: () => {
        set(state => ({ showMinimap: !state.showMinimap }))
      },
      
      // 设置只读
      setReadOnly: (readOnly) => {
        set({ isReadOnly: readOnly })
      },
      
      // 加载配置
      loadConfig: (config) => {
        set({
          currentType: config.type,
          nodes: config.nodes,
          edges: config.edges,
          history: [],
          historyIndex: -1,
        })
      },
      
      // 导出配置
      exportConfig: () => {
        const { currentType, nodes, edges } = get()
        return {
          type: currentType,
          title: '',
          nodes,
          edges,
          metadata: {
            updatedAt: new Date().toISOString(),
          },
        }
      },
      
      // 清空
      clear: () => {
        set({
          nodes: [],
          edges: [],
          selectedNodeId: null,
          selectedEdgeId: null,
          history: [],
          historyIndex: -1,
        })
      },
    }))
  )
)
```

### 4.2 模板状态管理

```typescript
// src/store/templateStore.ts

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { DiagramTemplate, TemplateCategory } from '../core/types/template'
import type { DiagramType } from '../core/types/diagram'

interface TemplateState {
  templates: DiagramTemplate[]
  categories: TemplateCategory[]
  selectedTemplateId: string | null
  isLoading: boolean
  
  // 操作
  loadTemplates: () => Promise<void>
  getTemplatesByType: (type: DiagramType) => DiagramTemplate[]
  selectTemplate: (id: string | null) => void
  addTemplate: (template: DiagramTemplate) => void
  removeTemplate: (id: string) => void
  importTemplate: (json: string) => Promise<void>
  exportTemplate: (id: string) => string | null
}

export const useTemplateStore = create<TemplateState>()(
  devtools((set, get) => ({
    templates: [],
    categories: [],
    selectedTemplateId: null,
    isLoading: false,
    
    // 加载模板
    loadTemplates: async () => {
      set({ isLoading: true })
      
      try {
        // 动态导入内置模板
        const builtinTemplates = await loadBuiltinTemplates()
        
        // 加载用户自定义模板
        const customTemplates = loadCustomTemplates()
        
        const allTemplates = [...builtinTemplates, ...customTemplates]
        
        // 构建分类
        const categories = buildCategories(allTemplates)
        
        set({ 
          templates: allTemplates, 
          categories,
          isLoading: false 
        })
      } catch (error) {
        console.error('Failed to load templates:', error)
        set({ isLoading: false })
      }
    },
    
    // 按类型获取模板
    getTemplatesByType: (type) => {
      const { templates } = get()
      return templates.filter(t => t.diagramType === type)
    },
    
    // 选择模板
    selectTemplate: (id) => {
      set({ selectedTemplateId: id })
    },
    
    // 添加模板
    addTemplate: (template) => {
      const { templates } = get()
      set({ templates: [...templates, template] })
      
      // 保存到本地存储
      saveCustomTemplates([...templates, template])
    },
    
    // 删除模板
    removeTemplate: (id) => {
      const { templates } = get()
      const updated = templates.filter(t => t.id !== id)
      set({ templates: updated })
      
      saveCustomTemplates(updated)
    },
    
    // 导入模板
    importTemplate: async (json) => {
      try {
        const template = JSON.parse(json) as DiagramTemplate
        template.id = `custom-${Date.now()}`
        template.createdAt = new Date().toISOString()
        
        get().addTemplate(template)
      } catch (error) {
        console.error('Failed to import template:', error)
        throw new Error('Invalid template format')
      }
    },
    
    // 导出模板
    exportTemplate: (id) => {
      const { templates } = get()
      const template = templates.find(t => t.id === id)
      if (!template) return null
      
      return JSON.stringify(template, null, 2)
    },
  }))
)

// ==================== 辅助函数 ====================

async function loadBuiltinTemplates(): Promise<DiagramTemplate[]> {
  // 动态导入内置模板文件
  const templateModules = import.meta.glob('../templates/**/*.json')
  const templates: DiagramTemplate[] = []
  
  for (const path in templateModules) {
    const module = await templateModules[path]() as { default: DiagramTemplate }
    templates.push({
      ...module.default,
      builtin: true,
    })
  }
  
  return templates
}

function loadCustomTemplates(): DiagramTemplate[] {
  const stored = localStorage.getItem('custom-templates')
  if (!stored) return []
  
  try {
    return JSON.parse(stored)
  } catch {
    return []
  }
}

function saveCustomTemplates(templates: DiagramTemplate[]): void {
  const customTemplates = templates.filter(t => !t.builtin)
  localStorage.setItem('custom-templates', JSON.stringify(customTemplates))
}

function buildCategories(templates: DiagramTemplate[]): TemplateCategory[] {
  const categoryMap = new Map<string, DiagramTemplate[]>()
  
  templates.forEach(template => {
    const category = template.diagramType
    if (!categoryMap.has(category)) {
      categoryMap.set(category, [])
    }
    categoryMap.get(category)!.push(template)
  })
  
  return Array.from(categoryMap.entries()).map(([type, temps]) => ({
    id: type,
    name: getDiagramTypeName(type as DiagramType),
    templates: temps,
  }))
}

function getDiagramTypeName(type: DiagramType): string {
  const names: Record<DiagramType, string> = {
    usecase: '用例图',
    structure: '功能结构图',
    entity: '实体属性图',
    sequence: '时序图',
    class: '类图',
    activity: '活动图',
    deployment: '部署图',
  }
  return names[type] || type
}
```

---

## 5. 代码复用策略

### 5.1 公共组件提取

```typescript
// src/components/nodes/BaseNode.tsx

import { memo } from 'react'
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'
import type { BaseNodeData } from '../../core/types/node'

interface BaseNodeProps extends NodeProps<Node<BaseNodeData>> {
  children?: React.ReactNode
  className?: string
  style?: React.CSSProperties
  handles?: {
    top?: boolean
    bottom?: boolean
    left?: boolean
    right?: boolean
  }
}

export const BaseNode = memo(function BaseNode({
  data,
  selected,
  children,
  className = '',
  style = {},
  handles = { top: true, bottom: true, left: true, right: true },
}: BaseNodeProps) {
  return (
    <div 
      className={`
        relative px-4 py-2 rounded-md border
        ${selected ? 'border-blue-500 shadow-md' : 'border-gray-300'}
        bg-white text-sm
        ${className}
      `}
      style={style}
    >
      {handles.top && (
        <Handle 
          type="target" 
          position={Position.Top} 
          className="w-2 h-2 !bg-gray-400"
        />
      )}
      
      {children || (
        <div className="text-center font-medium">
          {data.label}
        </div>
      )}
      
      {handles.bottom && (
        <Handle 
          type="source" 
          position={Position.Bottom} 
          className="w-2 h-2 !bg-gray-400"
        />
      )}
      
      {handles.left && (
        <Handle 
          type="target" 
          position={Position.Left} 
          id="left"
          className="w-2 h-2 !bg-gray-400"
        />
      )}
      
      {handles.right && (
        <Handle 
          type="source" 
          position={Position.Right} 
          id="right"
          className="w-2 h-2 !bg-gray-400"
        />
      )}
    </div>
  )
})
```

```typescript
// src/components/edges/BaseEdge.tsx

import { memo } from 'react'
import { 
  BaseEdge as ReactFlowBaseEdge, 
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps 
} from '@xyflow/react'

interface BaseEdgeProps extends EdgeProps {
  label?: string
  animated?: boolean
  dashed?: boolean
}

export const BaseEdge = memo(function BaseEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  label,
  animated = false,
  dashed = false,
  style = {},
  markerEnd,
}: BaseEdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  return (
    <>
      <ReactFlowBaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          stroke: style.stroke || '#000',
          strokeWidth: style.strokeWidth || 1,
          strokeDasharray: dashed ? '5,5' : undefined,
        }}
        className={animated ? 'animated' : ''}
      />
      
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
            className="nodrag nopan bg-white px-2 py-1 text-xs border rounded"
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
})
```

### 5.2 公共工具函数

```typescript
// src/utils/geometry.ts

import type { Node, Edge } from '@xyflow/react'

/**
 * 计算节点集合的边界框
 */
export function calculateBounds(nodes: Node[]) {
  if (nodes.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 }
  }

  let minX = Infinity, minY = Infinity
  let maxX = -Infinity, maxY = -Infinity

  nodes.forEach(node => {
    const width = (node.width || 120) as number
    const height = (node.height || 40) as number

    minX = Math.min(minX, node.position.x)
    minY = Math.min(minY, node.position.y)
    maxX = Math.max(maxX, node.position.x + width)
    maxY = Math.max(maxY, node.position.y + height)
  })

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  }
}

/**
 * 估算文字宽度（中英文混合）
 */
export function estimateTextWidth(
  text: string, 
  fontSize: number = 14
): number {
  let width = 0
  for (const char of text) {
    // 中文字符约为字号宽度，英文约为字号的0.6倍
    width += char.charCodeAt(0) > 127 ? fontSize : fontSize * 0.6
  }
  return Math.ceil(width)
}

/**
 * 计算两点之间的距离
 */
export function distance(
  p1: { x: number; y: number },
  p2: { x: number; y: number }
): number {
  return Math.sqrt(
    Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2)
  )
}

/**
 * 计算两点之间的角度（弧度）
 */
export function angle(
  p1: { x: number; y: number },
  p2: { x: number; y: number }
): number {
  return Math.atan2(p2.y - p1.y, p2.x - p1.x)
}

/**
 * 在椭圆轨道上计算位置
 */
export function ellipsePosition(
  cx: number,
  cy: number,
  a: number,
  b: number,
  angle: number
): { x: number; y: number } {
  return {
    x: cx + a * Math.cos(angle),
    y: cy + b * Math.sin(angle),
  }
}
```

```typescript
// src/utils/style.ts

/**
 * 黑白配色方案（符合中国论文规范）
 */
export const PAPER_COLORS = {
  // 背景色
  background: '#FFFFFF',
  nodeBackground: '#FFFFFF',
  
  // 边框色
  border: '#000000',
  borderLight: '#333333',
  
  // 文字色
  text: '#000000',
  textSecondary: '#333333',
  
  // 线条色
  line: '#000000',
  lineLight: '#666666',
  
  // 填充色（灰度）
  fill10: '#F5F5F5',
  fill20: '#E5E5E5',
  fill30: '#D5D5D5',
  fill40: '#C5C5C5',
  fill50: '#B5B5B5',
} as const

/**
 * 论文规范字体配置
 */
export const PAPER_FONTS = {
  // 中文字体
  chinese: 'SimSun, Songti SC, STSong, serif',
  
  // 英文字体
  english: 'Times New Roman, serif',
  
  // 等宽字体
  mono: 'Courier New, monospace',
  
  // 默认字号
  defaultSize: 12,
  titleSize: 14,
  subtitleSize: 12,
  bodySize: 10.5,  // 五号字
} as const

/**
 * 节点样式预设
 */
export const NODE_STYLES = {
  // 矩形节点
  rectangle: {
    backgroundColor: PAPER_COLORS.nodeBackground,
    borderColor: PAPER_COLORS.border,
    borderWidth: 1,
    borderStyle: 'solid' as const,
    textColor: PAPER_COLORS.text,
    fontSize: PAPER_FONTS.defaultSize,
    fontFamily: PAPER_FONTS.chinese,
    padding: '8px 16px',
    borderRadius: '2px',
  },
  
  // 椭圆节点
  ellipse: {
    backgroundColor: PAPER_COLORS.nodeBackground,
    borderColor: PAPER_COLORS.border,
    borderWidth: 1,
    borderStyle: 'solid' as const,
    textColor: PAPER_COLORS.text,
    fontSize: PAPER_FONTS.defaultSize,
    fontFamily: PAPER_FONTS.chinese,
    padding: '8px 16px',
    borderRadius: '50%',
  },
  
  // 菱形节点（决策节点）
  diamond: {
    backgroundColor: PAPER_COLORS.nodeBackground,
    borderColor: PAPER_COLORS.border,
    borderWidth: 1.5,
    borderStyle: 'solid' as const,
    textColor: PAPER_COLORS.text,
    fontSize: PAPER_FONTS.defaultSize,
    fontFamily: PAPER_FONTS.chinese,
  },
} as const

/**
 * 边样式预设
 */
export const EDGE_STYLES = {
  // 实线箭头
  solid: {
    stroke: PAPER_COLORS.line,
    strokeWidth: 1,
    markerEnd: { type: 'arrowclosed' as const, color: PAPER_COLORS.line },
  },
  
  // 虚线箭头
  dashed: {
    stroke: PAPER_COLORS.line,
    strokeWidth: 1,
    strokeDasharray: '5,5',
    markerEnd: { type: 'arrowclosed' as const, color: PAPER_COLORS.line },
  },
  
  // 无箭头实线
  line: {
    stroke: PAPER_COLORS.line,
    strokeWidth: 1,
  },
  
  // 无箭头虚线
  dotted: {
    stroke: PAPER_COLORS.line,
    strokeWidth: 1,
    strokeDasharray: '3,3',
  },
} as const
```

### 5.3 公共Hooks

```typescript
// src/core/hooks/useDiagram.ts

import { useCallback, useMemo } from 'react'
import { useDiagramStore } from '../../store/diagramStore'
import { nodeRegistry } from '../registry/NodeRegistry'
import { edgeRegistry } from '../registry/EdgeRegistry'
import { layoutRegistry } from '../registry/LayoutRegistry'
import type { DiagramType } from '../types/diagram'
import type { Node, Edge } from '@xyflow/react'

export function useDiagram() {
  const store = useDiagramStore()
  
  // 获取当前图表类型的节点类型
  const nodeTypes = useMemo(() => {
    const types: Record<string, React.ComponentType<any>> = {}
    const defs = nodeRegistry.getByDiagramType(store.currentType)
    
    defs.forEach(def => {
      types[def.type] = def.component
    })
    
    return types
  }, [store.currentType])
  
  // 获取当前图表类型的边类型
  const edgeTypes = useMemo(() => {
    const types: Record<string, React.ComponentType<any>> = {}
    const defs = edgeRegistry.getAll()
    
    defs.forEach(def => {
      types[def.type] = def.component
    })
    
    return types
  }, [])
  
  // 自动布局
  const autoLayout = useCallback((direction?: 'TB' | 'LR') => {
    const layout = layoutRegistry.getDefault(store.currentType)
    if (!layout) return
    
    const result = layout.layout({
      nodes: store.nodes,
      edges: store.edges,
      direction: direction || 'TB',
    })
    
    store.setNodes(result.nodes)
    store.setEdges(result.edges)
  }, [store])
  
  // 添加节点
  const addNode = useCallback((
    type: string, 
    position: { x: number; y: number },
    data?: Record<string, unknown>
  ) => {
    const def = nodeRegistry.get(type)
    if (!def) return
    
    const newNode: Node = {
      id: `${type}-${Date.now()}`,
      type,
      position,
      data: { ...def.defaultData, ...data },
      ...def.defaultSize ? { 
        width: def.defaultSize.width, 
        height: def.defaultSize.height 
      } : {},
    }
    
    store.addNode(newNode)
    return newNode
  }, [store])
  
  return {
    ...store,
    nodeTypes,
    edgeTypes,
    autoLayout,
    addNode,
  }
}
```

---

## 6. 重构步骤建议

### 6.1 分阶段实施计划

```
阶段1: 基础架构搭建 (1-2周)
├── 创建 core/ 目录结构
├── 定义核心类型接口
├── 实现注册中心
└── 创建基础组件

阶段2: 现有图表迁移 (2-3周)
├── 迁移用例图为插件
├── 迁移功能结构图为插件
├── 迁移实体属性图为插件
├── 统一状态管理
└── 迁移导出功能

阶段3: 新增图表开发 (3-4周)
├── 开发时序图插件
├── 开发类图插件
├── 开发活动图插件
└── 开发部署图插件

阶段4: 新增功能开发 (2-3周)
├── Visio导出插件
├── 模板库系统
├── 模板管理界面
└── 模板导入/导出

阶段5: 优化和完善 (1-2周)
├── 性能优化
├── 文档完善
├── 测试覆盖
└── 用户反馈迭代
```

### 6.2 向后兼容策略

1. **渐进式迁移**
   - 保留旧代码路径，通过适配器模式桥接
   - 新功能使用新架构，旧功能逐步迁移

2. **数据格式兼容**
   - 旧格式自动转换为新格式
   - 导出时支持新旧两种格式

3. **API兼容层**
   - 创建兼容层包装旧API
   - 逐步废弃旧API，提供迁移指南

```typescript
// src/core/compat/legacy-adapter.ts

/**
 * 旧格式兼容适配器
 * 将旧的数据结构转换为新的插件格式
 */
export function migrateLegacyConfig(legacy: any): DiagramConfig {
  // 检测旧格式
  if (legacy.type && legacy.nodes) {
    // 已经是新格式
    return legacy as DiagramConfig
  }
  
  // 旧格式转换
  return {
    type: detectDiagramType(legacy),
    title: legacy.title || '',
    nodes: legacy.nodes.map(migrateLegacyNode),
    edges: legacy.edges.map(migrateLegacyEdge),
    metadata: {
      createdAt: legacy.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  }
}

function detectDiagramType(data: any): DiagramType {
  // 根据节点类型推断图表类型
  const nodeTypes = new Set(data.nodes?.map((n: any) => n.type))
  
  if (nodeTypes.has('actor') || nodeTypes.has('usecase')) {
    return 'usecase'
  }
  if (nodeTypes.has('rectangle') && !nodeTypes.has('ellipse')) {
    return 'structure'
  }
  if (nodeTypes.has('ellipse')) {
    return 'entity'
  }
  
  return 'usecase' // 默认
}

function migrateLegacyNode(node: any): Node {
  return {
    id: node.id,
    type: node.type || 'rectangle',
    position: node.position || { x: 0, y: 0 },
    data: node.data || { label: node.label || '' },
  }
}

function migrateLegacyEdge(edge: any): Edge {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: edge.type || 'default',
    data: edge.data,
  }
}
```

---

## 7. 关键代码示例

### 7.1 插件注册入口

```typescript
// src/plugins/index.ts

import { nodeRegistry } from '../core/registry/NodeRegistry'
import { edgeRegistry } from '../core/registry/EdgeRegistry'
import { layoutRegistry } from '../core/registry/LayoutRegistry'
import { diagramRegistry } from '../core/registry/DiagramRegistry'
import { exportRegistry } from '../core/registry/ExportRegistry'

// 图表插件
import usecasePlugin from './diagrams/usecase'
import structurePlugin from './diagrams/structure'
import entityPlugin from './diagrams/entity'
import sequencePlugin from './diagrams/sequence'
import classPlugin from './diagrams/class'
import activityPlugin from './diagrams/activity'
import deploymentPlugin from './diagrams/deployment'

// 布局插件
import dagreLayout from './layouts/dagre'
import treeLayout from './layouts/tree'
import sequenceLayout from './layouts/sequence'

// 导出插件
import svgExporter from './exporters/svg'
import drawioExporter from './exporters/drawio'
import visioExporter from './exporters/visio'
import pngExporter from './exporters/png'

export function registerAllPlugins() {
  // 注册图表插件
  const diagramPlugins = [
    usecasePlugin,
    structurePlugin,
    entityPlugin,
    sequencePlugin,
    classPlugin,
    activityPlugin,
    deploymentPlugin,
  ]
  
  diagramPlugins.forEach(plugin => {
    diagramRegistry.register(plugin)
    
    // 注册节点类型
    plugin.nodeTypes.forEach(nodeType => {
      nodeRegistry.register(nodeType)
    })
    
    // 注册边类型
    plugin.edgeTypes.forEach(edgeType => {
      edgeRegistry.register(edgeType)
    })
  })
  
  // 注册布局插件
  ;[dagreLayout, treeLayout, sequenceLayout].forEach(plugin => {
    layoutRegistry.register(plugin)
  })
  
  // 注册导出插件
  ;[svgExporter, drawioExporter, visioExporter, pngExporter].forEach(plugin => {
    exportRegistry.register(plugin)
  })
}
```

### 7.2 统一画布组件

```typescript
// src/components/canvas/DiagramCanvas.tsx

import { useCallback, useMemo } from 'react'
import { ReactFlow, Background, MiniMap, Controls } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useDiagram } from '../../core/hooks/useDiagram'
import { diagramRegistry } from '../../core/registry/DiagramRegistry'
import { Toolbar } from './Toolbar'
import type { DiagramType } from '../../core/types/diagram'

interface DiagramCanvasProps {
  type: DiagramType
  showGrid?: boolean
  showMinimap?: boolean
  readOnly?: boolean
  onNodeClick?: (nodeId: string) => void
  onEdgeClick?: (edgeId: string) => void
}

export function DiagramCanvas({
  type,
  showGrid = true,
  showMinimap = true,
  readOnly = false,
  onNodeClick,
  onEdgeClick,
}: DiagramCanvasProps) {
  const {
    nodes,
    edges,
    nodeTypes,
    edgeTypes,
    onNodesChange,
    onEdgesChange,
    selectNode,
    selectEdge,
  } = useDiagram()
  
  const handleNodeClick = useCallback((_: any, node: any) => {
    selectNode(node.id)
    onNodeClick?.(node.id)
  }, [selectNode, onNodeClick])
  
  const handleEdgeClick = useCallback((_: any, edge: any) => {
    selectEdge(edge.id)
    onEdgeClick?.(edge.id)
  }, [selectEdge, onEdgeClick])
  
  const handlePaneClick = useCallback(() => {
    selectNode(null)
    selectEdge(null)
  }, [selectNode, selectEdge])
  
  return (
    <div className="w-full h-full flex flex-col">
      <Toolbar />
      
      <div className="flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={handleNodeClick}
          onEdgeClick={handleEdgeClick}
          onPaneClick={handlePaneClick}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          nodesDraggable={!readOnly}
          nodesConnectable={!readOnly}
          elementsSelectable={!readOnly}
          style={{ backgroundColor: '#fff' }}
        >
          {showGrid && <Background color="#e5e5e5" gap={20} />}
          {showMinimap && <MiniMap />}
          <Controls />
        </ReactFlow>
      </div>
    </div>
  )
}
```

### 7.3 模板面板组件

```typescript
// src/components/panels/TemplatePanel.tsx

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useTemplateStore } from '../../store/templateStore'
import { useDiagramStore } from '../../store/diagramStore'
import type { DiagramTemplate } from '../../core/types/template'
import type { DiagramType } from '../../core/types/diagram'

interface TemplatePanelProps {
  currentType: DiagramType
}

export function TemplatePanel({ currentType }: TemplatePanelProps) {
  const { t } = useTranslation()
  const { 
    templates, 
    isLoading, 
    loadTemplates, 
    getTemplatesByType,
    selectTemplate 
  } = useTemplateStore()
  
  const { loadConfig } = useDiagramStore()
  
  useEffect(() => {
    loadTemplates()
  }, [loadTemplates])
  
  const filteredTemplates = getTemplatesByType(currentType)
  
  const handleApplyTemplate = (template: DiagramTemplate) => {
    loadConfig({
      type: template.diagramType,
      title: template.name,
      nodes: template.data.nodes as any,
      edges: template.data.edges as any,
    })
    selectTemplate(template.id)
  }
  
  if (isLoading) {
    return (
      <div className="p-4 text-center text-gray-500">
        {t('template.loading')}
      </div>
    )
  }
  
  return (
    <div className="p-4">
      <h3 className="text-lg font-semibold mb-4">
        {t('template.title')}
      </h3>
      
      {filteredTemplates.length === 0 ? (
        <div className="text-center text-gray-500 py-8">
          {t('template.empty')}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {filteredTemplates.map(template => (
            <TemplateCard
              key={template.id}
              template={template}
              onClick={() => handleApplyTemplate(template)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function TemplateCard({ 
  template, 
  onClick 
}: { 
  template: DiagramTemplate
  onClick: () => void 
}) {
  return (
    <div
      className="border rounded-lg p-3 cursor-pointer hover:border-blue-500 
                 hover:shadow-md transition-all"
      onClick={onClick}
    >
      {template.thumbnail ? (
        <img 
          src={template.thumbnail} 
          alt={template.name}
          className="w-full h-24 object-cover rounded mb-2"
        />
      ) : (
        <div className="w-full h-24 bg-gray-100 rounded mb-2 
                       flex items-center justify-center text-gray-400">
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                  d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5z" />
          </svg>
        </div>
      )}
      
      <div className="font-medium text-sm truncate">{template.name}</div>
      
      {template.description && (
        <div className="text-xs text-gray-500 mt-1 line-clamp-2">
          {template.description}
        </div>
      )}
      
      {template.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {template.tags.slice(0, 3).map(tag => (
            <span 
              key={tag}
              className="px-2 py-0.5 text-xs bg-gray-100 rounded"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
```

---

## 8. 总结

### 8.1 架构优势

| 优势 | 说明 |
|------|------|
| **可扩展性** | 新增图表只需实现插件接口并注册 |
| **可维护性** | 每种图表独立模块，职责清晰 |
| **可复用性** | 公共组件、工具函数、类型定义统一管理 |
| **类型安全** | 完整的TypeScript类型定义 |
| **测试友好** | 插件接口便于单元测试 |

### 8.2 注意事项

1. **性能优化**
   - 使用React.memo避免不必要的重渲染
   - 大量节点使用虚拟化渲染
   - 布局计算使用Web Worker

2. **国际化**
   - 每个插件自带i18n文件
   - 支持中英文切换

3. **文档**
   - 每个插件接口需要JSDoc注释
   - 提供插件开发指南

4. **测试**
   - 核心接口需要单元测试
   - 插件需要集成测试
