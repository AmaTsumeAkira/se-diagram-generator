import { useMemo } from 'react'
import {
  ReactFlow,
  Background,
  type Edge,
  type Node,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import RectangleNode from '../nodes/RectangleNode'
import { layoutTreeStructure } from '../../utils/layout'
import type { DiagramNodeData } from '../../types/diagram'

const nodeTypes = { rectangle: RectangleNode }

interface Props {
  nodes: Node<DiagramNodeData>[]
  edges: Edge[]
}

/**
 * 系统功能结构图 — 树状直角层级结构
 * 使用自定义层次布局精确匹配参考 SVG 的三级树状结构：
 * - Level 0: 根节点居中
 * - Level 1: 子节点水平均分
 * - Level 2: 叶子节点分组排在各自父节点下方，竖排文字
 * - 连线: step 正交折线 (直角阶梯线)
 */
export default function StructureDiagram({ nodes: initialNodes, edges: initialEdges }: Props) {
  const { nodes, edges } = useMemo(
    () => layoutTreeStructure(initialNodes, initialEdges),
    [initialNodes, initialEdges]
  )

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.3 }}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
    >
      <Background color="#e5e5e5" gap={20} />
    </ReactFlow>
  )
}
