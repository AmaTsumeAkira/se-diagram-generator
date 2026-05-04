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

interface Props {
  actor: Node<DiagramNodeData>
  useCases: Node<DiagramNodeData>[]
  edges: Edge[]
}

export default function UseCaseDiagram({ actor, useCases, edges }: Props) {
  const positionedNodes = useMemo(() => {
    const actorX = 40
    const actorY = 60
    const ucCenterX = 300
    const spacing = 50

    const totalH = (useCases.length - 1) * spacing
    const startY = actorY + 70 - totalH / 2

    const positionedActor = {
      ...actor,
      position: { x: actorX, y: actorY },
    }

    const positionedUseCases = useCases.map((uc, i) => {
      const rx = (uc.data.rx as number) ?? 60
      const ry = (uc.data.ry as number) ?? 15
      return {
        ...uc,
        position: { x: ucCenterX - rx, y: startY + i * spacing - ry },
      }
    })

    return [positionedActor, ...positionedUseCases]
  }, [actor, useCases])

  const styledEdges = useMemo(
    () =>
      edges.map((e) => ({
        ...e,
        type: 'straight' as const,
        sourceHandle: 'arm',
        targetHandle: 'l',
        style: { stroke: '#000', strokeWidth: 1 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#000' },
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
