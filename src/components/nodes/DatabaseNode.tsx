import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps, Node } from '@xyflow/react'
import type { DeploymentNodeData } from '../../types/diagram'

function DatabaseNode({ data }: NodeProps<Node<DeploymentNodeData>>) {
  const width = 100
  const height = 80
  const ellipseRy = 12

  return (
    <div style={{ position: 'relative' }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <ellipse cx={width / 2} cy={ellipseRy} rx={width / 2 - 5} ry={ellipseRy} fill="#fff" stroke="#000" strokeWidth="2" />
        <line x1="5" y1={ellipseRy} x2="5" y2={height - ellipseRy} stroke="#000" strokeWidth="2" />
        <line x1={width - 5} y1={ellipseRy} x2={width - 5} y2={height - ellipseRy} stroke="#000" strokeWidth="2" />
        <path
          d={`M 5 ${height - ellipseRy} A ${width / 2 - 5} ${ellipseRy} 0 0 0 ${width - 5} ${height - ellipseRy}`}
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

export default memo(DatabaseNode)
