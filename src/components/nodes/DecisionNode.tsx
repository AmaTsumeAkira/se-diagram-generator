import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps, Node } from '@xyflow/react'
import type { DecisionNodeData } from '../../types/diagram'

function DecisionNode({ data }: NodeProps<Node<DecisionNodeData>>) {
  const size = 60

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <polygon
          points={`${size / 2},2 ${size - 2},${size / 2} ${size / 2},${size - 2} 2,${size / 2}`}
          fill="#fff"
          stroke="#000"
          strokeWidth="2"
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          fontSize: 11,
          textAlign: 'center',
          width: '70%',
          pointerEvents: 'none',
        }}
      >
        {data.label}
      </div>
      <Handle type="target" position={Position.Top} id="top" style={{ visibility: 'hidden' }} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={{ visibility: 'hidden' }} />
      <Handle type="source" position={Position.Left} id="left" style={{ visibility: 'hidden' }} />
      <Handle type="source" position={Position.Right} id="right" style={{ visibility: 'hidden' }} />
    </div>
  )
}

export default memo(DecisionNode)
