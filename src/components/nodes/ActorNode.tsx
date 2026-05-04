import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps, Node } from '@xyflow/react'
import type { DiagramNodeData } from '../../types/diagram'

function ActorNode({ data }: NodeProps<Node<DiagramNodeData>>) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {/* 固定宽度容器，确保 Handle 紧贴 SVG 右边缘 */}
      <div style={{ width: 55, height: 125, position: 'relative' }}>
        <svg
          viewBox="0 0 60 130"
          width="55"
          height="125"
          fill="none"
          stroke="#000"
          strokeWidth="1.5"
        >
          <circle cx="30" cy="12" r="10" />
          <line x1="30" y1="22" x2="30" y2="70" />
          {/* 手臂 y=42，svgh=125/vbh=130 → 42*125/130=40.4  */}
          <line x1="10" y1="42" x2="50" y2="42" />
          <line x1="30" y1="70" x2="12" y2="105" />
          <line x1="30" y1="70" x2="48" y2="105" />
        </svg>
        {/* Handle 定位在 SVG 容器右边缘，手臂高度 (40px)，像素级紧贴右手 */}
        <Handle
          type="source"
          position={Position.Right}
          id="arm"
          style={{ top: 40, visibility: 'hidden' }}
        />
      </div>
      <span style={{ fontSize: 14, marginTop: 4 }}>{data.label}</span>
    </div>
  )
}

export default memo(ActorNode)
