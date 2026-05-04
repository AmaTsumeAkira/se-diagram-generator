import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps, Node } from '@xyflow/react'
import type { DiagramNodeData } from '../../types/diagram'

/**
 * E-R 图中心实体矩形节点 — 四边 Handle，用于向四周属性辐射连线
 * zIndex 由 EntityAttributeDiagram 统一设为 20，覆盖在所有连线上方
 */
function EntityNode({ data }: NodeProps<Node<DiagramNodeData>>) {
  return (
    <div
      style={{
        border: '1px solid #000',
        background: '#fff',
        padding: '6px 16px',
        minWidth: 80,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 14,
        position: 'relative',
      }}
    >
      <Handle type="source" position={Position.Top} id="ts" style={{ visibility: 'hidden' }} />
      <Handle type="source" position={Position.Right} id="rs" style={{ visibility: 'hidden' }} />
      <Handle type="source" position={Position.Bottom} id="bs" style={{ visibility: 'hidden' }} />
      <Handle type="source" position={Position.Left} id="ls" style={{ visibility: 'hidden' }} />
      <span>{data.label}</span>
    </div>
  )
}

export default memo(EntityNode)
