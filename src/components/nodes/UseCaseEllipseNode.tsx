import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps, Node } from '@xyflow/react'
import type { DiagramNodeData } from '../../types/diagram'

/**
 * 用例图专用椭圆节点 — 仅保留左侧 Handle (id="l")
 * 箭头从火柴人手臂出发，精准打到椭圆左侧中心
 */
function UseCaseEllipseNode({ data }: NodeProps<Node<DiagramNodeData>>) {
  const rx = (data.rx as number) ?? 60
  const ry = (data.ry as number) ?? 15
  const w = rx * 2
  const h = ry * 2

  return (
    <div style={{ width: w, height: h, position: 'relative' }}>
      <svg width={w} height={h} style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible' }}>
        <ellipse cx={rx} cy={ry} rx={rx} ry={ry} fill="#fff" stroke="#000" strokeWidth={1.2} />
      </svg>
      <div
        style={{
          position: 'absolute', top: 0, left: 0, width: w, height: h,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, whiteSpace: 'nowrap', pointerEvents: 'none',
        }}
      >
        {data.label}
      </div>
      <Handle type="target" position={Position.Left} id="l" style={{ visibility: 'hidden' }} />
    </div>
  )
}

export default memo(UseCaseEllipseNode)
