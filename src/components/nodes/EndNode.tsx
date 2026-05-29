import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'

function EndNode() {
  return (
    <div style={{ position: 'relative', width: 30, height: 30 }}>
      <svg width="30" height="30" viewBox="0 0 30 30">
        <circle cx="15" cy="15" r="14" fill="none" stroke="#000" strokeWidth="2" />
        <circle cx="15" cy="15" r="10" fill="#000" />
      </svg>
      <Handle type="target" position={Position.Top} id="top" style={{ visibility: 'hidden' }} />
    </div>
  )
}

export default memo(EndNode)
