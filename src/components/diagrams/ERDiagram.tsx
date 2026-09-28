import { useMemo } from 'react'
import type { Edge, Node } from '@xyflow/react'
import { erSvg } from '../../utils/svgExport'
import type { DiagramNodeData, ERNotation } from '../../types/diagram'
import SvgCanvas from './SvgCanvas'

interface Props {
  nodes: Node<DiagramNodeData>[]
  edges: Edge[]
  notation?: ERNotation
}

/**
 * 总体 ER 图（支持四种表示法切换）—— 本地自绘 SVG。
 *
 * 与其余自绘图共用 SvgCanvas：拖动平移 / 滚轮缩放 / 双指捏合 / 双击放大 / 适应画布，
 * 交互与用例图、实体属性图（React Flow）一致。
 *
 * 历史备注（旧实现用容器滚动，保留说明以免回退）：
 * 直接在流内元素上放 overflow-auto，SVG 的固有宽度会成为父级 flex item 的 min-content
 * 宽度，把父级撑到 6000+ px 后被外层 overflow-hidden 裁掉且不出滚动条；
 * 现在改为对内容做 translate+scale 变换（与 React Flow 相同），不再依赖滚动容器。
 */
export default function ERDiagram({ nodes, edges, notation = 'chen' }: Props) {
  const svg = useMemo(() => erSvg(nodes, edges, { notation }), [nodes, edges, notation])
  return <SvgCanvas svg={svg} />
}
