import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps, Node } from '@xyflow/react'
import type { DiagramNodeData } from '../../types/diagram'

function ActorNode({ data }: NodeProps<Node<DiagramNodeData>>) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
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
        <line x1="10" y1="42" x2="50" y2="42" />
        <line x1="30" y1="70" x2="12" y2="105" />
        <line x1="30" y1="70" x2="48" y2="105" />
      </svg>
      <span style={{ fontSize: 14, marginTop: 4 }}>{data.label}</span>

      {/* 唯一 Handle：右侧手臂高度，所有箭头从此辐射 */}
      <Handle type="source" position={Position.Right} id="arm" style={{ top: '44px', visibility: 'hidden' }} />
    </div>
  )
}

export default memo(ActorNode)
