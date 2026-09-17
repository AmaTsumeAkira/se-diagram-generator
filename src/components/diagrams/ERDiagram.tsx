import { useMemo } from 'react'
import type { Edge, Node } from '@xyflow/react'
import { erSvg } from '../../utils/svgExport'
import type { DiagramNodeData, ERNotation } from '../../types/diagram'

interface Props {
  nodes: Node<DiagramNodeData>[]
  edges: Edge[]
  notation?: ERNotation
}

/**
 * 总体 ER 图（支持四种表示法切换）
 * 使用自绘 SVG 渲染：实体/菱形支持绝对坐标，连线支持显式正交折线，
 * 布局完全可控，不再依赖外部 drawio viewer 的自动路由。
 */
export default function ERDiagram({ nodes, edges, notation = 'chen' }: Props) {
  const svg = useMemo(() => erSvg(nodes, edges, { notation }), [nodes, edges, notation])

  return (
    <div
      className="w-full h-full overflow-auto bg-white p-4 [&>svg]:max-w-full [&>svg]:h-auto"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
