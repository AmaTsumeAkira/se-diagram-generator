import { useMemo } from 'react'
import type { Edge, Node } from '@xyflow/react'
import { flowchartSvg } from '../../utils/svgExport'
import type { DiagramNodeData } from '../../types/diagram'
import SvgCanvas from './SvgCanvas'

interface Props {
  nodes: Node<DiagramNodeData>[]
  edges: Edge[]
}

/**
 * 程序流程图（经典流程图符号）。
 *
 * 与其余自绘图共用 SvgCanvas（拖动平移 / 滚轮缩放 / 双指捏合 / 双击放大 / 适应画布），
 * 「所见即导出」：屏幕用的就是导出 PNG/SVG 的同一份 flowchartSvg()。
 *
 * 符号：开始/结束 = 胶囊、处理 = 直角矩形、判断 = 菱形；
 * 分支条件（是/否、有效/无效）直接写在线旁，不带方括号。
 */
export default function FlowchartDiagram({ nodes, edges }: Props) {
  const svg = useMemo(() => flowchartSvg(nodes, edges), [nodes, edges])
  return <SvgCanvas svg={svg} />
}
