/**
 * MCP 协议冒烟测试（不依赖 MCP 客户端）：
 * 直接 spawn `tsx mcp/server.ts`，按 JSON-RPC 走 initialize → tools/list → tools/call。
 *
 * 运行：node mcp/smoke.mjs
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tsx = path.join(root, 'node_modules/.bin/tsx')
const server = path.join(root, 'mcp/server.ts')
const port = process.env.DIAGRAM_MCP_SMOKE_PORT || '4799'

const child = spawn(tsx, [server], {
  cwd: root,
  env: { ...process.env, DIAGRAM_MCP_PORT: port },
  stdio: ['pipe', 'pipe', 'pipe'],
})

let buffer = ''
const pending = new Map()
let nextId = 1
let stderr = ''
let failed = false

child.stderr.on('data', (chunk) => {
  stderr += chunk.toString()
})

child.stdout.on('data', (chunk) => {
  buffer += chunk.toString()
  let idx
  while ((idx = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, idx).trim()
    buffer = buffer.slice(idx + 1)
    if (!line) continue
    let msg
    try {
      msg = JSON.parse(line)
    } catch {
      console.error('非 JSON-RPC 输出：', line)
      failed = true
      continue
    }
    if (msg.id !== undefined && pending.has(msg.id)) {
      pending.get(msg.id)(msg)
      pending.delete(msg.id)
    }
  }
})

function request(method, params) {
  const id = nextId++
  const payload = { jsonrpc: '2.0', id, method, params }
  child.stdin.write(JSON.stringify(payload) + '\n')
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error(`${method} 超时`))
    }, 30_000)
    pending.set(id, (msg) => {
      clearTimeout(timer)
      resolve(msg)
    })
  })
}

function notify(method, params) {
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n')
}

function assert(cond, message) {
  if (!cond) {
    failed = true
    console.error(`FAIL ${message}`)
  } else {
    console.log(`PASS ${message}`)
  }
}

async function main() {
  const init = await request('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: { tools: {} },
    clientInfo: { name: 'diagram-mcp-smoke', version: '1.0.0' },
  })
  assert(init.result?.serverInfo?.name === 'se-diagram-generator', 'initialize 返回 serverInfo')
  notify('notifications/initialized', {})

  const list = await request('tools/list', {})
  const names = (list.result?.tools ?? []).map((t) => t.name)
  for (const expected of ['diagram_catalog', 'diagram_render', 'diagram_export', 'diagram_send', 'diagram_get', 'diagram_import', 'diagram_status']) {
    assert(names.includes(expected), `tools/list 包含 ${expected}`)
  }

  const call = (name, args) => request('tools/call', { name, arguments: args })

  const catalog = await call('diagram_catalog', {})
  const catalogText = catalog.result?.content?.[0]?.text ?? ''
  assert(catalogText.includes('"usecase"') && catalogText.includes('"flowchart"'), 'diagram_catalog 返回 9 类图')

  const render = await call('diagram_render', {
    type: 'sequence',
    nodes: [
      { id: 'u', type: 'participant', label: '用户' },
      { id: 's', type: 'participant', label: '系统' },
    ],
    edges: [{ id: 'm1', source: 'u', target: 's', label: '请求', data: { messageType: 'sync' } }],
  })
  const renderText = render.result?.content?.[0]?.text ?? ''
  assert(!render.result?.isError && renderText.includes('SVG'), 'diagram_render 返回 SVG 摘要')
  assert((render.result?.content ?? []).some((c) => c.type === 'resource' && c.resource?.mimeType === 'image/svg+xml'), 'diagram_render 返回 SVG 资源')

  const vsdx = await call('diagram_render', {
    type: 'er',
    nodes: [
      { id: 'a', type: 'erEntity', label: '用户', fields: [{ name: 'id', type: 'INT', pk: true }] },
      { id: 'b', type: 'erEntity', label: '订单', fields: [{ name: 'id', type: 'INT', pk: true }] },
    ],
    edges: [{ id: 'r', source: 'a', target: 'b', data: { sourceCard: '1', targetCard: 'N' } }],
    format: 'vsdx',
  })
  const vsdxResource = (vsdx.result?.content ?? []).find((c) => c.type === 'resource')
  assert(Boolean(vsdxResource?.resource?.blob), 'diagram_render 返回 VSDX 资源')

  const status = await call('diagram_status', {})
  assert((status.result?.content?.[0]?.text ?? '').includes('运行中'), 'diagram_status 能看到桥接')

  const get = await call('diagram_get', {})
  assert(!get.result?.isError, 'diagram_get 在无页面时给出手册性提示而不是崩溃')

  child.kill('SIGTERM')
  await new Promise((r) => setTimeout(r, 300))
  if (failed) {
    console.error('\n--- server stderr ---\n' + stderr)
    process.exit(1)
  }
  console.log('\nMCP 冒烟测试全部通过')
}

main().catch((e) => {
  failed = true
  console.error(e)
  console.error('\n--- server stderr ---\n' + stderr)
  child.kill('SIGKILL')
  process.exit(1)
})
