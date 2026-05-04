import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps, Node } from '@xyflow/react'
import type { DiagramNodeData } from '../../types/diagram'

/**
 * E-R 图专用椭圆属性节点 — 仅保留中心 Handle (id="c")
 * 连线从实体中心辐射到属性椭圆的正中心，被椭圆白色背景完美遮挡
 */
function AttributeEllipseNode({ data }: NodeProps<Node<DiagramNodeData>>) {
  const rx = (data.rx as number) ?? 45
  const ry = (data.ry as number) ?? 18
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
      <Handle type="target" position={Position.Left} id="c" style={{ top: '50%', left: '50%', visibility: 'hidden' }} />
    </div>
  )
}

export default memo(AttributeEllipseNode)
