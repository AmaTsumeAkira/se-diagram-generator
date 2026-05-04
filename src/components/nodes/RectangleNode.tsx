import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps, Node } from '@xyflow/react'
import type { DiagramNodeData } from '../../types/diagram'

/**
 * 树状架构图专用矩形节点 — 仅保留顶部 target(t) 和底部 source(bs) Handle
 */
function RectangleNode({ data }: NodeProps<Node<DiagramNodeData>>) {
  const vertical = data.vertical as boolean

  if (vertical) {
    return (
      <div
        style={{
          width: 20, height: 110,
          border: '1px solid #000', background: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative',
        }}
      >
        <span style={{ writingMode: 'vertical-rl', letterSpacing: 2, fontSize: 14 }}>
          {data.label}
        </span>
        <Handle type="target" position={Position.Top} id="t" style={{ visibility: 'hidden' }} />
        <Handle type="source" position={Position.Bottom} id="bs" style={{ visibility: 'hidden' }} />
      </div>
    )
  }

  return (
    <div
      style={{
        border: '1px solid #000', background: '#fff',
        padding: '6px 16px', minWidth: 80,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 14, position: 'relative',
      }}
    >
      <Handle type="target" position={Position.Top} id="t" style={{ visibility: 'hidden' }} />
      <Handle type="source" position={Position.Bottom} id="bs" style={{ visibility: 'hidden' }} />
      <span>{data.label}</span>
    </div>
  )
}

export default memo(RectangleNode)
