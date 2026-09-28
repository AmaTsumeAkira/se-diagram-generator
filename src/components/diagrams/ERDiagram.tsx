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
 *
 * 尺寸策略：**保持 SVG 的设计尺寸（1:1），超出部分交给容器滚动**。
 * 之前写的是 `[&>svg]:max-w-full [&>svg]:h-auto`：整图被等比压到容器宽度
 * （默认「字段环绕」实测 0.53 倍，12px 字号只剩 6.3px），而且高度同步变小后
 * 容器不会出现滚动条 —— 等于"既缩小了又没法看原尺寸"。
 *
 * 这里必须用「相对定位外壳 + 绝对定位滚动层」两层：
 * 直接把 overflow-auto 放在流内元素上，SVG 的固有宽度会成为父级 flex item
 * 的 min-content 宽度（min-width:auto），把父级撑到 6000+ px，
 * 结果是被外层 `overflow-hidden` 裁掉且不产生滚动条（实测 42 字段：clientWidth 6120、无滚动）。
 * 绝对定位层脱离文档流，不参与父级固有尺寸计算，容器才会稳定拿到可视宽度并出现滚动条。
 */
export default function ERDiagram({ nodes, edges, notation = 'chen' }: Props) {
  const svg = useMemo(() => erSvg(nodes, edges, { notation }), [nodes, edges, notation])

  return (
    <div className="w-full h-full relative bg-white overflow-hidden">
      {/* 内层不再加 padding：wrapSvg 本身已留 40px 白边，再加 p-4 会让
          「陈氏」（1166px ≤ 容器 1180px）也多出一条 18px 的横向滚动条。 */}
      <div
        className="absolute inset-0 overflow-auto"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </div>
  )
}
