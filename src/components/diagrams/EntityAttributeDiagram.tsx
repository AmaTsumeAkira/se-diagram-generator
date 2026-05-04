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

interface EntityGroup {
  entity: Node<DiagramNodeData>
  attributes: Node<DiagramNodeData>[]
  edges: Edge[]
}

interface Props {
  groups: EntityGroup[]
}

export default function EntityAttributeDiagram({ groups }: Props) {
  const positionedNodes = useMemo(() => {
    const cols = Math.ceil(Math.sqrt(groups.length))
    const cellW = 400
    const cellH = 400
    const cxOff = 200
    const cyOff = 220

    const rows: EntityGroup[][] = []
    for (let i = 0; i < groups.length; i += cols) rows.push(groups.slice(i, i + cols))

    const result: Node<DiagramNodeData>[] = []

    rows.forEach((row, ri) => {
      row.forEach((g, ci) => {
        const baseX = ci * cellW
        const baseY = ri * cellH
        const cx = baseX + cxOff
        const cy = baseY + cyOff
        const n = g.attributes.length

        const a = 100 + n * 10
        const b = Math.round(a * 0.55)

        const attrNodes = g.attributes.map((attr, i) => {
          const angle = -Math.PI / 2 + (2 * Math.PI * i) / n
          const nodeCx = cx + a * Math.cos(angle)
          const nodeCy = cy + b * Math.sin(angle)
          const rx = (attr.data.rx as number) ?? 45
          const ry = (attr.data.ry as number) ?? 18
          return { ...attr, position: { x: nodeCx - rx, y: nodeCy - ry }, zIndex: 10 }
        })

        const entityNode = { ...g.entity, position: { x: cx - 45, y: cy - 18 }, zIndex: 20 }
        result.push(entityNode, ...attrNodes)
      })
    })

    return result
  }, [groups])

  const styledEdges = useMemo(() => {
    const all: Edge[] = []
    groups.forEach((g) => {
      g.edges.forEach((e) => {
        all.push({
          ...e,
          type: 'straight' as const,
          sourceHandle: 'c',
          targetHandle: 'c',
          style: { stroke: '#000', strokeWidth: 1.2 },
          zIndex: 0,
        })
      })
    })
    return all
  }, [groups])

  return (
    <ReactFlow nodes={positionedNodes} edges={styledEdges} nodeTypes={nodeTypes}
      fitView fitViewOptions={{ padding: 0.3 }}
      nodesDraggable={false} nodesConnectable={false} elementsSelectable={false}>
      <Background color="#e5e5e5" gap={20} />
    </ReactFlow>
  )
}
