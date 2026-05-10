import { useState, useEffect } from 'react'
import { toPng, toSvg } from 'html-to-image'
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

export default function ExportModal({ active, config, flowRef, onClose }: Props) {
  const [fullUrl, setFullUrl] = useState('')
  const [splitUrls, setSplitUrls] = useState<string[]>([])
  const [splitLabels, setSplitLabels] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  const groups = buildGroups(config.nodes, config.edges, active)
  const nodeMap = new Map(config.nodes.map((n) => [n.id, n]))

  const getBox = (nodeIds: string[]) => {
    const el = flowRef.current?.querySelector('.react-flow') as HTMLElement | null
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
    ;(async () => {
      setLoading(true)
      const el = flowRef.current?.querySelector('.react-flow') as HTMLElement | null
      if (!el) { setLoading(false); return }

      const bg = el.querySelector('.react-flow__background') as HTMLElement | null
      if (bg) bg.style.display = 'none'
      let full = ''
      try { full = await toPng(el, { backgroundColor: '#ffffff', pixelRatio: 2 }) }
      finally { if (bg) bg.style.display = '' }

      const img = new Image()
      await new Promise<void>((r) => { img.onload = () => r(); img.src = full })

      // 全图裁剪到内容边界
      const allBox = getBox(config.nodes.map((n) => n.id))
      setFullUrl(allBox ? crop(img, allBox, 20) : full)

      // 分图
      const urls: string[] = []; const labels: string[] = []
      groups.forEach((g) => {
        const box = getBox(g.ids)
        if (!box) return
        urls.push(crop(img, box, 16))
        labels.push((nodeMap.get(g.ids[0])?.data.label as string) || '')
      })
      setSplitUrls(urls); setSplitLabels(labels)
      setLoading(false)
    })()
  }, [])

  const dl = (url: string, name: string, ext = 'png') => {
    const a = document.createElement('a'); a.download = `${name}.${ext}`; a.href = url; a.click()
  }

  const handleSvg = async () => {
    const el = flowRef.current?.querySelector('.react-flow') as HTMLElement | null
    if (!el) return
    const bg = el.querySelector('.react-flow__background') as HTMLElement | null
    if (bg) bg.style.display = 'none'
    try {
      const url = await toSvg(el, { backgroundColor: '#ffffff' })
      dl(url, `diagram-${active}`, 'svg')
    } finally { if (bg) bg.style.display = '' }
  }

  const splitCols = Math.ceil(Math.sqrt(splitUrls.length))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-[96vw] max-w-[1400px] max-h-[94vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold">导出图片</h3>
            <button onClick={() => dl(fullUrl, `全图-${active}`)} disabled={!fullUrl}
              className="px-3 py-1 text-xs bg-black text-white rounded hover:bg-gray-800 disabled:opacity-30">下载全图 PNG</button>
            <button onClick={handleSvg}
              className="px-3 py-1 text-xs border border-black rounded hover:bg-gray-50">下载全图 SVG</button>
            <button onClick={() => splitUrls.forEach((url, i) => setTimeout(() => dl(url, `${splitLabels[i] || `分图${i + 1}`}`), i * 200))}
              disabled={splitUrls.length === 0}
              className="px-3 py-1 text-xs border border-black rounded hover:bg-gray-50 disabled:opacity-30">下载分图 ({splitUrls.length})</button>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-black text-lg leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading && <div className="text-center text-sm text-gray-400 py-8">生成中...</div>}

          {!loading && (
            <div className="flex gap-4">
              {/* 左：全图 */}
              <div className="flex-[2] min-w-0">
                <p className="text-xs text-gray-500 mb-2 text-center font-medium">全图</p>
                {fullUrl && <img src={fullUrl} alt="全图" className="w-full border border-gray-200 rounded" />}
              </div>

              <div className="w-px bg-gray-200 shrink-0" />

              {/* 右：分图网格 */}
              <div className="flex-[3] min-w-0">
                <p className="text-xs text-gray-500 mb-2 text-center font-medium">分图 ({splitUrls.length})</p>
                <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${splitCols}, 1fr)` }}>
                  {splitUrls.map((url, i) => (
                    <div key={i}>
                      <img src={url} alt={splitLabels[i]} className="w-full border border-gray-200 rounded" />
                      <p className="text-[10px] text-gray-400 mt-0.5 text-center">{splitLabels[i]}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="bg-blue-50 border border-blue-200 text-blue-700 text-xs px-3 py-2 rounded mt-4 text-center">
            右键图片 → 复制图片，直接在论文/文档中粘贴即可。分图下载较多时浏览器可能拦截，请留意地址栏提示。
          </div>
        </div>
      </div>
    </div>
  )
}
