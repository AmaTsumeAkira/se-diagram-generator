import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'

function StartNode() {
  return (
    <div style={{ position: 'relative', width: 30, height: 30 }}>
      <svg width="30" height="30" viewBox="0 0 30 30">
        <circle cx="15" cy="15" r="14" fill="#000" stroke="#000" strokeWidth="2" />
      </svg>
      <Handle type="source" position={Position.Bottom} id="bottom" style={{ visibility: 'hidden' }} />
    </div>
  )
}

export default memo(StartNode)
