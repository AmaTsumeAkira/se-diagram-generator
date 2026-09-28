import { useMemo } from 'react'
import type { Edge, Node } from '@xyflow/react'
import { structureSvg } from '../../utils/svgExport'
import type { DiagramNodeData } from '../../types/diagram'
import SvgCanvas from './SvgCanvas'

interface Props {
  nodes: Node<DiagramNodeData>[]
  edges: Edge[]
}

/**
 * 功能结构图 —— 本地自绘 SVG 渲染，**不再使用 drawio / viewer.diagrams.net**。
 *
 * 换掉 iframe 的原因：
 * - 远程渲染器冷启动实测 16~40s（白屏），离线 / 内网 / viewer 被墙时直接不可用；
 * - 跨域 iframe 内容父页面读不到，既无法判定"渲染完成"，也无法参与像素级导出；
 * - 而「导出图片」用的 `structureSvg()` 本来就是一套完整的自绘渲染器（同一套树形布局、
 *   竖排叶子、字体与间距设置）。直接复用它 → 首屏毫秒级，且**所见即导出**。
 *
 * 竖线锚点：`structureBox()` 是方框几何的唯一定义，画框 / 画线 / 包围盒 / drawio 导出共用，
 * 保证每条竖线都从父框底边中点出发、落在子框顶边中点（此前两处宽度算法不一致会偏移）。
 *
 * 「导出图片 → 下载全图 Drawio」仍然保留：需要把结构图拿去 draw.io 继续编辑时可用。
 */
export default function StructureDiagram({ nodes, edges }: Props) {
  const svg = useMemo(() => structureSvg(nodes, edges), [nodes, edges])
  return <SvgCanvas svg={svg} />
}
