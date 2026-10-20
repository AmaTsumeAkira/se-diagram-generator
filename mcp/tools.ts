/**
 * MCP 工具集：把「渲染引擎 + 本地桥接」包装成 LLM 可调用的工具。
 *
 * 工具一览：
 *   diagram_catalog  9 类图的节点/边字段说明与示例
 *   diagram_render   平面 JSON → SVG / VSDX（返回内容，可直接落盘）
 *   diagram_export   平面 JSON → 文件（SVG / VSDX）
 *   diagram_send     平面 JSON → 实时推送到打开的编辑器
 *   diagram_get      读取编辑器当前的图（可指定类型，fresh=1 先向页面要最新）
 *   diagram_import   读取/解析编辑器导出的 JSON（全量或单张）
 *   diagram_status   桥接与页面连接状态
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { catalogJson } from './catalog.ts'
import {
  DIAGRAM_TYPES,
  ER_NOTATIONS,
  TYPE_LABELS,
  configsToJsonString,
  isDiagramType,
  parseConfigsJson,
  parseSpec,
  renderSvg,
  renderSvgFromRuntime,
  renderVsdx,
  specFromConfig,
  type DiagramSpec,
  type DiagramType,
  type ERNotation,
  type FlatEdge,
  type FlatNode,
} from './engine.ts'

export interface ToolContext {
  bridgeUrl: string
  token?: string
  log: (message: string) => void
}

type ToolResult = CallToolResult

// ---------- schemas ----------

const nodeSchema = z
  .object({
    id: z.string().min(1).describe('节点 id，图内唯一'),
    type: z.string().min(1).describe('节点类型，见 diagram_catalog'),
    label: z.string().optional().describe('显示文字'),
  })
  .catchall(z.unknown())
  .describe('节点对象；除 id/type/label 外可带该图类型的字段（如 fields、attributes、rx/ry）')

const edgeSchema = z.object({
  id: z.string().optional(),
  source: z.string().min(1).describe('起点节点 id'),
  target: z.string().min(1).describe('终点节点 id'),
  label: z.string().optional().describe('连线文字'),
  data: z.record(z.string(), z.unknown()).optional().describe('连线数据（如 messageType、relationType、guard、sourceCard/targetCard）'),
})

const typeSchema = z.enum(DIAGRAM_TYPES as unknown as [string, ...string[]]).describe('图类型')
const notationSchema = z.enum(ER_NOTATIONS as unknown as [string, ...string[]]).describe('ER 图表示法，默认 table')
const formatSchema = z.enum(['svg', 'vsdx']).describe('输出格式')

const svgMime = 'image/svg+xml'
const vsdxMime = 'application/vnd.ms-visio.drawing'

// ---------- helpers ----------

const text = (value: string): ToolResult['content'][number] => ({ type: 'text', text: value })

const blobResource = (uri: string, mimeType: string, blob: string): ToolResult['content'][number] => ({
  type: 'resource',
  resource: { uri, mimeType, blob },
})

function fail(message: string): ToolResult {
  return { isError: true, content: [text(message)] }
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

function resolveNotation(input?: string): ERNotation {
  return (ER_NOTATIONS as string[]).includes(input ?? '') ? (input as ERNotation) : 'table'
}

function buildSpec(type: string, nodes: FlatNode[], edges: FlatEdge[]): DiagramSpec {
  if (!isDiagramType(type)) throw new Error(`未知图类型：${type}。可选：${DIAGRAM_TYPES.join(', ')}`)
  return { type, nodes, edges }
}

function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'diagram'
}

async function writeOutFile(target: string, data: string | Buffer): Promise<{ path: string; bytes: number }> {
  const resolved = path.resolve(process.cwd(), target)
  await mkdir(path.dirname(resolved), { recursive: true })
  await writeFile(resolved, data)
  return { path: resolved, bytes: typeof data === 'string' ? Buffer.byteLength(data) : data.length }
}

function defaultTempFile(ext: string, type: string): string {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
  return path.join(os.tmpdir(), 'se-diagram-mcp', `${type}-${stamp}.${ext}`)
}

async function bridgeJson(ctx: ToolContext, route: string, init?: RequestInit): Promise<{ status: number; body: unknown }> {
  const base = ctx.bridgeUrl.replace(/\/+$/, '')
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (ctx.token) headers['X-MCP-Token'] = ctx.token
  let response: Response
  try {
    response = await fetch(base + route, {
      ...init,
      headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) },
      signal: AbortSignal.timeout(4_000),
    })
  } catch (e) {
    throw new Error(`无法连接本地桥接 ${base}（请确认 MCP 服务在运行）：${errorMessage(e)}`, { cause: e })
  }
  let body: unknown = null
  if (response.status !== 204) {
    try {
      body = await response.json()
    } catch {
      body = null
    }
  }
  return { status: response.status, body }
}

interface BridgeStateResponse {
  configs?: unknown
  updatedAt?: number
  live?: boolean
  source?: string
  clients?: number
  hint?: string
}

function summarizeState(body: unknown): BridgeStateResponse {
  return (body ?? {}) as BridgeStateResponse
}

// ---------- 工具注册 ----------

export function registerDiagramTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'diagram_catalog',
    {
      title: '图类型目录',
      description:
        '列出本生成器支持的全部图类型（用例图/功能结构图/实体属性图/ER 图/时序图/类图/活动图/部署图/程序流程图），' +
        '包含每类图的节点类型、边数据字段、示例 JSON 和 ER 表示法说明。调用其他工具前建议先看这个。',
      inputSchema: {
        types: z.array(typeSchema).optional().describe('只返回指定图类型；省略则返回全部'),
      },
    },
    async ({ types }) => {
      try {
        const picked = (types ?? []).filter(isDiagramType)
        return { content: [text(catalogJson(picked.length ? picked : undefined))] }
      } catch (e) {
        return fail(errorMessage(e))
      }
    },
  )

  server.registerTool(
    'diagram_render',
    {
      title: '渲染图（SVG / VSDX）',
      description:
        '把一份平面 JSON（与编辑器导入格式相同）渲染成 SVG 或 Visio VSDX。不依赖浏览器。' +
        '返回内容同时包含文件路径与可直接展示的资源；给了 savePath 时写入指定路径，否则写到系统临时目录。',
      inputSchema: {
        type: typeSchema,
        nodes: z.array(nodeSchema),
        edges: z.array(edgeSchema).optional(),
        format: formatSchema.optional().describe('默认 svg'),
        notation: notationSchema.optional(),
        savePath: z.string().optional().describe('保存路径（相对当前工作目录或绝对路径）；省略则写临时目录'),
      },
    },
    async ({ type, nodes, edges, format, notation, savePath }) => {
      try {
        const spec = buildSpec(type, nodes as FlatNode[], (edges ?? []) as FlatEdge[])
        const fmt = format ?? 'svg'
        if (fmt === 'vsdx') {
          const { buffer } = await renderVsdx(spec)
          const target = savePath ?? defaultTempFile('vsdx', type)
          const { path: savedPath, bytes } = await writeOutFile(target, buffer)
          return {
            content: [
              text(
                `已渲染 ${TYPE_LABELS[type as DiagramType]}（${spec.nodes.length} 节点 / ${spec.edges.length} 边）→ VSDX ${bytes} 字节\n文件：${savedPath}`,
              ),
              blobResource(pathToFileURL(savedPath).href, vsdxMime, buffer.toString('base64')),
            ],
          }
        }
        const svg = await renderSvg(spec, resolveNotation(notation))
        const target = savePath ?? defaultTempFile('svg', type)
        const { path: savedPath, bytes } = await writeOutFile(target, svg)
        return {
          content: [
            text(
              `已渲染 ${TYPE_LABELS[type as DiagramType]}（${spec.nodes.length} 节点 / ${spec.edges.length} 边）→ SVG ${bytes} 字节\n文件：${savedPath}`,
            ),
            blobResource(pathToFileURL(savedPath).href, svgMime, Buffer.from(svg, 'utf8').toString('base64')),
            text(svg),
          ],
        }
      } catch (e) {
        return fail(`渲染失败：${errorMessage(e)}`)
      }
    },
  )

  server.registerTool(
    'diagram_export',
    {
      title: '导出图到文件',
      description: '把平面 JSON 写成 .svg 或 .vsdx 文件。默认写到当前工作目录，可用 path 指定。返回文件绝对路径。',
      inputSchema: {
        type: typeSchema,
        nodes: z.array(nodeSchema),
        edges: z.array(edgeSchema).optional(),
        format: formatSchema.describe('svg 或 vsdx'),
        path: z.string().optional().describe('输出路径；省略则写到工作目录 diagram-<type>.<ext>'),
        notation: notationSchema.optional(),
      },
    },
    async ({ type, nodes, edges, format, path: outPath, notation }) => {
      try {
        const spec = buildSpec(type, nodes as FlatNode[], (edges ?? []) as FlatEdge[])
        const defaultName = `diagram-${spec.type}.${format === 'vsdx' ? 'vsdx' : 'svg'}`
        const target = outPath ?? path.join(process.cwd(), safeFileName(defaultName))
        if (format === 'vsdx') {
          const { buffer } = await renderVsdx(spec)
          const { path: savedPath, bytes } = await writeOutFile(target, buffer)
          return { content: [text(`已导出 ${TYPE_LABELS[spec.type]} → ${savedPath}（${bytes} 字节，VSDX）`)] }
        }
        const svg = await renderSvg(spec, resolveNotation(notation))
        const { path: savedPath, bytes } = await writeOutFile(target, svg)
        return { content: [text(`已导出 ${TYPE_LABELS[spec.type]} → ${savedPath}（${bytes} 字节，SVG）`)] }
      } catch (e) {
        return fail(`导出失败：${errorMessage(e)}`)
      }
    },
  )

  server.registerTool(
    'diagram_send',
    {
      title: '发送图到编辑器（实时）',
      description:
        '把一张图通过本地桥接实时推送到正在打开的编辑器页面（自动切到对应标签页）。' +
        '只替换该图类型的配置，其他 8 张图保持不变；页面未打开时消息会排队，等页面连上后补发。',
      inputSchema: {
        type: typeSchema,
        nodes: z.array(nodeSchema),
        edges: z.array(edgeSchema).optional(),
        notation: notationSchema.optional(),
      },
    },
    async ({ type, nodes, edges }) => {
      try {
        const spec = buildSpec(type, nodes as FlatNode[], (edges ?? []) as FlatEdge[])
        // 先走一遍引擎，得到归一化后的平面 JSON（与页面「应用修改」同一路径）
        const cfg = await parseSpec(spec)
        const flat = await specFromConfig(spec.type, cfg)
        const { status, body } = await bridgeJson(ctx, '/apply', {
          method: 'POST',
          body: JSON.stringify({
            apply: 'merge',
            type: spec.type,
            diagram: { nodes: flat.nodes, edges: flat.edges },
            source: 'mcp',
          }),
        })
        if (status !== 200) throw new Error(`桥接返回 HTTP ${status}：${JSON.stringify(body)}`)
        const result = summarizeState(body)
        const delivered = Boolean((body as { delivered?: boolean } | null)?.delivered)
        const summary = delivered
          ? `已推送 ${TYPE_LABELS[spec.type]}（${flat.nodes.length} 节点 / ${flat.edges.length} 边）到打开的编辑器。`
          : `已排队 ${TYPE_LABELS[spec.type]}（${flat.nodes.length} 节点 / ${flat.edges.length} 边）：编辑器页面当前未连接，打开页面后会自动应用。`
        ctx.log(`diagram_send ${spec.type} delivered=${delivered}`)
        return { content: [text(`${summary}\n桥接：${ctx.bridgeUrl}${result.clients !== undefined ? `（在线 ${result.clients} 个页面）` : ''}`)] }
      } catch (e) {
        return fail(`发送失败：${errorMessage(e)}`)
      }
    },
  )

  server.registerTool(
    'diagram_get',
    {
      title: '读取编辑器当前的图',
      description:
        '读取正在打开的编辑器里的全部图配置（9 类图），可只取某一种。fresh=1 会先请求页面立即上报最新状态。' +
        '返回的 JSON 与编辑器「导出全部数据」格式一致，可直接修改后再用 diagram_send 推回。',
      inputSchema: {
        type: typeSchema.optional().describe('只返回该图类型；省略返回全部'),
        fresh: z.boolean().optional().describe('默认 true：向页面要最新状态（最多等 2 秒）'),
      },
    },
    async ({ type, fresh }) => {
      try {
        const wantFresh = fresh !== false
        const { status, body } = await bridgeJson(ctx, `/state${wantFresh ? '?fresh=1' : ''}`)
        if (status === 404) {
          const hint = summarizeState(body).hint ?? '编辑器尚未连接。'
          return { content: [text(`没有可读取的状态：${hint}`)] }
        }
        if (status !== 200) throw new Error(`桥接返回 HTTP ${status}：${JSON.stringify(body)}`)
        const state = summarizeState(body)
        const configs = await parseConfigsJson(JSON.stringify(state.configs ?? {}))
        if (type && isDiagramType(type)) {
          const flat = await specFromConfig(type, configs[type])
          return {
            content: [
              text(
                `${TYPE_LABELS[type]}：${flat.nodes.length} 节点 / ${flat.edges.length} 边（${state.live ? '页面在线' : '页面离线，数据为缓存'}，更新于 ${new Date(state.updatedAt ?? Date.now()).toLocaleString('zh-CN')}）`,
              ),
              text(JSON.stringify(flat, null, 2)),
            ],
          }
        }
        const json = await configsToJsonString(configs)
        const counts = DIAGRAM_TYPES.map((t) => `${t}:${configs[t].nodes.length}节点/${configs[t].edges.length}边`).join('，')
        return {
          content: [
            text(`当前编辑器配置（${state.live ? '页面在线' : '页面离线，数据为缓存'}）：${counts}`),
            text(json),
          ],
        }
      } catch (e) {
        return fail(`读取失败：${errorMessage(e)}`)
      }
    },
  )

  server.registerTool(
    'diagram_import',
    {
      title: '解析导入文件',
      description:
        '读取并解析编辑器导出的 JSON（全量 9 类图配置，或单张图 {nodes,edges}），返回归一化后的配置。' +
        'content 与 path 二选一；单张图需要 type 参数。可用于「把磁盘上的图读进来 → 渲染/推送」。',
      inputSchema: {
        content: z.string().optional().describe('JSON 文本'),
        path: z.string().optional().describe('JSON 文件路径'),
        type: typeSchema.optional().describe('单张图 JSON 的类型'),
      },
    },
    async ({ content, path: filePath, type }) => {
      try {
        if (!content && !filePath) throw new Error('content 与 path 至少提供一个')
        const raw = content ?? (await readFile(path.resolve(process.cwd(), filePath as string), 'utf8'))
        const configs = await parseConfigsJson(raw, type && isDiagramType(type) ? type : undefined)
        const counts = DIAGRAM_TYPES.map((t) => `${t}:${configs[t].nodes.length}节点/${configs[t].edges.length}边`).join('，')
        const json = await configsToJsonString(configs)
        // 单张图且指定了 type 时，顺手给一张 SVG 预览
        if (type && isDiagramType(type) && configs[type].nodes.length > 0) {
          const svg = await renderSvgFromRuntime(type, configs[type], 'table')
          return {
            content: [
              text(`已解析（${counts}）。${TYPE_LABELS[type]} SVG ${svg.length} 字节。`),
              blobResource(`diagram://import/${type}`, svgMime, Buffer.from(svg, 'utf8').toString('base64')),
              text(json),
            ],
          }
        }
        return { content: [text(`已解析：${counts}`), text(json)] }
      } catch (e) {
        return fail(`解析失败：${errorMessage(e)}`)
      }
    },
  )

  server.registerTool(
    'diagram_status',
    {
      title: '桥接/页面状态',
      description: '检查本地桥接是否在运行、编辑器页面是否已连接、是否有排队的推送。排障时用。',
      inputSchema: {},
    },
    async () => {
      try {
        const { status, body } = await bridgeJson(ctx, '/health')
        if (status !== 200) throw new Error(`桥接返回 HTTP ${status}`)
        const health = (body ?? {}) as {
          ok?: boolean
          clients?: number
          hasState?: boolean
          hasQueuedApply?: boolean
          pid?: number
          uptimeMs?: number
        }
        return {
          content: [
            text(
              [
                `桥接：${ctx.bridgeUrl}（运行中，pid ${health.pid}）`,
                `编辑器页面：${health.clients ? `已连接 ${health.clients} 个` : '未连接'}`,
                `状态缓存：${health.hasState ? '有' : '无'}`,
                `排队推送：${health.hasQueuedApply ? '有' : '无'}`,
                `运行时长：${Math.round((health.uptimeMs ?? 0) / 1000)} 秒`,
              ].join('\n'),
            ),
          ],
        }
      } catch (e) {
        return fail(`桥接不可用：${errorMessage(e)}`)
      }
    },
  )
}
