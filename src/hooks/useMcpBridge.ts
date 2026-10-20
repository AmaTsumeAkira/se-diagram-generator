import { useCallback, useEffect, useRef, useState } from 'react'
import type { ConfigMap, DiagramType } from '../types/diagram'
import {
  TAB_KEYS,
  configsToJson,
  jsonToConfigs,
  normalizeEntityConfig,
  normalizeUseCaseConfig,
  parseDiagram,
} from '../utils/configSerialize'
import { normalizeErRelations } from '../utils/erRelationNormalize'

/**
 * 与本地 MCP 桥接（mcp/bridge.ts）对接：
 *   - 订阅 SSE /events：收到 MCP 推来的图 → onApply 应用到编辑器（可撤销）
 *   - 防抖 PUT /state：把当前全部配置上报，供 MCP 的 diagram_get 读取
 *
 * 设计原则：
 *   - 桥接不存在时静默降级（status='off'），不影响编辑器任何原有功能
 *   - 只连 127.0.0.1，且生产站点是 https，混用内容会被浏览器直接拦掉，不会误连
 *   - 用户在工具栏点 MCP 徽标即可连接/断开，选择会记住（localStorage）
 */

export type McpBridgeStatus = 'off' | 'probing' | 'connecting' | 'connected'

const DEFAULT_BRIDGE_URL = 'http://127.0.0.1:4711'
const BRIDGE_URL_KEY = 'diagram-mcp-bridge-url'
const ENABLED_KEY = 'diagram-mcp-enabled'
const STATE_DEBOUNCE_MS = 350

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function store(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    /* 隐私模式等场景忽略 */
  }
}

export function getBridgeUrl(): string {
  return (readStored(BRIDGE_URL_KEY) || DEFAULT_BRIDGE_URL).replace(/\/+$/, '')
}

interface ApplyPayload {
  apply?: 'replace' | 'merge'
  configs?: unknown
  type?: string
  diagram?: { nodes?: unknown[]; edges?: unknown[] }
}

export interface UseMcpBridgeOptions {
  configs: ConfigMap
  /** MCP 推来的配置已归一化，直接应用即可；activeType 用于自动切标签页 */
  onApply: (next: ConfigMap, activeType?: DiagramType) => void
}

export interface McpBridge {
  status: McpBridgeStatus
  lastError: string | null
  bridgeUrl: string
  connect: () => void
  disconnect: () => void
  toggle: () => void
}

function isDiagramType(value: unknown): value is DiagramType {
  return typeof value === 'string' && (TAB_KEYS as string[]).includes(value)
}

/** 把当前配置转成「与导出全部数据相同」的平面 JSON，供桥接上报 */
function toWireConfigs(configs: ConfigMap): unknown {
  try {
    return JSON.parse(configsToJson(configs))
  } catch {
    return null
  }
}

export function useMcpBridge({ configs, onApply }: UseMcpBridgeOptions): McpBridge {
  const [status, setStatus] = useState<McpBridgeStatus>('off')
  const [lastError, setLastError] = useState<string | null>(null)

  const statusRef = useRef<McpBridgeStatus>('off')
  const configsRef = useRef(configs)
  const onApplyRef = useRef(onApply)
  const esRef = useRef<EventSource | null>(null)
  const busyRef = useRef(false)
  const mountedRef = useRef(true)

  // ref 同步放到 effect 里，避免在渲染期间写 ref（react-hooks/refs）
  useEffect(() => {
    statusRef.current = status
  }, [status])
  useEffect(() => {
    configsRef.current = configs
  }, [configs])
  useEffect(() => {
    onApplyRef.current = onApply
  }, [onApply])

  const pushState = useCallback(async (url: string) => {
    const wire = toWireConfigs(configsRef.current)
    if (!wire) return
    try {
      await fetch(`${url}/state`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configs: wire, source: 'app' }),
        signal: AbortSignal.timeout(2_000),
      })
    } catch {
      /* 桥接刚退出时静默；下次收到 state 请求/配置变化还会再发 */
    }
  }, [])

  const handleApply = useCallback((raw: unknown) => {
    const payload = raw as ApplyPayload
    if (!payload || typeof payload !== 'object') return

    // 全量替换
    if (payload.configs !== undefined) {
      try {
        const parsed = jsonToConfigs(JSON.stringify(payload.configs))
        if (parsed) {
          const next = parsed as ConfigMap
          onApplyRef.current({ ...next, er: normalizeErRelations(next.er) })
        }
      } catch {
        /* 非法载荷忽略 */
      }
      return
    }

    // 单张图合并
    if (payload.diagram && isDiagramType(payload.type)) {
      const type = payload.type
      try {
        const cfg = parseDiagram(JSON.stringify(payload.diagram))
        const normalized =
          type === 'usecase' ? normalizeUseCaseConfig(cfg)
            : type === 'entity' ? normalizeEntityConfig(cfg)
              : type === 'er' ? normalizeErRelations(cfg)
                : cfg
        const next: ConfigMap = { ...configsRef.current, [type]: normalized }
        onApplyRef.current(next, type)
      } catch {
        /* 非法载荷忽略 */
      }
    }
  }, [])

  const connect = useCallback(() => {
    if (busyRef.current) return
    if (statusRef.current === 'connected' || statusRef.current === 'connecting' || statusRef.current === 'probing') return
    busyRef.current = true
    const url = getBridgeUrl()
    store(ENABLED_KEY, '1')
    setLastError(null)
    setStatus('probing')

    void (async () => {
      try {
        const health = await fetch(`${url}/health`, { signal: AbortSignal.timeout(1_500) })
        if (!health.ok) throw new Error(`health HTTP ${health.status}`)
        const info = (await health.json().catch(() => null)) as { service?: string } | null
        if (!info || info.service !== 'se-diagram-mcp-bridge') {
          throw new Error(`端口上的服务不是本项目的 MCP 桥接（${url}）`)
        }
      } catch (e) {
        busyRef.current = false
        if (!mountedRef.current) return
        setStatus('off')
        setLastError(
          `连不上本地桥接 ${url}。请先运行 npm run mcp（MCP 服务会把桥接一起启动），再点一次 MCP 徽标。${e instanceof Error ? `（${e.message}）` : ''}`,
        )
        return
      }
      if (!mountedRef.current) {
        busyRef.current = false
        return
      }

      setStatus('connecting')
      const es = new EventSource(`${url}/events`)
      esRef.current = es

      es.onopen = () => {
        if (!mountedRef.current) {
          es.close()
          return
        }
        busyRef.current = false
        setStatus('connected')
        setLastError(null)
        void pushState(url)
      }

      es.addEventListener('apply', (event) => {
        try {
          handleApply(JSON.parse((event as MessageEvent).data))
        } catch {
          /* 忽略坏消息 */
        }
      })

      // 页面被 MCP 查询 state 时，立即上报一次最新配置
      es.addEventListener('state-request', () => {
        void pushState(url)
      })

      es.onerror = () => {
        if (!mountedRef.current) return
        busyRef.current = false
        if (es.readyState === EventSource.CLOSED) {
          setStatus('off')
          setLastError(`桥接连接已断开（${url}）。请确认 npm run mcp 仍在运行，再点 MCP 徽标重连。`)
        } else {
          setStatus('connecting')
        }
      }
    })()
  }, [handleApply, pushState])

  const disconnect = useCallback(() => {
    store(ENABLED_KEY, 'off')
    esRef.current?.close()
    esRef.current = null
    busyRef.current = false
    setStatus('off')
    setLastError(null)
  }, [])

  const toggle = useCallback(() => {
    if (statusRef.current === 'off') connect()
    else disconnect()
  }, [connect, disconnect])

  // 挂载时尝试连接（用户上次手动断开则保持 off）
  useEffect(() => {
    mountedRef.current = true
    if (readStored(ENABLED_KEY) !== 'off') connect()
    return () => {
      mountedRef.current = false
      esRef.current?.close()
      esRef.current = null
    }
  }, [connect])

  // 配置变化 → 防抖上报（供 diagram_get 读取）
  useEffect(() => {
    if (status !== 'connected') return
    const url = getBridgeUrl()
    const timer = window.setTimeout(() => void pushState(url), STATE_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [configs, status, pushState])

  return { status, lastError, bridgeUrl: getBridgeUrl(), connect, disconnect, toggle }
}
