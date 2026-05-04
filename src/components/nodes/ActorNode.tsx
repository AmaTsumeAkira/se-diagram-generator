import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps, Node } from '@xyflow/react'
import type { DiagramNodeData } from '../../types/diagram'

function ActorNode({ data }: NodeProps<Node<DiagramNodeData>>) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ width: 55, height: 125, position: 'relative' }}>
        <svg
          viewBox="0 0 60 130"
          width="55"
          height="125"
          fill="none"
          stroke="#000"
          strokeWidth="1.5"
        >
          <circle cx="30" cy="12" r="10" />
          <line x1="30" y1="22" x2="30" y2="70" />
          {/* 双臂对称: x1=0 到 x2=60，以身体 x=30 为中心，等长 30 单位 */}
          <line x1="0" y1="42" x2="60" y2="42" />
          <line x1="30" y1="70" x2="12" y2="105" />
          <line x1="30" y1="70" x2="48" y2="105" />
        </svg>
        <Handle
          type="source"
          position={Position.Right}
          id="arm"
          style={{
            top: '40.4px',
            width: 0,
            height: 0,
            minWidth: 0,
            minHeight: 0,
            border: 'none',
            background: 'transparent',
            visibility: 'hidden',
          }}
        />
      </div>
      <span style={{ fontSize: 14, marginTop: 4 }}>{data.label}</span>
    </div>
  )
}

export default memo(ActorNode)
