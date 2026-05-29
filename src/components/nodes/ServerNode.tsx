import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps, Node } from '@xyflow/react'
import type { DeploymentNodeData } from '../../types/diagram'

function ServerNode({ data }: NodeProps<Node<DeploymentNodeData>>) {
  const width = 140
  const height = 100

  return (
    <div style={{ position: 'relative' }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <path
          d={`M 10 25 L 10 ${height - 10} L ${width - 10} ${height - 10} L ${width - 10} 25 L ${width / 2} 5 L 10 25 Z`}
          fill="#fff"
          stroke="#000"
          strokeWidth="2"
        />
        <line x1="10" y1="25" x2={width - 10} y2="25" stroke="#000" strokeWidth="1" />
      </svg>
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          fontSize: 12,
          textAlign: 'center',
          width: '80%',
          pointerEvents: 'none',
        }}
      >
        <div className="font-medium">{data.label}</div>
        {data.technology && (
          <div className="text-[10px] text-gray-500">{data.technology}</div>
        )}
      </div>
      <Handle type="target" position={Position.Top} id="top" style={{ visibility: 'hidden' }} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={{ visibility: 'hidden' }} />
      <Handle type="target" position={Position.Left} id="left" style={{ visibility: 'hidden' }} />
      <Handle type="source" position={Position.Right} id="right" style={{ visibility: 'hidden' }} />
    </div>
  )
}

export default memo(ServerNode)
