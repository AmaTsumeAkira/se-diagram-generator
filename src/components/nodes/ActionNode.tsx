import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps, Node } from '@xyflow/react'
import type { DiagramNodeData } from '../../types/diagram'

function ActionNode({ data }: NodeProps<Node<DiagramNodeData>>) {
  return (
    <div style={{ position: 'relative' }}>
      <div className="border-2 border-black bg-white px-4 py-2 text-center rounded-lg" style={{ minWidth: 120, minHeight: 40 }}>
        <span className="text-sm">{data.label}</span>
      </div>
      <Handle type="target" position={Position.Top} id="top" style={{ visibility: 'hidden' }} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={{ visibility: 'hidden' }} />
    </div>
  )
}

export default memo(ActionNode)
