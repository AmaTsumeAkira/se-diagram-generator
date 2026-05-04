import { useMemo } from 'react'
import {
  ReactFlow,
  Background,
  type Edge,
  type Node,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import EntityNode from '../nodes/EntityNode'
import AttributeEllipseNode from '../nodes/AttributeEllipseNode'
import type { DiagramNodeData } from '../../types/diagram'

const nodeTypes = { rectangle: EntityNode, ellipse: AttributeEllipseNode }

interface Props {
  entity: Node<DiagramNodeData>
  attributes: Node<DiagramNodeData>[]
  edges: Edge[]
  orbitA?: number
  orbitB?: number
}

/**
 * 椭圆极坐标系:
 *   x = cx + a * cos(θ)
 *   y = cy + b * sin(θ)
 * 图层: 连线(z=0) → 椭圆属性(z=10) → 中心实体(z=20)
 */
export default function EntityAttributeDiagram({
  entity,
  attributes,
  edges,
  orbitA = 200,
  orbitB = Math.round(orbitA * 0.55),
}: Props) {
  const positionedNodes = useMemo(() => {
    const cx = 350
    const cy = 250
    const n = attributes.length

    const attrNodes = attributes.map((attr, i) => {
      const angle = -Math.PI / 2 + (2 * Math.PI * i) / n
      const nodeCx = cx + orbitA * Math.cos(angle)
      const nodeCy = cy + orbitB * Math.sin(angle)
      const rx = (attr.data.rx as number) ?? 45
      const ry = (attr.data.ry as number) ?? 18

      return {
        ...attr,
        position: { x: nodeCx - rx, y: nodeCy - ry },
        zIndex: 10,
      }
    })

    const entityNode = {
      ...entity,
      position: { x: cx - 45, y: cy - 18 },
      zIndex: 20,
    }

    return [entityNode, ...attrNodes]
  }, [entity, attributes, orbitA, orbitB])

  const styledEdges = useMemo(
    () =>
      edges.map((e) => ({
        ...e,
        type: 'straight' as const,
        targetHandle: 'c',
        style: { stroke: '#000', strokeWidth: 1.2 },
        zIndex: 0,
      })),
    [edges]
  )

  return (
    <ReactFlow
      nodes={positionedNodes}
      edges={styledEdges}
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
