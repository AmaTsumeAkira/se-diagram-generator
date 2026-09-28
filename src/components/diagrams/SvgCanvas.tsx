import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

/** 取出自绘 SVG 的固有尺寸 */
function svgSize(svg: string): { w: number; h: number } {
  const m = svg.match(/<svg[^>]*?width="([\d.]+)"[^>]*?height="([\d.]+)"/)
  return m ? { w: Number(m[1]), h: Number(m[2]) } : { w: 0, h: 0 }
}

const ZOOM_MIN = 0.1
const ZOOM_MAX = 3
const ZOOM_STEPS = [0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3]
const FIT_PAD = 40
const DBLCLICK_FACTOR = 1.2
/** 滚轮灵敏度，对齐 React Flow(d3-zoom) 默认手感：scale *= 2^(-deltaY * 0.002) */
const WHEEL_K = 0.002

interface View { x: number; y: number; zoom: number }

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/**
 * 自绘 SVG 画布：与用例图/实体属性图（React Flow）**同一套交互**
 * —— 空白处拖动平移、滚轮缩放（以光标为中心）、触控板双指捏合、双击放大、
 * 右上角 −／百分比／＋／适应画布。
 *
 * 实现方式与 React Flow 一致：不用容器滚动，而是对内容做 `translate + scale` 变换，
 * 因此不会出现「SVG 固有宽度把父级 flex item 撑破」的问题（旧 ERDiagram 注释记的就是这个坑）。
 *
 * 初始视图 = 自适应（`fitView` 语义：整张图放进视口，最多放大到 3×）；
 * 用户一旦拖动/缩放即切到自己的视图，点「适应画布」或百分比按钮回到自适应。
 */
export default function SvgCanvas({ svg }: { svg: string }) {
  const { t } = useTranslation()
  const { w: svgW, h: svgH } = useMemo(() => svgSize(svg), [svg])

  const wrapRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  const [userView, setUserView] = useState<View | null>(null)

  // SVG 换内容（换图 / 改配置）时回到自适应视图。
  // 用「渲染期重置」而不是 useEffect，避免 react-hooks/set-state-in-effect。
  const [svgKey, setSvgKey] = useState(svg)
  if (svgKey !== svg) {
    setSvgKey(svg)
    setUserView(null)
  }

  // 容器尺寸（自适应与按钮缩放的中心点）。首帧由 ResizeObserver 回调补齐。
  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const fitView = useCallback((): View => {
    if (!box.w || !box.h || !svgW || !svgH) return { x: 0, y: 0, zoom: 1 }
    const zoom = clamp(
      Math.min((box.w - FIT_PAD * 2) / svgW, (box.h - FIT_PAD * 2) / svgH),
      ZOOM_MIN,
      ZOOM_MAX,
    )
    return { x: (box.w - svgW * zoom) / 2, y: (box.h - svgH * zoom) / 2, zoom }
  }, [box.w, box.h, svgW, svgH])

  const view = userView ?? fitView()

  /** 以视口内某点为锚点缩放到指定倍数 */
  const zoomTo = useCallback((px: number, py: number, nextZoom: number) => {
    setUserView((prev) => {
      const cur = prev ?? fitView()
      const z = clamp(nextZoom, ZOOM_MIN, ZOOM_MAX)
      if (Math.abs(z - cur.zoom) < 0.0005) return cur
      const k = z / cur.zoom
      return { zoom: z, x: px - (px - cur.x) * k, y: py - (py - cur.y) * k }
    })
  }, [fitView])

  /** 以视口内某点为锚点按比例缩放（滚轮/捏合用，不需要读当前 zoom） */
  const zoomBy = useCallback((px: number, py: number, factor: number) => {
    setUserView((prev) => {
      const cur = prev ?? fitView()
      const z = clamp(cur.zoom * factor, ZOOM_MIN, ZOOM_MAX)
      if (Math.abs(z - cur.zoom) < 0.0005) return cur
      const k = z / cur.zoom
      return { zoom: z, x: px - (px - cur.x) * k, y: py - (py - cur.y) * k }
    })
  }, [fitView])

  // 滚轮：需要 preventDefault（尤其 ctrl+滚轮 = 浏览器缩放 / 触控板捏合），
  // 而 React 的 onWheel 是被动监听，所以手动挂非被动监听。
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      zoomBy(e.clientX - rect.left, e.clientY - rect.top, Math.pow(2, -e.deltaY * WHEEL_K))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomBy])

  const step = (dir: 1 | -1) => {
    const z = view.zoom
    const idx = ZOOM_STEPS.findIndex((s) => Math.abs(s - z) < 0.001)
    const next = idx === -1
      ? ((dir === 1 ? ZOOM_STEPS.find((s) => s > z) : [...ZOOM_STEPS].reverse().find((s) => s < z)) ?? z)
      : ZOOM_STEPS[clamp(idx + dir, 0, ZOOM_STEPS.length - 1)]
    const el = wrapRef.current
    if (el) zoomTo(el.clientWidth / 2, el.clientHeight / 2, next)
  }

  // 指针拖动平移 + 双指捏合（对齐 React Flow 的 panOnDrag / zoomOnPinch）
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; zoom: number } | null>(null)
  const pinch = useRef<{ dist: number; zoom: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  // 双击放大：这里不用 dblclick 事件 —— 平移要用 setPointerCapture，
  // 而指针被捕获后浏览器不再派发 click / dblclick（实测两种浏览器行为都不一致），
  // 所以按「两次 pointerdown 间隔 <350ms 且位移 <8px」自己判定，语义与 React Flow 的
  // zoomOnDoubleClick 一致。
  const lastDown = useRef<{ t: number; x: number; y: number } | null>(null)

  const localPoint = (e: React.PointerEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const now = Date.now()
    const prev = lastDown.current
    if (prev && now - prev.t < 350 && Math.abs(e.clientX - prev.x) < 8 && Math.abs(e.clientY - prev.y) < 8) {
      lastDown.current = null
      const pt = localPoint(e)
      zoomTo(pt.x, pt.y, view.zoom * DBLCLICK_FACTOR)
      return
    }
    lastDown.current = { t: now, x: e.clientX, y: e.clientY }
    pointers.current.set(e.pointerId, localPoint(e))
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    if (pointers.current.size === 1) {
      drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, zoom: view.zoom }
      setDragging(true)
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom: view.zoom }
      drag.current = null
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, localPoint(e))

    if (pointers.current.size >= 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      zoomTo(mid.x, mid.y, pinch.current.zoom * (dist / pinch.current.dist))
      return
    }

    const d = drag.current
    if (!d) return
    setUserView({ zoom: d.zoom, x: d.vx + (e.clientX - d.x), y: d.vy + (e.clientY - d.y) })
  }

  const endPointer = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinch.current = null
    if (pointers.current.size === 0) {
      drag.current = null
      setDragging(false)
    }
  }

  const btn = 'px-1.5 py-0.5 rounded border border-gray-300 bg-white text-[11px] leading-4 hover:bg-gray-100 disabled:opacity-30'

  return (
    <div className="w-full h-full relative bg-white overflow-hidden">
      <div
        ref={wrapRef}
        className={`absolute inset-0 touch-none select-none ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
      >
        {/*
          缩放不能靠 CSS transform: scale() —— 那样浏览器会按 1× 栅格化后再放大，字和线都会糊
          （配合 will-change: transform 更明显）。这里把缩放落到元素的 width/height 上，
          让内联 SVG 依据自己的 viewBox **按目标尺寸重新做矢量渲染**，transform 只负责平移。
          与用例图/实体属性图（React Flow 重排 DOM）的清晰度一致，任意倍数都不失真。
        */}
        <div
          className="[&>svg]:block [&>svg]:h-full [&>svg]:w-full"
          style={{
            width: Math.max(1, svgW * view.zoom),
            height: Math.max(1, svgH * view.zoom),
            transform: `translate(${view.x}px, ${view.y}px)`,
            transformOrigin: '0 0',
          }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>
      <div
        className="absolute top-2 right-3 flex items-center gap-1 rounded-md border border-gray-200 bg-white/95 px-1 py-0.5 shadow-sm"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button type="button" className={btn} onClick={() => step(-1)} disabled={view.zoom <= ZOOM_MIN} title={t('diagram.zoomOut')}>−</button>
        <button type="button" className={`${btn} min-w-[3.2rem]`} onClick={() => setUserView(null)} title={t('diagram.zoomReset')}>{Math.round(view.zoom * 100)}%</button>
        <button type="button" className={btn} onClick={() => step(1)} disabled={view.zoom >= ZOOM_MAX} title={t('diagram.zoomIn')}>＋</button>
        <button type="button" className={`${btn} ml-0.5`} onClick={() => setUserView(null)} title={t('diagram.fitView')}>
          <span aria-hidden="true">⤢</span>
        </button>
      </div>
    </div>
  )
}
