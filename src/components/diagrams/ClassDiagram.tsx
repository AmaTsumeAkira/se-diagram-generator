import { useMemo } from 'react'
import type { Edge, Node } from '@xyflow/react'
import { classSvg } from '../../utils/svgExport'
import type { DiagramNodeData } from '../../types/diagram'
import SvgCanvas from './SvgCanvas'

interface Props {
  nodes: Node<DiagramNodeData>[]
  edges: Edge[]
  showGrid?: boolean
}

/**
 * 类图 —— 本地自绘 SVG 渲染，**不再使用 drawio / viewer.diagrams.net**（与功能结构图同一套改法）。
 *
 * `classSvg()` 本来就是「导出图片」用的渲染器：类框分三层（类名 / 属性 / 方法）、
 * «interface»/«enum» 构造型、抽象类斜体、继承（实心三角）/ 实现（虚线三角）/
 * 关联 / 依赖 / 聚合 / 组合的箭头与关系标签都在。复用它之后：
 * - 首屏毫秒级（不再等 viewer 拉几 MB 渲染器），离线可用；
 * - **所见即导出**，PNG/SVG 与屏幕完全一致。
 *
 * 「导出图片 → 下载全图 Drawio」保留，需要拿去 draw.io 继续编辑时可用。
 */
export default function ClassDiagram({ nodes, edges }: Props) {
  const svg = useMemo(() => classSvg(nodes, edges), [nodes, edges])
  return <SvgCanvas svg={svg} />
}
