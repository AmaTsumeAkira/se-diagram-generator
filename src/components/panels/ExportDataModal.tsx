import type { Node, Edge } from '@xyflow/react'
import type { DiagramNodeData } from '../types/diagram'

interface Props {
  configs: Record<string, { nodes: Node<DiagramNodeData>[]; edges: Edge[] }>
  onClose: () => void
}

function configToQuickText(nodes: Node<DiagramNodeData>[], edges: Edge[], type: string): string {
  if (type === 'structure') {
    const childrenMap = new Map<string, string[]>()
    const parentMap = new Map<string, string>()
    edges.forEach((e) => {
      const list = childrenMap.get(e.source) || []
      list.push(e.target); childrenMap.set(e.source, list)
      parentMap.set(e.target, e.source)
    })
    const rootId = nodes.find((n) => !parentMap.has(n.id))?.id
    if (!rootId) return ''
    const rootNode = nodes.find((n) => n.id === rootId)
    const lines = [rootNode?.data.label || '系统']
    const lv1 = childrenMap.get(rootId) || []
    lv1.forEach((modId) => {
      const modNode = nodes.find((n) => n.id === modId)
      const funcs = (childrenMap.get(modId) || []).map((fid) => nodes.find((n) => n.id === fid)?.data.label || '')
      lines.push([modNode?.data.label || '', ...funcs].join(' '))
    })
    return lines.join('\n')
  }

  // usecase / entity
  const sourceType = type === 'usecase' ? 'actor' : 'rectangle'
  const sources = nodes.filter((n) => n.type === sourceType)
  return sources.map((src) => {
    const targets = edges
      .filter((e) => e.source === src.id)
      .map((e) => nodes.find((n) => n.id === e.target)?.data.label || '')
    return [src.data.label, ...targets].join(' ')
  }).join('\n')
}

export default function ExportDataModal({ configs, onClose }: Props) {
  const ucText = configToQuickText(configs.usecase.nodes, configs.usecase.edges, 'usecase')
  const stText = configToQuickText(configs.structure.nodes, configs.structure.edges, 'structure')
  const enText = configToQuickText(configs.entity.nodes, configs.entity.edges, 'entity')

  const mdText = `# 用例图\n${ucText}\n\n# 功能结构图\n${stText}\n\n# 实体属性图\n${enText}\n`

  const dl = (content: string, name: string, type: string) => {
    const blob = new Blob([content], { type })
    const a = document.createElement('a')
    a.download = name; a.href = URL.createObjectURL(blob); a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-[700px] max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold">导出数据</h3>
            <button onClick={() => dl(JSON.stringify(configs, (_, v) => {
              if (typeof v === 'object' && v !== null && 'position' in v) return undefined
              return v
            }, 2), 'diagram-configs.json', 'application/json')}
              className="px-3 py-1 text-xs bg-black text-white rounded hover:bg-gray-800">下载 JSON</button>
            <button onClick={() => dl(mdText, 'diagram-quick-format.md', 'text/markdown')}
              className="px-3 py-1 text-xs border border-black rounded hover:bg-gray-50">下载快速格式 (.md)</button>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-black text-lg leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {[
            { label: '用例图', text: ucText, placeholder: '管理员 业主管理 维修人员管理\n业主 个人中心 报修服务' },
            { label: '功能结构图', text: stText, placeholder: '公寓报修管理系统\n管理员 业主管理 维修人员管理\n业主 个人中心 报修服务' },
            { label: '实体属性图', text: enText, placeholder: '用户 用户ID 用户名 密码\n维修人员 员工ID 姓名 技能类型' },
          ].map(({ label, text, placeholder }) => (
            <div key={label}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-gray-600">{label}</span>
                <button onClick={() => navigator.clipboard.writeText(text)}
                  className="text-[10px] text-gray-400 hover:text-gray-600">复制</button>
              </div>
              <textarea readOnly className="w-full h-24 text-xs font-mono border border-gray-200 rounded p-2 bg-gray-50 resize-none focus:outline-none"
                value={text} placeholder={placeholder} />
            </div>
          ))}
          <p className="text-[10px] text-gray-400 text-center">
            以上为快速导入格式：空格分隔，首词为主名称。可在对应图表编辑面板中一键导入。
          </p>
        </div>
      </div>
    </div>
  )
}
