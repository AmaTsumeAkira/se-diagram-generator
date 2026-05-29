import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps, Node } from '@xyflow/react'
import type { ParticipantNodeData } from '../../types/diagram'

function ParticipantNode({ data }: NodeProps<Node<ParticipantNodeData>>) {
  const participantType = data.participantType || 'system'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {participantType === 'actor' ? (
        <svg viewBox="0 0 55 100" width="45" height="80" fill="none" stroke="#000" strokeWidth="1.5">
          <circle cx="27" cy="12" r="10" />
          <line x1="27" y1="22" x2="27" y2="60" />
          <line x1="5" y1="40" x2="50" y2="40" />
          <line x1="27" y1="60" x2="10" y2="90" />
          <line x1="27" y1="60" x2="44" y2="90" />
        </svg>
      ) : (
        <div className="border-2 border-black bg-white px-4 py-2 text-center" style={{ minWidth: 100 }}>
          <span className="text-sm font-medium">{data.label}</span>
        </div>
      )}
      <Handle type="target" position={Position.Top} id="top" style={{ visibility: 'hidden' }} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={{ visibility: 'hidden' }} />
      <Handle type="target" position={Position.Left} id="left" style={{ visibility: 'hidden' }} />
      <Handle type="source" position={Position.Right} id="right" style={{ visibility: 'hidden' }} />
    </div>
  )
}

export default memo(ParticipantNode)
