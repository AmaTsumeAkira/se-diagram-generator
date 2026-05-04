import { useState, useRef, useEffect } from 'react'
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
  const [warned, setWarned] = useState(false)

  // Generate full image
  const generateFull = async () => {
    const el = flowRef.current?.querySelector('.react-flow') as HTMLElement | null
    if (!el) return ''
    const bg = el.querySelector('.react-flow__background') as HTMLElement | null
    if (bg) bg.style.display = 'none'
    try {
      const url = await toPng(el, { backgroundColor: '#ffffff', pixelRatio: 2 })
      return url
    } finally {
      if (bg) bg.style.display = ''
    }
  }

  // Crop a region from the full image
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
      // React Flow data-id format: edges connect sources to targets
      const n = node as HTMLElement
      const r = n.getBoundingClientRect()
      const rx = r.left - flowRect.left; const ry = r.top - flowRect.top
      const rw = r.width; const rh = r.height

      // For use case: group by actor via proximity (actors at x<150, use cases at x>150)
      // For entity: each entity is a separate group
      let groupKey = 'default'
      if (active === 'usecase') {
        // Use cases group with nearest actor above them
        groupKey = rx < 150 ? `actor-${rx}-${ry}` : 'usecases'
      } else {
        // Entity groups: find by vertical position clusters
        groupKey = `row-${Math.floor(ry / 400)}`
      }

      const list = groupMap.get(groupKey) || []
      list.push(new DOMRect(rx, ry, rw, rh))
      groupMap.set(groupKey, list)
    })

    // Merge overlapping rects in each group
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

  const handleFull = async () => {
    setLoading(true)
    const url = await generateFull()
    if (url) {
      setFullUrl(url)
      downloadUrl(url, `diagram-${active}-full`)
    }
    setLoading(false)
  }

  const handleSplit = async () => {
    setLoading(true)
    const full = await generateFull()
    if (!full) { setLoading(false); return }

    const img = new Image()
    await new Promise<void>((r) => { img.onload = () => r(); img.src = full })

    const bounds = getGroupBounds()
    const pad = 20
    const urls: string[] = []

    bounds.forEach((b, i) => {
      const url = cropRegion(img, b.x - pad, b.y - pad, b.w + pad * 2, b.h + pad * 2)
      urls.push(url)
      downloadUrl(url, `diagram-${active}-part${i + 1}`)
    })

    setSplitUrls(urls)
    setWarned(true)
    setLoading(false)
  }

  const handleCopyMode = async () => {
    setLoading(true)
    const full = await generateFull()
    if (!full) { setLoading(false); return }
    setFullUrl(full)

    const img = new Image()
    await new Promise<void>((r) => { img.onload = () => r(); img.src = full })

    const bounds = getGroupBounds()
    const pad = 20
    const urls: string[] = bounds.map((b) => cropRegion(img, b.x - pad, b.y - pad, b.w + pad * 2, b.h + pad * 2))
    setSplitUrls(urls)
    setLoading(false)
  }

  useEffect(() => {
    if (tab === 'full') handleFull()
    else if (tab === 'split') handleSplit()
    else if (tab === 'copy') handleCopyMode()
  }, [tab])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-[800px] max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <div className="flex gap-1">
            {(['full', 'split', 'copy'] as Tab[]).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-3 py-1 text-sm rounded ${tab === t ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
                {{ full: '全图导出', split: '分图导出', copy: '复制模式' }[t]}
              </button>
            ))}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-black">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading && <div className="text-center text-sm text-gray-400 py-8">生成中...</div>}

          {!loading && tab === 'full' && fullUrl && (
            <div className="text-center">
              <img src={fullUrl} alt="全图" className="max-w-full border border-gray-200 rounded" />
              <p className="text-xs text-gray-400 mt-2">图片已自动下载，也可右键上方图片复制</p>
            </div>
          )}

          {!loading && tab === 'split' && (
            <div>
              {warned && (
                <div className="bg-amber-50 border border-amber-200 text-amber-700 text-xs px-3 py-2 rounded mb-3">
                  浏览器可能拦截多图下载，请查看地址栏提示并允许本站下载。
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                {splitUrls.map((url, i) => (
                  <div key={i}>
                    <img src={url} alt={`分图 ${i + 1}`} className="w-full border border-gray-200 rounded" />
                    <p className="text-xs text-gray-400 mt-1 text-center">第 {i + 1} 组</p>
                  </div>
                ))}
              </div>
              {splitUrls.length === 0 && <p className="text-sm text-gray-400 text-center py-8">当前图表无法拆分</p>}
            </div>
          )}

          {!loading && tab === 'copy' && (
            <div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <p className="text-xs text-gray-500 mb-1 text-center">全图</p>
                  {fullUrl && <img src={fullUrl} alt="全图" className="w-full border border-gray-200 rounded" />}
                </div>
                <div className="flex-1 space-y-2">
                  <p className="text-xs text-gray-500 mb-1 text-center">分图</p>
                  {splitUrls.map((url, i) => (
                    <img key={i} src={url} alt={`分图 ${i + 1}`} className="w-full border border-gray-200 rounded" />
                  ))}
                </div>
              </div>
              <div className="bg-blue-50 border border-blue-200 text-blue-700 text-xs px-3 py-2 rounded mt-3 text-center">
                右键图片 → 复制图片，直接在论文/文档中粘贴即可
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function downloadUrl(url: string, name: string) {
  const a = document.createElement('a')
  a.download = `${name}-${Date.now()}.png`
  a.href = url
  a.click()
}
