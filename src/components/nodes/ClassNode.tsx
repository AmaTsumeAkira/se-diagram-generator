import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps, Node } from '@xyflow/react'
import type { ClassNodeData } from '../../types/diagram'

function ClassNode({ data }: NodeProps<Node<ClassNodeData>>) {
  const attributes = data.attributes || []
  const methods = data.methods || []
  const isAbstract = data.isAbstract || false
  const stereotype = data.stereotype

  return (
    <div className="border-2 border-black bg-white" style={{ minWidth: 160, fontSize: 12 }}>
      {/* 类名区域 */}
      <div className="border-b-2 border-black px-2 py-1.5 text-center bg-gray-50">
        {stereotype && (
          <div className="text-[10px] text-gray-500 italic">&lt;&lt;{stereotype}&gt;&gt;</div>
        )}
        <div className={`font-semibold ${isAbstract ? 'italic' : ''}`}>
          {data.label}
        </div>
      </div>

      {/* 属性区域 */}
      <div className="border-b-2 border-black px-2 py-1 min-h-[40px]">
        {attributes.length > 0 ? (
          attributes.map((attr, i) => (
            <div key={i} className="text-[11px] leading-5 whitespace-nowrap">{attr}</div>
          ))
        ) : (
          <div className="text-[11px] text-gray-400 leading-5">无属性</div>
        )}
      </div>

      {/* 方法区域 */}
      <div className="px-2 py-1 min-h-[40px]">
        {methods.length > 0 ? (
          methods.map((method, i) => (
            <div key={i} className="text-[11px] leading-5 whitespace-nowrap">{method}</div>
          ))
        ) : (
          <div className="text-[11px] text-gray-400 leading-5">无方法</div>
        )}
      </div>

      <Handle type="target" position={Position.Top} id="top" style={{ visibility: 'hidden' }} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={{ visibility: 'hidden' }} />
      <Handle type="target" position={Position.Left} id="left" style={{ visibility: 'hidden' }} />
      <Handle type="source" position={Position.Right} id="right" style={{ visibility: 'hidden' }} />
    </div>
  )
}

export default memo(ClassNode)
