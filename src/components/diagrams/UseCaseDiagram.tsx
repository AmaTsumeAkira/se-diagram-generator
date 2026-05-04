import { useMemo } from 'react'
import {
  ReactFlow,
  Background,
  MarkerType,
  type Edge,
  type Node,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import ActorNode from '../nodes/ActorNode'
import UseCaseEllipseNode from '../nodes/UseCaseEllipseNode'
import type { DiagramNodeData } from '../../types/diagram'

const nodeTypes = { actor: ActorNode, usecase: UseCaseEllipseNode }

interface ActorGroup {
  actor: Node<DiagramNodeData>
  useCases: Node<DiagramNodeData>[]
  edges: Edge[]
}

interface Props {
  groups: ActorGroup[]
}

export default function UseCaseDiagram({ groups }: Props) {
  const positionedNodes = useMemo(() => {
    const actorX = 40
    const actorH = 140
    const firstY = 60
    const colStartX = 260
    const colWidth = 180
    const ucSpacing = 50

    const result: Node<DiagramNodeData>[] = []

    groups.forEach((g, gi) => {
      const actorY = firstY + gi * actorH
      result.push({ ...g.actor, position: { x: actorX, y: actorY } })

      const colCx = colStartX + gi * colWidth
      const totalH = (g.useCases.length - 1) * ucSpacing
      const startY = actorY + 70 - totalH / 2

      g.useCases.forEach((uc, ui) => {
        const rx = (uc.data.rx as number) ?? 60
        const ry = (uc.data.ry as number) ?? 15
        result.push({ ...uc, position: { x: colCx - rx, y: startY + ui * ucSpacing - ry } })
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
          sourceHandle: 'arm',
          targetHandle: 'l',
          style: { stroke: '#000', strokeWidth: 1 },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#000' },
        })
      })
    })
    return all
  }, [groups])

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
