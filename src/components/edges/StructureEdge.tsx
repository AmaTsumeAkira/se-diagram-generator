import { BaseEdge } from '@xyflow/react'
import type { EdgeProps } from '@xyflow/react'

/**
 * 功能结构图专用边：根→模块→功能 步进折线
 * 偏移量 = 垂直间距的一半，保证同一父节点所有子边水平段对齐
 */
export default function StructureEdge({
  sourceX, sourceY,
  targetX, targetY,
  style,
}: EdgeProps) {
  const offset = Math.abs(targetY - sourceY) / 2

  // 从源节点底部出发 → 下偏移 → 水平到目标X → 下到目标顶部
  const path = `M ${sourceX} ${sourceY} L ${sourceX} ${sourceY + offset} L ${targetX} ${sourceY + offset} L ${targetX} ${targetY}`

  return <BaseEdge path={path} style={style} />
}
