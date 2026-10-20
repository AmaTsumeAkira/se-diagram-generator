/**
 * 本地桥接服务（HTTP + SSE）——让「打开着的编辑器」与「MCP / 外部脚本」互通。
 *
 *   POST /apply   MCP/脚本推送一张图  → 通过 SSE 事件推给浏览器里的编辑器
 *   GET  /state   读取编辑器当前全部配置（可加 ?fresh=1 先向页面要一次最新状态）
 *   PUT  /state   编辑器上报当前全部配置（页面在连线后自动、300ms 防抖）
 *   GET  /events  SSE 长连接（编辑器订阅）
 *   GET  /health  健康检查（编辑器用来判断桥接是否在运行）
 *
 * 只监听 127.0.0.1；CORS 仅放行 localhost / 127.0.0.1 来源；
 * 可选 DIAGRAM_MCP_TOKEN 鉴权（设置后除 /health 外都要求 X-MCP-Token）。
 * 同一端口只允许一个实例：第二个实例返回 attached=true，复用已有桥接。
 */
import http from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'

export const DEFAULT_BRIDGE_PORT = 4711

/** 推送载荷：全量替换或按类型合并 */
export interface ApplyPayload {
  apply: 'replace' | 'merge'
  configs?: unknown
  type?: string
  diagram?: { nodes: unknown[]; edges: unknown[] }
  source?: string
  at?: number
}

export interface BridgeOptions {
  host?: string
  port?: number
  token?: string
  log?: (message: string) => void
}

export interface BridgeHandle {
  url: string
  host: string
  port: number
  /** 端口已被别的进程占用：本实例没有真正监听，只是复用了已有桥接 */
  attached: boolean
  close(): Promise<void>
}

interface BridgeState {
  configs: unknown
  updatedAt: number
  source: string
}

const MAX_BODY_BYTES = 8 * 1024 * 1024
const SSE_HEARTBEAT_MS = 20_000
const FRESH_STATE_TIMEOUT_MS = 2_000
const LOCAL_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/

export async function startBridge(options: BridgeOptions = {}): Promise<BridgeHandle> {
  const host = options.host ?? '127.0.0.1'
  const port = options.port ?? (Number(process.env.DIAGRAM_MCP_PORT) || DEFAULT_BRIDGE_PORT)
  const token = options.token ?? process.env.DIAGRAM_MCP_TOKEN ?? ''
  const log = options.log ?? (() => {})

  const clients = new Set<ServerResponse>()
  const heartbeat = new Set<NodeJS.Timeout>()
  const stateWaiters = new Set<(state: BridgeState) => void>()
  let state: BridgeState | null = null
  let queuedApply: ApplyPayload | null = null
  const startedAt = Date.now()

  // ---------- helpers ----------
  const corsHeaders = (req: IncomingMessage): Record<string, string> => {
    const origin = String(req.headers.origin ?? '')
    if (!LOCAL_ORIGIN_RE.test(origin)) return {}
    return {
      'Access-Control-Allow-Origin': origin,
      Vary: 'Origin',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-MCP-Token',
      'Access-Control-Max-Age': '600',
    }
  }

  const json = (req: IncomingMessage, res: ServerResponse, status: number, body: unknown): void => {
    const payload = JSON.stringify(body)
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(payload),
      ...corsHeaders(req),
    })
    res.end(payload)
  }

  const authorized = (req: IncomingMessage, url: URL): boolean => {
    if (!token) return true
    const header = String(req.headers['x-mcp-token'] ?? '')
    return header === token || url.searchParams.get('token') === token
  }

  const readJson = async (req: IncomingMessage): Promise<unknown> => {
    let size = 0
    const chunks: Buffer[] = []
    for await (const chunk of req) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      size += buf.length
      if (size > MAX_BODY_BYTES) throw new Error(`请求体超过 ${MAX_BODY_BYTES} 字节`)
      chunks.push(buf)
    }
    if (size === 0) return null
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8'))
    } catch {
      throw new Error('请求体不是合法 JSON')
    }
  }

  const sseSend = (res: ServerResponse, event: string, data: unknown): void => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  }

  const broadcast = (event: string, data: unknown): number => {
    let sent = 0
    for (const client of clients) {
      try {
        sseSend(client, event, data)
        sent++
      } catch {
        clients.delete(client)
      }
    }
    return sent
  }

  const validateApply = (body: unknown): ApplyPayload => {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('请求体必须是对象')
    const b = body as Record<string, unknown>
    const apply = b.apply === 'replace' ? 'replace' : 'merge'
    const hasConfigs = b.configs !== undefined
    const hasDiagram = b.diagram !== undefined
    if (hasConfigs && hasDiagram) throw new Error('configs 与 diagram 只能二选一')
    if (!hasConfigs && !hasDiagram) throw new Error('缺少 configs 或 diagram')
    if (hasConfigs) {
      if (!b.configs || typeof b.configs !== 'object' || Array.isArray(b.configs)) throw new Error('configs 必须是对象')
      return { apply, configs: b.configs, source: typeof b.source === 'string' ? b.source : 'mcp', at: Date.now() }
    }
    const diagram = b.diagram as Record<string, unknown>
    if (!diagram || typeof diagram !== 'object' || !Array.isArray(diagram.nodes) || !Array.isArray(diagram.edges)) {
      throw new Error('diagram 必须包含 nodes / edges 数组')
    }
    if (typeof b.type !== 'string' || !b.type) throw new Error('diagram 模式需要 type')
    return {
      apply,
      type: b.type,
      diagram: { nodes: diagram.nodes, edges: diagram.edges },
      source: typeof b.source === 'string' ? b.source : 'mcp',
      at: Date.now(),
    }
  }

  /** 等待页面下一次 PUT /state（用于 get_diagram fresh=1） */
  const waitForState = (timeoutMs: number): Promise<BridgeState | null> =>
    new Promise((resolve) => {
      const timer = setTimeout(() => {
        stateWaiters.delete(onState)
        resolve(state)
      }, timeoutMs)
      const onState = (next: BridgeState) => {
        clearTimeout(timer)
        stateWaiters.delete(onState)
        resolve(next)
      }
      stateWaiters.add(onState)
    })

  // ---------- request handler ----------
  const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? `${host}:${port}`}`)
    const path = url.pathname

    if (req.method === 'OPTIONS') {
      res.writeHead(204, corsHeaders(req))
      res.end()
      return
    }

    if (req.method === 'GET' && path === '/health') {
      json(req, res, 200, {
        ok: true,
        service: 'se-diagram-mcp-bridge',
        version: 1,
        pid: process.pid,
        clients: clients.size,
        hasState: state !== null,
        hasQueuedApply: queuedApply !== null,
        uptimeMs: Date.now() - startedAt,
      })
      return
    }

    if (req.method === 'GET' && path === '/events') {
      if (!authorized(req, url)) {
        json(req, res, 401, { error: 'unauthorized' })
        return
      }
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
        ...corsHeaders(req),
      })
      res.write('retry: 2000\n\n')
      clients.add(res)
      sseSend(res, 'hello', { service: 'se-diagram-mcp-bridge', version: 1, clients: clients.size })
      if (state) sseSend(res, 'state', { configs: state.configs, updatedAt: state.updatedAt, source: state.source })
      // 页面断线期间推送的图，在连上时补发一次
      if (queuedApply) {
        sseSend(res, 'apply', queuedApply)
        queuedApply = null
      }
      const beat = setInterval(() => {
        try {
          res.write(': ping\n\n')
        } catch {
          clearInterval(beat)
          heartbeat.delete(beat)
        }
      }, SSE_HEARTBEAT_MS)
      heartbeat.add(beat)
      req.on('close', () => {
        clearInterval(beat)
        heartbeat.delete(beat)
        clients.delete(res)
      })
      return
    }

    if (!authorized(req, url)) {
      json(req, res, 401, { error: 'unauthorized' })
      return
    }

    if (req.method === 'GET' && path === '/state') {
      const fresh = url.searchParams.get('fresh') === '1' || url.searchParams.get('fresh') === 'true'
      if (fresh && clients.size > 0) {
        broadcast('state-request', { at: Date.now() })
        await waitForState(FRESH_STATE_TIMEOUT_MS)
      }
      if (!state) {
        json(req, res, 404, {
          error: 'no-state',
          hint: '编辑器还没有连接/上报状态。请打开页面并让 MCP 状态为「已连接」。',
          clients: clients.size,
        })
        return
      }
      json(req, res, 200, { configs: state.configs, updatedAt: state.updatedAt, source: state.source, live: clients.size > 0 })
      return
    }

    if (req.method === 'PUT' || req.method === 'POST') {
      if (path === '/state') {
        const body = await readJson(req)
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('请求体必须是对象')
        const configs = (body as Record<string, unknown>).configs
        if (!configs || typeof configs !== 'object' || Array.isArray(configs)) throw new Error('缺少 configs 对象')
        state = {
          configs,
          updatedAt: Date.now(),
          source: typeof (body as Record<string, unknown>).source === 'string' ? String((body as Record<string, unknown>).source) : 'app',
        }
        for (const waiter of stateWaiters) waiter(state)
        stateWaiters.clear()
        broadcast('state', { updatedAt: state.updatedAt })
        json(req, res, 200, { ok: true, updatedAt: state.updatedAt })
        return
      }
      if (path === '/apply') {
        const body = await readJson(req)
        const payload = validateApply(body)
        const sent = broadcast('apply', payload)
        if (sent === 0) queuedApply = payload
        log(`apply ${payload.apply} type=${payload.type ?? '(configs)'} → ${sent} client(s)${sent === 0 ? '，已排队等页面连接' : ''}`)
        json(req, res, 200, { ok: true, delivered: sent > 0, clients: sent, queued: sent === 0, at: payload.at })
        return
      }
    }

    json(req, res, 404, { error: 'not-found', path })
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((e: unknown) => {
      const message = e instanceof Error ? e.message : String(e)
      if (!res.headersSent) json(req, res, 400, { error: 'bad-request', message })
      else res.end()
    })
  })

  const listenResult = await new Promise<'listening' | 'in-use'>((resolve, reject) => {
    const onError = (err: NodeJS.ErrnoException) => {
      server.off('listening', onListening)
      if (err.code === 'EADDRINUSE') resolve('in-use')
      else reject(err)
    }
    const onListening = () => {
      server.off('error', onError)
      resolve('listening')
    }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(port, host)
  })

  if (listenResult === 'in-use') {
    log(`端口 ${host}:${port} 已被占用，复用已有桥接实例`)
    return {
      url: `http://${host}:${port}`,
      host,
      port,
      attached: true,
      close: async () => {},
    }
  }

  log(`桥接已启动：http://${host}:${port}`)
  return {
    url: `http://${host}:${port}`,
    host,
    port,
    attached: false,
    close: async () => {
      for (const beat of heartbeat) clearInterval(beat)
      heartbeat.clear()
      for (const client of clients) client.end()
      clients.clear()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    },
  }
}
