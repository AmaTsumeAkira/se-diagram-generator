import { useState, useEffect } from 'react'
import { toPng } from 'html-to-image'
import type { Node, Edge } from '@xyflow/react'
import type { DiagramNodeData } from '../types/diagram'

interface Props {
  active: string
  config: { nodes: Node<DiagramNodeData>[]; edges: Edge[] }
  flowRef: React.RefObject<HTMLDivElement | null>
  onClose: () => void
}

type Tab = 'full' | 'split' | 'copy'

/** 根据 edges 将节点分组 */
function buildGroups(nodes: Node<DiagramNodeData>[], edges: Edge[], active: string) {
  if (active === 'structure') {
    // 找出根和一级子节点，每个一级子节点 + 其子树 = 一组
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

  // usecase / entity: 每个 actor/entity 一组
  const sources = nodes.filter((n) => active === 'usecase' ? n.type === 'actor' : n.type === 'rectangle')
  return sources.map((src) => {
    const ids = [src.id]
    edges.filter((e) => e.source === src.id).forEach((e) => ids.push(e.target))
    return { ids }
  })
}

export default function ExportModal({ active, config, flowRef, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('full')
  const [fullUrl, setFullUrl] = useState('')
  const [splitUrls, setSplitUrls] = useState<string[]>([])
  const [splitLabels, setSplitLabels] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [generated, setGenerated] = useState(false)

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

  const generateFull = async () => {
    const el = flowRef.current?.querySelector('.react-flow') as HTMLElement | null
    if (!el) return ''
    const bg = el.querySelector('.react-flow__background') as HTMLElement | null
    if (bg) bg.style.display = 'none'
    try { return await toPng(el, { backgroundColor: '#ffffff', pixelRatio: 2 }) }
    finally { if (bg) bg.style.display = '' }
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

  const handleGenerate = async () => {
    setLoading(true); setGenerated(false)
    const full = await generateFull()
    if (!full) { setLoading(false); return }

    const img = new Image()
    await new Promise<void>((r) => { img.onload = () => r(); img.src = full })

    // 全图：裁剪到所有节点包围盒
    const allIds = config.nodes.map((n) => n.id)
    const allBox = getBox(allIds)
    setFullUrl(allBox ? crop(img, allBox, 20) : full)

    // 分图：每组独立裁剪
    if (tab === 'split' || tab === 'copy') {
      const urls: string[] = []; const labels: string[] = []
      groups.forEach((g) => {
        const box = getBox(g.ids)
        if (!box) return
        urls.push(crop(img, box, 16))
        const srcNode = nodeMap.get(g.ids[0])
        labels.push((srcNode?.data.label as string) || '')
      })
      setSplitUrls(urls); setSplitLabels(labels)
    }

    setGenerated(true); setLoading(false)
  }

  const downloadUrl = (url: string, name: string) => {
    const a = document.createElement('a')
    a.download = `${name}-${Date.now()}.png`
    a.href = url; a.click()
  }

  useEffect(() => { setFullUrl(''); setSplitUrls([]); setSplitLabels([]); setGenerated(false) }, [tab])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-[820px] max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <div className="flex gap-1">
            {(['full', 'split', 'copy'] as Tab[]).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-3 py-1 text-sm rounded ${tab === t ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
                {{ full: '全图导出', split: '分图导出', copy: '复制模式' }[t]}
              </button>
            ))}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-black text-lg leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {!generated && !loading && (
            <div className="text-center py-8">
              <button onClick={handleGenerate} className="px-6 py-3 bg-black text-white text-sm font-medium rounded hover:bg-gray-800">
                生成预览
              </button>
              <p className="text-xs text-gray-400 mt-2">点击后生成图片预览，不会自动下载</p>
            </div>
          )}

          {loading && <div className="text-center text-sm text-gray-400 py-8">生成中...</div>}

          {generated && tab === 'full' && fullUrl && (
            <div className="text-center">
              <img src={fullUrl} alt="全图" className="max-w-full border border-gray-200 rounded" />
              <button onClick={() => downloadUrl(fullUrl, `diagram-${active}`)}
                className="mt-3 px-4 py-2 bg-black text-white text-sm rounded hover:bg-gray-800">下载 PNG</button>
            </div>
          )}

          {generated && tab === 'split' && (
            <div>
              <div className="bg-amber-50 border border-amber-200 text-amber-700 text-xs px-3 py-2 rounded mb-3">
                浏览器可能拦截多图下载，请查看地址栏提示并允许本站下载多个文件。
              </div>
              <div className="grid grid-cols-2 gap-3 mb-4">
                {splitUrls.map((url, i) => (
                  <div key={i}>
                    <img src={url} alt={splitLabels[i]} className="w-full border border-gray-200 rounded" />
                    <p className="text-xs text-gray-400 mt-1 text-center">{splitLabels[i] || `第 ${i + 1} 组`}</p>
                  </div>
                ))}
              </div>
              {splitUrls.length > 0 && (
                <div className="text-center">
                  <button onClick={() => splitUrls.forEach((url, i) => setTimeout(() => downloadUrl(url, `diagram-${active}-${splitLabels[i] || i}`), i * 200))}
                    className="px-4 py-2 bg-black text-white text-sm rounded hover:bg-gray-800">批量下载 ({splitUrls.length} 张)</button>
                </div>
              )}
            </div>
          )}

          {generated && tab === 'copy' && (
            <div>
              <div className="flex gap-4 mb-4">
                <div className="flex-1">
                  <p className="text-xs text-gray-500 mb-1 text-center font-medium">全图</p>
                  {fullUrl && <img src={fullUrl} alt="全图" className="w-full border border-gray-200 rounded" />}
                </div>
                <div className="flex-1 space-y-2">
                  <p className="text-xs text-gray-500 mb-1 text-center font-medium">分图</p>
                  {splitUrls.map((url, i) => (
                    <img key={i} src={url} alt={splitLabels[i]} className="w-full border border-gray-200 rounded" />
                  ))}
                </div>
              </div>
              <div className="bg-blue-50 border border-blue-200 text-blue-700 text-xs px-3 py-2 rounded text-center">
                右键图片 → 复制图片，直接在论文/文档中粘贴即可
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
