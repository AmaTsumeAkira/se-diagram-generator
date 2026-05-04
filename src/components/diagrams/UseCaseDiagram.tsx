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
    // 估算文字宽度：中文≈14px，英文≈8px
    const textW = (s: string) => { let w = 0; for (const ch of s) w += ch.charCodeAt(0) > 127 ? 14 : 8; return w }

    const cols = Math.ceil(Math.sqrt(groups.length))
    const actorOff = 40
    const ucOff = 280
    const cellW = 380
    const ucSpacing = 48
    const ucMinH = 30
    const rowGap = 50

    // 按行分组
    const rows: ActorGroup[][] = []
    for (let i = 0; i < groups.length; i += cols) {
      rows.push(groups.slice(i, i + cols))
    }

    // 每行高度 = 该行最多用例数的块高度
    const rowHeights = rows.map((row) => {
      const maxUc = Math.max(...row.map((g) => g.useCases.length), 1)
      return (maxUc - 1) * ucSpacing + ucMinH + rowGap
    })

    const result: Node<DiagramNodeData>[] = []
    let y = 40

    rows.forEach((row, ri) => {
      const rowH = rowHeights[ri]
      const blockH = rowH - rowGap

      row.forEach((g, ci) => {
        const cx = ci * cellW
        const totalH = (g.useCases.length - 1) * ucSpacing
        const actorY = y + blockH / 2 - 70
        const startY = y + blockH / 2 - totalH / 2

        result.push({ ...g.actor, position: { x: cx + actorOff, y: actorY } })

        const maxW = g.useCases.reduce((m, uc) => Math.max(m, textW(uc.data.label as string)), 0)
        const rx = Math.max(55, Math.ceil(maxW / 2) + 18)

        g.useCases.forEach((uc, ui) => {
          const ry = (uc.data.ry as number) ?? 15
          uc.data = { ...uc.data, rx, ry }
          result.push({ ...uc, position: { x: cx + ucOff - rx, y: startY + ui * ucSpacing - ry } })
        })
      })

      y += rowH
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
