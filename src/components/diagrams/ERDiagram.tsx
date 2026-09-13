import { useMemo } from 'react'
import type { Edge, Node } from '@xyflow/react'
import { erSvg } from '../../utils/svgExport'
import type { DiagramNodeData } from '../../types/diagram'

interface Props {
  nodes: Node<DiagramNodeData>[]
  edges: Edge[]
}

/**
 * 总体 ER 图（Chen 表示法）
 * 使用自绘 SVG 渲染：实体/菱形支持绝对坐标，连线支持显式正交折线，
 * 布局完全可控，不再依赖外部 drawio viewer 的自动路由。
 */
export default function ERDiagram({ nodes, edges }: Props) {
  const svg = useMemo(() => erSvg(nodes, edges), [nodes, edges])

  return (
    <div
      className="w-full h-full overflow-auto bg-white p-4 [&>svg]:max-w-full [&>svg]:h-auto"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
