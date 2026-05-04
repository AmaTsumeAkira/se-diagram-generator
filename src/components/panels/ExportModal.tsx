import { useState, useEffect } from 'react'
import { toPng } from 'html-to-image'

interface Props {
  active: string
  flowRef: React.RefObject<HTMLDivElement | null>
  onClose: () => void
}

type Tab = 'full' | 'split' | 'copy'

export default function ExportModal({ active, flowRef, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('full')
  const [fullUrl, setFullUrl] = useState('')
  const [splitUrls, setSplitUrls] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [generated, setGenerated] = useState(false)

  // Generate full image
  const generateFull = async () => {
    const el = flowRef.current?.querySelector('.react-flow') as HTMLElement | null
    if (!el) return ''
    const bg = el.querySelector('.react-flow__background') as HTMLElement | null
    if (bg) bg.style.display = 'none'
    try {
      return await toPng(el, { backgroundColor: '#ffffff', pixelRatio: 2 })
    } finally {
      if (bg) bg.style.display = ''
    }
  }

  const cropRegion = (img: HTMLImageElement, x: number, y: number, w: number, h: number, scale = 2) => {
    const canvas = document.createElement('canvas')
    canvas.width = w * scale; canvas.height = h * scale
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, x * scale, y * scale, w * scale, h * scale, 0, 0, w * scale, h * scale)
    return canvas.toDataURL('image/png')
  }

  const getGroupBounds = () => {
    const el = flowRef.current?.querySelector('.react-flow') as HTMLElement | null
    if (!el) return []
    const flowRect = el.getBoundingClientRect()
    const nodeEls = el.querySelectorAll('.react-flow__node')
    const groupMap = new Map<string, DOMRect[]>()

    nodeEls.forEach((node) => {
      const n = node as HTMLElement
      const r = n.getBoundingClientRect()
      const rx = r.left - flowRect.left; const ry = r.top - flowRect.top

      const groupKey = active === 'usecase'
        ? (rx < 150 ? `actor-${rx}-${ry}` : 'usecases')
        : `row-${Math.floor(ry / 400)}`

      const list = groupMap.get(groupKey) || []
      list.push(new DOMRect(rx, ry, r.width, r.height))
      groupMap.set(groupKey, list)
    })

    return Array.from(groupMap.values()).map((rects) => {
      if (rects.length === 0) return { x: 0, y: 0, w: 0, h: 0 }
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      rects.forEach((r) => {
        minX = Math.min(minX, r.x); minY = Math.min(minY, r.y)
        maxX = Math.max(maxX, r.x + r.width); maxY = Math.max(maxY, r.y + r.height)
      })
      return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
    }).filter((b) => b.w > 10 && b.h > 10)
  }

  const handleGenerate = async () => {
    setLoading(true)
    setGenerated(false)

    const full = await generateFull()
    if (!full) { setLoading(false); return }
    setFullUrl(full)

    if (tab === 'split' || tab === 'copy') {
      const img = new Image()
      await new Promise<void>((r) => { img.onload = () => r(); img.src = full })
      const bounds = getGroupBounds()
      const pad = 20
      setSplitUrls(bounds.map((b) => cropRegion(img, b.x - pad, b.y - pad, b.w + pad * 2, b.h + pad * 2)))
    }

    setGenerated(true)
    setLoading(false)
  }

  const downloadUrl = (url: string, name: string) => {
    const a = document.createElement('a')
    a.download = `${name}-${Date.now()}.png`
    a.href = url
    a.click()
  }

  const handleDownloadFull = () => { if (fullUrl) downloadUrl(fullUrl, `diagram-${active}`) }

  const handleDownloadSplit = () => {
    splitUrls.forEach((url, i) => {
      setTimeout(() => downloadUrl(url, `diagram-${active}-part${i + 1}`), i * 200)
    })
  }

  useEffect(() => {
    setFullUrl(''); setSplitUrls([]); setGenerated(false)
  }, [tab])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-[820px] max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
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

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* Generate button */}
          {!generated && !loading && (
            <div className="text-center py-8">
              <button onClick={handleGenerate} className="px-6 py-3 bg-black text-white text-sm font-medium rounded hover:bg-gray-800">
                生成预览
              </button>
              <p className="text-xs text-gray-400 mt-2">点击后生成图片预览，不会自动下载</p>
            </div>
          )}

          {loading && <div className="text-center text-sm text-gray-400 py-8">生成中...</div>}

          {/* Full tab */}
          {generated && tab === 'full' && fullUrl && (
            <div className="text-center">
              <img src={fullUrl} alt="全图" className="max-w-full border border-gray-200 rounded" />
              <button onClick={handleDownloadFull} className="mt-3 px-4 py-2 bg-black text-white text-sm rounded hover:bg-gray-800">下载 PNG</button>
            </div>
          )}

          {/* Split tab */}
          {generated && tab === 'split' && (
            <div>
              <div className="bg-amber-50 border border-amber-200 text-amber-700 text-xs px-3 py-2 rounded mb-3">
                浏览器可能拦截多图下载，请查看地址栏提示并允许本站下载多个文件。
              </div>
              <div className="grid grid-cols-2 gap-3 mb-4">
                {splitUrls.map((url, i) => (
                  <div key={i}>
                    <img src={url} alt={`分图 ${i + 1}`} className="w-full border border-gray-200 rounded" />
                    <p className="text-xs text-gray-400 mt-1 text-center">第 {i + 1} 组</p>
                  </div>
                ))}
              </div>
              {splitUrls.length === 0 && <p className="text-sm text-gray-400 text-center py-4">当前图表无法拆分</p>}
              {splitUrls.length > 0 && (
                <div className="text-center">
                  <button onClick={handleDownloadSplit} className="px-4 py-2 bg-black text-white text-sm rounded hover:bg-gray-800">批量下载 ({splitUrls.length} 张)</button>
                </div>
              )}
            </div>
          )}

          {/* Copy tab */}
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
                    <img key={i} src={url} alt={`分图 ${i + 1}`} className="w-full border border-gray-200 rounded" />
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
