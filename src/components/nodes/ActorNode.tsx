import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps, Node } from '@xyflow/react'
import type { DiagramNodeData } from '../../types/diagram'

function ActorNode({ data }: NodeProps<Node<DiagramNodeData>>) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ width: 55, height: 125, position: 'relative' }}>
        <svg
          viewBox="0 0 55 125"
          width="55"
          height="125"
          fill="none"
          stroke="#000"
          strokeWidth="1.5"
        >
          <circle cx="27" cy="12" r="10" />
          <line x1="27" y1="22" x2="27" y2="68" />
          {/* 双臂对称，y=40 精准对应 Handle top=40，1:1 无换算误差 */}
          <line x1="0" y1="40" x2="55" y2="40" />
          <line x1="27" y1="68" x2="10" y2="102" />
          <line x1="27" y1="68" x2="44" y2="102" />
        </svg>
        {/* SVG viewBox h=125 1:1映射渲染高度 → arm y=40 = Handle top=40 */}
        <Handle
          type="source"
          position={Position.Right}
          id="arm"
          style={{
            top: 40,
            width: 0,
            height: 0,
            minWidth: 0,
            minHeight: 0,
            border: 'none',
            background: 'transparent',
            transform: 'none',
            visibility: 'hidden',
          }}
        />
      </div>
      <span style={{ fontSize: 14, marginTop: 4 }}>{data.label}</span>
    </div>
  )
}

export default memo(ActorNode)
