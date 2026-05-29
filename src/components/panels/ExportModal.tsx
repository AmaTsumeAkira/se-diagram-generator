import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { toPng } from 'html-to-image'
import { useCaseSvg, structureSvg, entitySvg, erSvg, sequenceSvg, classSvg, activitySvg, deploymentSvg } from '../../utils/svgExport'
import { useCaseDrawio, structureDrawio, entityDrawio, erDrawio, sequenceDrawio, classDrawio, activityDrawio, deploymentDrawio } from '../../utils/drawioExport'
import { useCaseVisio, structureVisio, entityVisio, sequenceVisio, classVisio, activityVisio, deploymentVisio } from '../../utils/visioExport'
import type { Node, Edge } from '@xyflow/react'
import type { DiagramNodeData } from '../../types/diagram'

interface Props {
  active: string
  config: { nodes: Node<DiagramNodeData>[]; edges: Edge[] }
  flowRef: React.RefObject<HTMLDivElement | null>
  onClose: () => void
}

function buildGroups(nodes: Node<DiagramNodeData>[], edges: Edge[], active: string) {
  if (active === 'structure') {
    const childrenMap = new Map<string, string[]>()
    const parentMap = new Map<string, string>()
    edges.forEach((e) => {
      const list = childrenMap.get(e.source) || []
      list.push(e.target); childrenMap.set(e.source, list)
      parentMap.set(e.target, e.source)
    })
    const rootId = nodes.find((n) => !parentMap.has(n.id))?.id
    if (!rootId) return [{ ids: nodes.map((n) => n.id) }]
    const lv1 = childrenMap.get(rootId) || []
    return lv1.map((modId) => {
      const ids = [modId]
      const queue = [...(childrenMap.get(modId) || [])]
      while (queue.length) { const c = queue.shift()!; ids.push(c); queue.push(...(childrenMap.get(c) || [])) }
      return { ids }
    })
  }
  const sources = nodes.filter((n) => active === 'usecase' ? n.type === 'actor' : n.type === 'rectangle')
  return sources.map((src) => {
    const ids = [src.id]
    edges.filter((e) => e.source === src.id).forEach((e) => ids.push(e.target))
    return { ids }
  })
}

function buildSvg(active: string, nodes: Node<DiagramNodeData>[], edges: Edge[]) {
  switch (active) {
    case 'usecase': return useCaseSvg(nodes, edges)
    case 'structure': return structureSvg(nodes, edges)
    case 'entity': return entitySvg(nodes, edges)
    case 'er': return erSvg(nodes, edges)
    case 'sequence': return sequenceSvg(nodes, edges)
    case 'class': return classSvg(nodes, edges)
    case 'activity': return activitySvg(nodes, edges)
    case 'deployment': return deploymentSvg(nodes, edges)
    default: return ''
  }
}

function buildDrawio(active: string, nodes: Node<DiagramNodeData>[], edges: Edge[]) {
  switch (active) {
    case 'usecase': return useCaseDrawio(nodes, edges)
    case 'structure': return structureDrawio(nodes, edges)
    case 'entity': return entityDrawio(nodes, edges)
    case 'er': return erDrawio(nodes, edges)
    case 'sequence': return sequenceDrawio(nodes, edges)
    case 'class': return classDrawio(nodes, edges)
    case 'activity': return activityDrawio(nodes, edges)
    case 'deployment': return deploymentDrawio(nodes, edges)
    default: return ''
  }
}

const svgPngExportTypes = new Set(['structure', 'er', 'sequence', 'class', 'activity', 'deployment'])

export default function ExportModal({ active, config, flowRef, onClose }: Props) {
  const { t } = useTranslation()
  const [fullUrl, setFullUrl] = useState('')
  const [splitUrls, setSplitUrls] = useState<string[]>([])
  const [splitLabels, setSplitLabels] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  const groups = buildGroups(config.nodes, config.edges, active)
  const nodeMap = new Map(config.nodes.map((n) => [n.id, n]))

  const getBox = (nodeIds: string[]) => {
    const el = (flowRef.current?.querySelector('.react-flow') || flowRef.current?.querySelector('.drawio-wrapper')) as HTMLElement | null
    if (!el) return null
    const flowRect = el.getBoundingClientRect()
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    nodeIds.forEach((id) => {
      const dom = el.querySelector(`[data-id="${id}"]`) as HTMLElement | null
      if (!dom) return
      const r = dom.getBoundingClientRect()
      minX = Math.min(minX, r.left - flowRect.left)
      minY = Math.min(minY, r.top - flowRect.top)
      maxX = Math.max(maxX, r.right - flowRect.left)
      maxY = Math.max(maxY, r.bottom - flowRect.top)
    })
    return minX === Infinity ? null : { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
  }

  const crop = (img: HTMLImageElement, box: { x: number; y: number; w: number; h: number }, pad: number, scale = 2) => {
    const sx = Math.max(0, box.x - pad) * scale
    const sy = Math.max(0, box.y - pad) * scale
    const sw = (box.w + pad * 2) * scale
    const sh = (box.h + pad * 2) * scale
    const canvas = document.createElement('canvas')
    canvas.width = sw; canvas.height = sh
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)
    return canvas.toDataURL('image/png')
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)

      // 结构图：iframe 跨域无法截图，用 SVG 转 Canvas
      if (svgPngExportTypes.has(active)) {
        const svg = buildSvg(active, config.nodes, config.edges)
        const img = new Image()
        const svgBlob = new Blob([svg], { type: 'image/svg+xml' })
        const url = URL.createObjectURL(svgBlob)
        await new Promise<void>((r, j) => { img.onload = () => r(); img.onerror = () => j(new Error('Image load failed')); img.src = url })
        if (cancelled) return
        const canvas = document.createElement('canvas')
        const scale = 2
        canvas.width = img.naturalWidth * scale; canvas.height = img.naturalHeight * scale
        const ctx = canvas.getContext('2d')!
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        if (cancelled) return
        setFullUrl(canvas.toDataURL('image/png'))
        setSplitUrls([]); setSplitLabels([])
        URL.revokeObjectURL(url)
        setLoading(false)
        return
      }

      const el = flowRef.current?.querySelector('.react-flow') as HTMLElement | null
      if (!el) { if (!cancelled) setLoading(false); return }

      const bg = el.querySelector('.react-flow__background') as HTMLElement | null
      if (bg) bg.style.display = 'none'
      let full = ''
      try { full = await toPng(el, { backgroundColor: '#ffffff', pixelRatio: 2 }) }
      finally { if (bg) bg.style.display = '' }
      if (cancelled) return

      const img = new Image()
      await new Promise<void>((r, j) => { img.onload = () => r(); img.onerror = () => j(new Error('Image load failed')); img.src = full })
      if (cancelled) return

      const allBox = getBox(config.nodes.map((n) => n.id))
      setFullUrl(allBox ? crop(img, allBox, 20) : full)
      const urls: string[] = []; const labels: string[] = []
      groups.forEach((g) => {
        const box = getBox(g.ids)
        if (!box) return
        urls.push(crop(img, box, 16))
        labels.push((nodeMap.get(g.ids[0])?.data.label as string) || '')
      })
      if (cancelled) return
      setSplitUrls(urls); setSplitLabels(labels)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  const dl = (url: string, name: string, ext = 'png') => {
    const a = document.createElement('a'); a.download = `${name}.${ext}`; a.href = url; a.click()
  }

  const handleSvg = () => {
    const svg = buildSvg(active, config.nodes, config.edges)
    if (!svg) return
    const blob = new Blob([svg], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    dl(url, `diagram-${active}`, 'svg')
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const handleDrawio = () => {
    const xml = buildDrawio(active, config.nodes, config.edges)
    if (!xml) return
    const blob = new Blob([xml], { type: 'application/xml' })
    const url = URL.createObjectURL(blob)
    dl(url, `diagram-${active}`, 'drawio')
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const handleVisio = async () => {
    try {
      switch (active) {
        case 'usecase': await useCaseVisio(config.nodes, config.edges); break
        case 'structure': await structureVisio(config.nodes, config.edges); break
        case 'entity': await entityVisio(config.nodes, config.edges); break
        case 'sequence': await sequenceVisio(config.nodes, config.edges); break
        case 'class': await classVisio(config.nodes, config.edges); break
        case 'activity': await activityVisio(config.nodes, config.edges); break
        case 'deployment': await deploymentVisio(config.nodes, config.edges); break
      }
    } catch (err) {
      console.error('Visio export failed:', err)
    }
  }

  const splitCols = Math.ceil(Math.sqrt(splitUrls.length))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-[96vw] max-w-[1400px] max-h-[94vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold">{t('export.exportImage')}</h3>
            <button onClick={() => dl(fullUrl, `${t('export.fullLabel')}-${active}`)} disabled={!fullUrl}
              className="px-3 py-1 text-xs bg-black text-white rounded hover:bg-gray-800 disabled:opacity-30">{t('export.fullExport')} PNG</button>
            <button onClick={handleSvg}
              className="px-3 py-1 text-xs border border-black rounded hover:bg-gray-50">{t('export.fullExport')} SVG</button>
            <button onClick={handleDrawio}
              className="px-3 py-1 text-xs border border-black rounded hover:bg-gray-50">{t('export.fullExport')} Drawio</button>
            <button onClick={handleVisio}
              className="px-3 py-1 text-xs border border-black rounded hover:bg-gray-50">{t('export.fullExport')} Visio</button>
            {active !== 'structure' && <button onClick={() => splitUrls.forEach((url, i) => setTimeout(() => dl(url, `${splitLabels[i] || `${t('export.splitLabel')}${i + 1}`}`), i * 200))}
              disabled={splitUrls.length === 0}
              className="px-3 py-1 text-xs border border-black rounded hover:bg-gray-50 disabled:opacity-30">{t('export.splitExport')} ({splitUrls.length})</button>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-black text-lg leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading && <div className="text-center text-sm text-gray-400 py-8">{t('export.generating')}</div>}

          {!loading && (
            <div className="flex gap-4">
              {/* 左：全图 */}
              <div className={active === 'structure' ? 'w-full' : 'flex-[2] min-w-0'}>
                <p className="text-xs text-gray-500 mb-2 text-center font-medium">{t('export.fullLabel')}</p>
                {fullUrl && <img src={fullUrl} alt={t('export.fullLabel')} className="w-full border border-gray-200 rounded" />}
              </div>

              {active !== 'structure' && <div className="w-px bg-gray-200 shrink-0" />}

              {/* 右：分图网格 */}
              {active !== 'structure' && <div className="flex-[3] min-w-0">
                <p className="text-xs text-gray-500 mb-2 text-center font-medium">{t('export.splitLabel')} ({splitUrls.length})</p>
                <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${splitCols}, 1fr)` }}>
                  {splitUrls.map((url, i) => (
                    <div key={i}>
                      <img src={url} alt={splitLabels[i]} className="w-full border border-gray-200 rounded" />
                      <p className="text-[10px] text-gray-400 mt-0.5 text-center">{splitLabels[i]}</p>
                    </div>
                  ))}
                </div>
              </div>}
            </div>
          )}

          <div className="bg-blue-50 border border-blue-200 text-blue-700 text-xs px-3 py-2 rounded mt-4 text-center">
            {t('export.copyHint')}
          </div>
        </div>
      </div>
    </div>
  )
}
