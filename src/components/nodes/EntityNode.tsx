import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps, Node } from '@xyflow/react'
import type { DiagramNodeData } from '../../types/diagram'

/**
 * E-R 图中心实体矩形节点
 * 中心 Handle (id="c") 使连线从矩形正中心辐射而出
 * 矩形 zIndex=20 覆盖在连线上方，线条被白色背景遮挡，
 * 视觉上呈现为从矩形边框精准伸出
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
      {/* 中心辐射源：连线从此点发出 */}
      <Handle
        type="source"
        position={Position.Left}
        id="c"
        style={{ top: '50%', left: '50%', visibility: 'hidden' }}
      />
      <span>{data.label}</span>
    </div>
  )
}

export default memo(EntityNode)
