import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

/** 取出自绘 SVG 的固有尺寸，供缩放容器占位使用 */
function svgSize(svg: string): { w: number; h: number } {
  const m = svg.match(/<svg[^>]*?width="([\d.]+)"[^>]*?height="([\d.]+)"/)
  return m ? { w: Number(m[1]), h: Number(m[2]) } : { w: 0, h: 0 }
}

const ZOOM_MIN = 0.25
const ZOOM_MAX = 3
const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3]

/**
 * 自绘 SVG 画布：滚动 + 缩放（功能结构图 / 类图共用）。
 *
 * 尺寸策略（沿用 ERDiagram 的结论）：必须用「相对定位外壳 + 绝对定位滚动层」两层 ——
 * 直接把 overflow-auto 放在流内元素上，SVG 的固有宽度会成为父级 flex item 的
 * min-content 宽度，把父级撑到几千像素后被外层 overflow-hidden 裁掉且没有滚动条。
 * 绝对定位层脱离文档流，容器才能稳定拿到可视宽度并出现滚动条。
 *
 * 缩放用「外层占位 div 尺寸 × zoom + 内层 transform: scale」组合，二者都随 zoom 变化，
 * 这样放大后滚动区域同步变大（只写 transform 不会撑开滚动范围）。
 */
export default function SvgCanvas({ svg }: { svg: string }) {
  const { t } = useTranslation()
  const { w, h } = useMemo(() => svgSize(svg), [svg])
  const [zoom, setZoom] = useState(1)

  const step = (dir: 1 | -1) => {
    setZoom((z) => {
      const idx = ZOOM_STEPS.findIndex((s) => Math.abs(s - z) < 0.001)
      if (idx === -1) {
        const next = dir === 1
          ? ZOOM_STEPS.find((s) => s > z)
          : [...ZOOM_STEPS].reverse().find((s) => s < z)
        return next ?? z
      }
      return ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, idx + dir))]
    })
  }

  const btn = 'px-1.5 py-0.5 rounded border border-gray-300 bg-white text-[11px] leading-4 hover:bg-gray-100 disabled:opacity-30'

  return (
    <div className="w-full h-full relative bg-white overflow-hidden">
      <div className="absolute inset-0 overflow-auto">
        <div style={{ width: Math.max(1, w * zoom), height: Math.max(1, h * zoom) }}>
          <div
            className="[&>svg]:block"
            style={{ width: w, height: h, transform: `scale(${zoom})`, transformOrigin: 'top left' }}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        </div>
      </div>
      <div className="absolute top-2 right-3 flex items-center gap-1 rounded-md border border-gray-200 bg-white/95 px-1 py-0.5 shadow-sm">
        <button type="button" className={btn} onClick={() => step(-1)} disabled={zoom <= ZOOM_MIN} title={t('diagram.zoomOut')}>−</button>
        <button type="button" className={`${btn} min-w-[3.2rem]`} onClick={() => setZoom(1)} title={t('diagram.zoomReset')}>{Math.round(zoom * 100)}%</button>
        <button type="button" className={btn} onClick={() => step(1)} disabled={zoom >= ZOOM_MAX} title={t('diagram.zoomIn')}>＋</button>
      </div>
    </div>
  )
}
