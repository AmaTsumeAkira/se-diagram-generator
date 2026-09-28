import { useMemo } from 'react'
import type { Edge, Node } from '@xyflow/react'
import { activitySvg } from '../../utils/svgExport'
import type { DiagramNodeData } from '../../types/diagram'
import SvgCanvas from './SvgCanvas'

interface Props {
  nodes: Node<DiagramNodeData>[]
  edges: Edge[]
  showGrid?: boolean
}

/**
 * 活动图 —— 本地自绘 SVG 渲染，**不再使用 drawio / viewer.diagrams.net**。
 *
 * `activitySvg()`（原「导出图片」用的渲染器）已包含：开始（实心圆）/ 结束（同心圆）、
 * 动作用圆角框、判断用菱形、以及连线上的 guard 标签（如 `[是]` / `[否]` / `[提交后]`）。
 * 复用后首屏毫秒级、离线可用，且**所见即导出**。
 *
 * 「导出图片 → 下载全图 Drawio」保留，需要拿去 draw.io 继续编辑时可用。
 */
export default function ActivityDiagram({ nodes, edges }: Props) {
  const svg = useMemo(() => activitySvg(nodes, edges), [nodes, edges])
  return <SvgCanvas svg={svg} />
}
