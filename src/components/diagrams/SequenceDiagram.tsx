import { useMemo } from 'react'
import type { Edge, Node } from '@xyflow/react'
import { sequenceSvg } from '../../utils/svgExport'
import type { DiagramNodeData } from '../../types/diagram'
import SvgCanvas from './SvgCanvas'

interface Props {
  nodes: Node<DiagramNodeData>[]
  edges: Edge[]
  showGrid?: boolean
}

/**
 * 时序图 —— 本地自绘 SVG 渲染，**不再使用 drawio / viewer.diagrams.net**。
 *
 * `sequenceSvg()`（原「导出图片」用的渲染器）已包含：参与者三种形状
 * （actor 火柴人 / system 方框 / database 圆柱）、虚线生命线、
 * 同步（实心箭头）/ 异步（开放箭头）/ 返回（虚线开放箭头）三种消息与消息文字。
 * 复用后首屏毫秒级、离线可用，且**所见即导出**。
 *
 * 「导出图片 → 下载全图 Drawio」保留，需要拿去 draw.io 继续编辑时可用。
 */
export default function SequenceDiagram({ nodes, edges }: Props) {
  const svg = useMemo(() => sequenceSvg(nodes, edges), [nodes, edges])
  return <SvgCanvas svg={svg} />
}
