import { useTranslation } from 'react-i18next'
import type { Node, Edge } from '@xyflow/react'
import type { DiagramNodeData } from '../../types/diagram'

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
  const { t } = useTranslation()
  const ucText = configToQuickText(configs.usecase?.nodes ?? [], configs.usecase?.edges ?? [], 'usecase')
  const stText = configToQuickText(configs.structure?.nodes ?? [], configs.structure?.edges ?? [], 'structure')
  const enText = configToQuickText(configs.entity?.nodes ?? [], configs.entity?.edges ?? [], 'entity')

  const mdText = `# ${t('app.usecase')}\n${ucText}\n\n# ${t('app.structure')}\n${stText}\n\n# ${t('app.entity')}\n${enText}\n`

  const dl = (content: string, name: string, type: string) => {
    const blob = new Blob([content], { type })
    const a = document.createElement('a')
    a.download = name; a.href = URL.createObjectURL(blob); a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-[700px] max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold">{t('dataExport.title')}</h3>
            <button onClick={() => {
              const flat: Record<string, any> = {}
              for (const [key, cfg] of Object.entries(configs)) {
                if (!cfg) continue
                flat[key] = {
                  nodes: cfg.nodes.map((n) => {
                    const base: any = {
                      id: n.id,
                      type: n.type,
                      label: n.data.label,
                      rx: n.data.rx,
                      ry: n.data.ry,
                      vertical: n.data.vertical,
                      fontSize: n.data.fontSize,
                      fontFamily: n.data.fontFamily,
                      spacing: n.data.spacing,
                      nodeH: n.data.nodeH,
                      nodeW: (n.data as any).nodeW,
                      row: n.data.row,
                      col: n.data.col,
                    }
                    const d = n.data as any
                    if (d.attributes) base.attributes = d.attributes
                    if (d.methods) base.methods = d.methods
                    if (d.isAbstract !== undefined) base.isAbstract = d.isAbstract
                    if (d.stereotype) base.stereotype = d.stereotype
                    if (d.participantType) base.participantType = d.participantType
                    if (d.technology) base.technology = d.technology
                    if (d.nodeType) base.nodeType = d.nodeType
                    return base
                  }),
                  edges: cfg.edges.map((e) => {
                    const base: any = { id: e.id, source: e.source, target: e.target }
                    if ((e as any).data) base.data = (e as any).data
                    if (e.label) base.label = e.label
                    return base
                  }),
                }
              }
              dl(JSON.stringify(flat, null, 2), 'diagram-configs.json', 'application/json')
            }}
              className="px-3 py-1 text-xs bg-black text-white rounded hover:bg-gray-800">{t('dataExport.downloadJson')}</button>
            <button onClick={() => dl(mdText, 'diagram-quick-format.md', 'text/markdown')}
              className="px-3 py-1 text-xs border border-black rounded hover:bg-gray-50">{t('dataExport.downloadMd')}</button>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-black text-lg leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {[
            { label: t('app.usecase'), text: ucText, placeholder: t('quickImport.hint') },
            { label: t('app.structure'), text: stText, placeholder: t('quickImport.hint') },
            { label: t('app.entity'), text: enText, placeholder: t('quickImport.hint') },
          ].map(({ label, text, placeholder }) => (
            <div key={label}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-gray-600">{label}</span>
                <button onClick={() => navigator.clipboard.writeText(text)}
                  className="text-[10px] text-gray-400 hover:text-gray-600">{t('dataExport.copy')}</button>
              </div>
              <textarea readOnly className="w-full h-24 text-xs font-mono border border-gray-200 rounded p-2 bg-gray-50 resize-none focus:outline-none"
                value={text} placeholder={placeholder} />
            </div>
          ))}
          <p className="text-[10px] text-gray-400 text-center">
            {t('dataExport.hint')}
          </p>
        </div>
      </div>
    </div>
  )
}
