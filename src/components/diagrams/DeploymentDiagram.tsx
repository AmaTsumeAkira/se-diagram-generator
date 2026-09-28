import { useMemo } from 'react'
import type { Edge, Node } from '@xyflow/react'
import { deploymentSvg } from '../../utils/svgExport'
import type { DiagramNodeData } from '../../types/diagram'
import SvgCanvas from './SvgCanvas'

interface Props {
  nodes: Node<DiagramNodeData>[]
  edges: Edge[]
  showGrid?: boolean
}

/**
 * 部署图 —— 本地自绘 SVG 渲染，**不再使用 drawio / viewer.diagrams.net**。
 *
 * `deploymentSvg()`（原「导出图片」用的渲染器）已包含：server / database（圆柱）/
 * component / artifact / node / browser / mobile 的形状与 «stereotype» 标注、
 * technology 技术栈文字、以及连线标签。复用后首屏毫秒级、离线可用，且**所见即导出**。
 *
 * 「导出图片 → 下载全图 Drawio」保留，需要拿去 draw.io 继续编辑时可用。
 */
export default function DeploymentDiagram({ nodes, edges }: Props) {
  const svg = useMemo(() => deploymentSvg(nodes, edges), [nodes, edges])
  return <SvgCanvas svg={svg} />
}
