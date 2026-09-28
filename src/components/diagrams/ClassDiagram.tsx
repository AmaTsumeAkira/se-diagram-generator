import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as pako from 'pako'
import type { Edge, Node } from '@xyflow/react'
import { classDrawio } from '../../utils/drawioExport'
import type { DiagramNodeData } from '../../types/diagram'

interface Props {
  nodes: Node<DiagramNodeData>[]
  edges: Edge[]
  showGrid?: boolean
}

function encodeDiagram(xml: string): string {
  const deflated = pako.deflateRaw(xml)
  let bin = ''
  deflated.forEach((b: number) => { bin += String.fromCharCode(b) })
  return encodeURIComponent(btoa(bin))
}

// viewer.diagrams.net 是跨域 iframe，父页面读不到它内部的 DOM，所以“渲染完成”没有
// 可靠事件可监听。这里用三个信号拼出状态机：
//   1) 可达性探针（cors fetch）：被阻断 / DNS 失败 / 离线 / 429 / 5xx 都能确定性识别；
//   2) iframe onLoad + 一段渲染等待：近似判断远程渲染器画完了（冷启动要拉几 MB 的
//      渲染器与字体，实测 13~40s；命中缓存时不到 1s）；
//   3) 硬超时兜底：探针悬挂或 iframe 始终不 load 时给出失败态。
// 若 viewer 通过 postMessage 上报 load 事件（embed/proto 模式），则直接判定完成。
//
// 注意：因为无法真正侦测渲染完成，加载提示一直是“贴顶细条”而不是全屏遮罩——
// 这样即使图比预期更晚画出来也不会被提示挡住，同时屏幕上始终有加载提示
// （原始问题是“永久全白且无任何提示”）。
const VIEWER_ORIGIN = 'https://viewer.diagrams.net'
const PROBE_TIMEOUT_MS = 9000
const COLD_LOAD_MS = 2500
const SETTLE_COLD_MS = 30000
const SETTLE_WARM_MS = 8000
const HARD_TIMEOUT_MS = 45000

type Status = 'loading' | 'ready' | 'failed'

export default function ClassDiagram({ nodes, edges }: Props) {
  const { t } = useTranslation()
  const xml = useMemo(() => classDrawio(nodes, edges), [nodes, edges])
  const src = useMemo(() => {
    const enc = encodeDiagram(xml)
    return `${VIEWER_ORIGIN}/?lightbox=1&layers=0&nav=0#R${enc}`
  }, [xml])

  const [attempt, setAttempt] = useState(0)
  const [status, setStatus] = useState<Status>('loading')

  // src 变化（含只改 hash）不会让 iframe 重新加载，用 key 强制重建整个 frame。
  const frameKey = `${attempt}|${src}`
  const [renderedKey, setRenderedKey] = useState(frameKey)
  // 重试 / 图内容变化时在渲染期回到加载态（不在 effect 里同步 setState）。
  if (renderedKey !== frameKey) {
    setRenderedKey(frameKey)
    setStatus('loading')
  }

  const runStartRef = useRef(0)
  const probeOkRef = useRef(false)
  const loadedAtRef = useRef<number | null>(null)
  const settledRef = useRef(false)
  const runIdRef = useRef(0)
  const readyTimerRef = useRef<number | null>(null)

  // 探针通过 + iframe onLoad 之后，再留一段渲染时间才收起提示。
  const evaluate = useCallback(() => {
    if (settledRef.current || !probeOkRef.current || loadedAtRef.current === null) return
    settledRef.current = true
    const runId = runIdRef.current
    const loadMs = loadedAtRef.current - runStartRef.current
    const settle = loadMs >= COLD_LOAD_MS ? SETTLE_COLD_MS : SETTLE_WARM_MS
    readyTimerRef.current = window.setTimeout(() => {
      if (runIdRef.current === runId) setStatus('ready')
    }, Math.max(0, loadedAtRef.current + settle - Date.now()))
  }, [])

  const handleFrameLoad = useCallback(() => {
    loadedAtRef.current = Date.now()
    evaluate()
  }, [evaluate])

  // 浏览器对 iframe 导航失败基本不派发 error 事件，这里只是多一层保险。
  const handleFrameError = useCallback(() => {
    if (!settledRef.current) {
      settledRef.current = true
      setStatus('failed')
    }
  }, [])

  const retry = useCallback(() => setAttempt((a) => a + 1), [])

  useEffect(() => {
    let cancelled = false
    const runId = runIdRef.current + 1
    runIdRef.current = runId
    runStartRef.current = Date.now()
    probeOkRef.current = false
    loadedAtRef.current = null
    settledRef.current = false
    if (readyTimerRef.current !== null) { window.clearTimeout(readyTimerRef.current); readyTimerRef.current = null }

    const fail = () => {
      if (cancelled || settledRef.current) return
      settledRef.current = true
      setStatus('failed')
    }

    // 1) 可达性探针：viewer.diagrams.net 带 access-control-allow-origin: *，
    //    所以 cors 模式下能读到真实状态码（429 / 5xx 同样算失败）。若哪天 CORS 头没了，
    //    退化成 no-cors 的可达性判断，避免把“能加载”误判成失败。
    const controller = new AbortController()
    const probeTimer = window.setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
    const probe = async (): Promise<boolean> => {
      try {
        const res = await fetch(`${VIEWER_ORIGIN}/`, { mode: 'cors', cache: 'no-store', signal: controller.signal })
        return res.ok
      } catch {
        if (controller.signal.aborted) return false
        try {
          await fetch(`${VIEWER_ORIGIN}/`, { mode: 'no-cors', cache: 'no-store', signal: controller.signal })
          return true
        } catch {
          return false
        }
      }
    }
    probe().then((reachable) => {
      window.clearTimeout(probeTimer)
      if (cancelled || settledRef.current) return
      if (!reachable) { fail(); return }
      probeOkRef.current = true
      evaluate()
    })

    // 2) viewer 若通过 postMessage 上报加载完成，直接进入 ready（有则用，无则忽略）。
    const onMessage = (event: MessageEvent) => {
      if (cancelled || event.origin !== VIEWER_ORIGIN || settledRef.current) return
      let payload: unknown = event.data
      if (typeof payload === 'string') {
        try { payload = JSON.parse(payload) } catch { return }
      }
      if (payload && typeof payload === 'object' && (payload as { event?: unknown }).event === 'load') {
        settledRef.current = true
        setStatus('ready')
      }
    }
    window.addEventListener('message', onMessage)

    // 3) 硬超时兜底（只在探针 / onLoad 都没能启动估算时才生效）。
    const hardTimer = window.setTimeout(() => {
      if (!cancelled && !settledRef.current) { settledRef.current = true; setStatus('failed') }
    }, HARD_TIMEOUT_MS)

    return () => {
      cancelled = true
      controller.abort()
      window.clearTimeout(probeTimer)
      window.clearTimeout(hardTimer)
      window.removeEventListener('message', onMessage)
      if (readyTimerRef.current !== null) { window.clearTimeout(readyTimerRef.current); readyTimerRef.current = null }
    }
  }, [src, attempt, evaluate])

  return (
    <div className="relative w-full h-full">
      <iframe
        key={frameKey}
        src={src}
        title={t('app.class')}
        onLoad={handleFrameLoad}
        onError={handleFrameError}
        referrerPolicy="no-referrer"
        sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-modals allow-downloads allow-top-navigation-by-user-activation"
        style={{ width: '100%', height: '100%', border: 'none' }}
      />

      {status === 'loading' && (
        <div
          className="absolute inset-x-0 top-3 flex justify-center pointer-events-none"
          data-testid="diagram-overlay"
          data-status="loading"
        >
          <div className="pointer-events-auto mx-4 flex max-w-full items-center gap-3 rounded-lg border border-gray-200 bg-white/95 px-4 py-2 shadow-lg">
            <svg className="h-4 w-4 shrink-0 animate-spin text-gray-500" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z" />
            </svg>
            <p className="text-xs text-gray-600">{t('diagram.loading')}</p>
            <button
              type="button"
              onClick={retry}
              className="shrink-0 px-2.5 py-1 text-xs bg-black text-white rounded hover:bg-gray-800"
              data-testid="diagram-retry"
            >
              {t('diagram.retry')}
            </button>
          </div>
        </div>
      )}

      {status === 'failed' && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          data-testid="diagram-overlay"
          data-status="failed"
        >
          <div className="absolute inset-0 bg-white/90" aria-hidden="true" />
          <div
            className="relative mx-4 flex max-w-md flex-col items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-5 py-4 text-center shadow-lg"
            role="alert"
            data-testid="diagram-failed"
          >
            <svg className="h-6 w-6 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <p className="text-sm text-amber-800">{t('diagram.loadFailed')}</p>
            <button
              type="button"
              onClick={retry}
              className="px-4 py-1.5 text-sm bg-black text-white rounded hover:bg-gray-800"
              data-testid="diagram-retry"
            >
              {t('diagram.retry')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
