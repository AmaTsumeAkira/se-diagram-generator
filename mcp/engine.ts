/**
 * MCP 引擎适配层：在 Node 里复用 src/utils 下已有的纯 TS 渲染器。
 *
 * 关键事实（已实测）：svgExport / drawioExport / configSerialize / layout 系列
 * 完全不依赖 DOM，只有 visioExport 在模块顶层 import 了 file-saver。
 * 因此这里用 jiti 直接加载 TS 源码，并用 alias 把 file-saver 换成 shims/file-saver.mjs，
 * 从而在 Node 中生成 SVG / VSDX，无需浏览器、无需构建产物。
 *
 * 不修改 src/ 下的任何代码：MCP 看到的输入输出就是编辑器「导入/导出」用的那份 JSON。
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

export const DIAGRAM_TYPES = [
  'usecase',
  'structure',
  'entity',
  'er',
  'sequence',
  'class',
  'activity',
  'deployment',
  'flowchart',
] as const

export type DiagramType = (typeof DIAGRAM_TYPES)[number]
export type ERNotation = 'chen' | 'entity' | 'attribute' | 'table'

export const ER_NOTATIONS: ERNotation[] = ['chen', 'entity', 'attribute', 'table']

/** 单张图的平面 JSON —— 与编辑器「导入」接受的格式完全一致 */
export interface FlatNode {
  id: string
  type: string
  label?: string
  [key: string]: unknown
}

export interface FlatEdge {
  id?: string
  source: string
  target: string
  label?: string
  data?: Record<string, unknown>
}

export interface DiagramSpec {
  type: DiagramType
  nodes: FlatNode[]
  edges: FlatEdge[]
}

/** 引擎内部使用的运行时配置（parseDiagram 的输出） */
export interface RuntimeNode {
  id: string
  type?: string
  data: Record<string, unknown>
  position: { x: number; y: number }
}

export interface RuntimeEdge {
  id: string
  source: string
  target: string
  label?: string
  data?: Record<string, unknown>
}

export interface RuntimeConfig {
  nodes: RuntimeNode[]
  edges: RuntimeEdge[]
}

export type RuntimeConfigMap = Record<DiagramType, RuntimeConfig>

interface SerializeModule {
  parseDiagram(text: string): RuntimeConfig
  jsonToConfigs(json: string): Record<string, RuntimeConfig> | null
  configsToJson(configs: Record<string, RuntimeConfig>): string
  serializeDiagram(cfg: RuntimeConfig): { nodes: Record<string, unknown>[]; edges: Record<string, unknown>[] }
  normalizeUseCaseConfig(cfg: RuntimeConfig): RuntimeConfig
  normalizeEntityConfig(cfg: RuntimeConfig): RuntimeConfig
}

interface SvgModule {
  useCaseSvg(nodes: RuntimeNode[], edges: RuntimeEdge[]): string
  structureSvg(nodes: RuntimeNode[], edges: RuntimeEdge[]): string
  entitySvg(nodes: RuntimeNode[], edges: RuntimeEdge[]): string
  erSvg(nodes: RuntimeNode[], edges: RuntimeEdge[], opts?: { notation?: ERNotation }): string
  sequenceSvg(nodes: RuntimeNode[], edges: RuntimeEdge[]): string
  classSvg(nodes: RuntimeNode[], edges: RuntimeEdge[]): string
  activitySvg(nodes: RuntimeNode[], edges: RuntimeEdge[]): string
  deploymentSvg(nodes: RuntimeNode[], edges: RuntimeEdge[]): string
  flowchartSvg(nodes: RuntimeNode[], edges: RuntimeEdge[]): string
}

interface VisioModule {
  useCaseVisio(nodes: RuntimeNode[], edges: RuntimeEdge[]): Promise<void>
  structureVisio(nodes: RuntimeNode[], edges: RuntimeEdge[]): Promise<void>
  entityVisio(nodes: RuntimeNode[], edges: RuntimeEdge[]): Promise<void>
  erVisio(nodes: RuntimeNode[], edges: RuntimeEdge[]): Promise<void>
  sequenceVisio(nodes: RuntimeNode[], edges: RuntimeEdge[]): Promise<void>
  classVisio(nodes: RuntimeNode[], edges: RuntimeEdge[]): Promise<void>
  activityVisio(nodes: RuntimeNode[], edges: RuntimeEdge[]): Promise<void>
  deploymentVisio(nodes: RuntimeNode[], edges: RuntimeEdge[]): Promise<void>
  flowchartVisio(nodes: RuntimeNode[], edges: RuntimeEdge[]): Promise<void>
}

/** VSDX 落盘时文件名（visioExport 内部会用中文图名，这里保留原始名） */
/** 与 App 共用的 ER 关系补全（src/utils/erRelationNormalize.ts） */
interface ErRelationModule {
  normalizeErRelations<T extends { nodes: RuntimeNode[]; edges: RuntimeEdge[] }>(cfg: T): T
}

const VSDX_FN: Record<DiagramType, keyof VisioModule> = {
  usecase: 'useCaseVisio',
  structure: 'structureVisio',
  entity: 'entityVisio',
  er: 'erVisio',
  sequence: 'sequenceVisio',
  class: 'classVisio',
  activity: 'activityVisio',
  deployment: 'deploymentVisio',
  flowchart: 'flowchartVisio',
}

/** 图类型 → src/utils/svgExport 里的函数名 */
const SVG_FN: Record<DiagramType, keyof SvgModule> = {
  usecase: 'useCaseSvg',
  structure: 'structureSvg',
  entity: 'entitySvg',
  er: 'erSvg',
  sequence: 'sequenceSvg',
  class: 'classSvg',
  activity: 'activitySvg',
  deployment: 'deploymentSvg',
  flowchart: 'flowchartSvg',
}

export const TYPE_LABELS: Record<DiagramType, string> = {
  usecase: '用例图',
  structure: '功能结构图',
  entity: '实体属性图',
  er: '总体 ER 图',
  sequence: '时序图',
  class: '类图',
  activity: '活动图',
  deployment: '部署图',
  flowchart: '程序流程图',
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SAVED_SLOT = '__DIAGRAM_MCP_SAVED__'

const jiti = createJiti(import.meta.url, {
  // 让 visioExport 的 `import { saveAs } from 'file-saver'` 在 Node 里可运行
  alias: { 'file-saver': fileURLToPath(new URL('./shims/file-saver.mjs', import.meta.url)) },
  interopDefault: true,
})

let cache: Promise<{ serialize: SerializeModule; svg: SvgModule; visio: VisioModule; erRelations: ErRelationModule }> | null = null

function loadModules() {
  cache ??= (async () => {
    const [serialize, svg, visio, erRelations] = await Promise.all([
      jiti.import(path.join(ROOT, 'src/utils/configSerialize.ts')),
      jiti.import(path.join(ROOT, 'src/utils/svgExport.ts')),
      jiti.import(path.join(ROOT, 'src/utils/visioExport.ts')),
      jiti.import(path.join(ROOT, 'src/utils/erRelationNormalize.ts')),
    ])
    return {
      serialize: serialize as unknown as SerializeModule,
      svg: svg as unknown as SvgModule,
      visio: visio as unknown as VisioModule,
      erRelations: erRelations as unknown as ErRelationModule,
    }
  })()
  return cache
}

export function isDiagramType(value: unknown): value is DiagramType {
  return typeof value === 'string' && (DIAGRAM_TYPES as readonly string[]).includes(value)
}

function normalizeForType(type: DiagramType, cfg: RuntimeConfig, serialize: SerializeModule): RuntimeConfig {
  // 用例图 / 实体属性图：与 App 的「应用修改」走同一套归一化，
  // 避免同一个子节点被多个父级引用时在编辑器里膨胀。
  if (type === 'usecase') return serialize.normalizeUseCaseConfig(cfg)
  if (type === 'entity') return serialize.normalizeEntityConfig(cfg)
  return cfg
}

/**
 * ER 图关系补全（与编辑器共用 src/utils/erRelationNormalize.ts）：
 * 把实体间直连边改写成「实体 → 菱形 → 实体」，否则 erRouting 只认菱形、直连边会被忽略。
 */
async function normalizeEr(type: DiagramType, cfg: RuntimeConfig): Promise<RuntimeConfig> {
  if (type !== 'er') return cfg
  const { erRelations } = await loadModules()
  return erRelations.normalizeErRelations(cfg) as RuntimeConfig
}

/** 平面 JSON（与编辑器导入格式一致）→ 运行时配置（已归一化） */
export async function parseSpec(spec: DiagramSpec): Promise<RuntimeConfig> {
  const { serialize } = await loadModules()
  if (!isDiagramType(spec.type)) throw new Error(`未知图类型：${String(spec.type)}。可用：${DIAGRAM_TYPES.join(', ')}`)
  if (!Array.isArray(spec.nodes) || !Array.isArray(spec.edges)) throw new Error('nodes / edges 必须是数组')
  const cfg = serialize.parseDiagram(JSON.stringify({ nodes: spec.nodes, edges: spec.edges }))
  const normalized = normalizeForType(spec.type, cfg, serialize)
  return normalizeEr(spec.type, normalized)
}

/** 运行时配置 → 平面 JSON（可直接通过 MCP 回传给调用方，或粘进编辑器导入） */
export async function specFromConfig(type: DiagramType, cfg: RuntimeConfig): Promise<DiagramSpec> {
  const { serialize } = await loadModules()
  const flat = serialize.serializeDiagram(cfg)
  return { type, nodes: flat.nodes as unknown as FlatNode[], edges: flat.edges as unknown as FlatEdge[] }
}

/** 全量序列化（App 的 localStorage / state 上报格式） */
export async function configsToJsonString(configs: RuntimeConfigMap): Promise<string> {
  const { serialize } = await loadModules()
  return serialize.configsToJson(configs as unknown as Record<string, RuntimeConfig>)
}

export function emptyConfigMap(): RuntimeConfigMap {
  const out = {} as RuntimeConfigMap
  for (const t of DIAGRAM_TYPES) out[t] = { nodes: [], edges: [] }
  return out
}

/**
 * 解析编辑器导出的 JSON：既接受「全量 ConfigMap」，也接受「单张图 {nodes,edges} + type」。
 * 返回归一化后的全量 ConfigMap（缺失类型补空配置）。
 */
export async function parseConfigsJson(input: string, fallbackType?: DiagramType): Promise<RuntimeConfigMap> {
  const { serialize } = await loadModules()
  const trimmed = input.trim()
  if (!trimmed) throw new Error('JSON 内容为空')

  let obj: unknown
  try {
    obj = JSON.parse(trimmed)
  } catch (e) {
    throw new Error(`JSON 解析失败：${(e as Error).message}`, { cause: e })
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('JSON 必须是对象')

  const record = obj as Record<string, unknown>
  if (DIAGRAM_TYPES.some((t) => record[t] !== undefined)) {
    const parsed = serialize.jsonToConfigs(trimmed)
    if (!parsed) throw new Error('无法解析该 JSON：既不是完整配置，也不是单张图')
    const configs = emptyConfigMap()
    for (const t of DIAGRAM_TYPES) {
      const cfg = parsed[t]
      if (cfg) {
        const normalized = normalizeForType(t, cfg, serialize)
        configs[t] = await normalizeEr(t, normalized)
      }
    }
    return configs
  }

  const type = fallbackType ?? (isDiagramType(record.type) ? record.type : undefined)
  if (!type) throw new Error('单张图 JSON 需要指定类型（type 字段或 type 参数）')
  if (!Array.isArray(record.nodes) && !Array.isArray(record.edges)) throw new Error('单张图 JSON 必须包含 nodes / edges')
  const cfg = serialize.parseDiagram(trimmed)
  const configs = emptyConfigMap()
  const normalized = normalizeForType(type, cfg, serialize)
  configs[type] = await normalizeEr(type, normalized)
  return configs
}

async function renderSvgFromConfig(
  type: DiagramType,
  cfg: RuntimeConfig,
  notation: ERNotation,
): Promise<string> {
  const { svg } = await loadModules()
  const fn = SVG_FN[type]
  const out =
    type === 'er' ? svg.erSvg(cfg.nodes, cfg.edges, { notation }) : (svg[fn] as (n: RuntimeNode[], e: RuntimeEdge[]) => string)(cfg.nodes, cfg.edges)
  if (!out || !out.includes('<svg')) throw new Error(`渲染 ${type} 失败：渲染器返回空 SVG`)
  return out
}

/** 平面 JSON → SVG 字符串 */
export async function renderSvg(spec: DiagramSpec, notation: ERNotation = 'chen'): Promise<string> {
  const cfg = await parseSpec(spec)
  return renderSvgFromConfig(spec.type, cfg, notation)
}

/** 运行时配置 → SVG（供 import 工具预览） */
export async function renderSvgFromRuntime(
  type: DiagramType,
  cfg: RuntimeConfig,
  notation: ERNotation = 'chen',
): Promise<string> {
  return renderSvgFromConfig(type, cfg, notation)
}

/**
 * 运行时配置 → VSDX Buffer。
 * visioExport 的出口是 file-saver 的 saveAs(blob, name)，shim 会捕获它，这里取出最后一个。
 */
export async function renderVsdxFromConfig(type: DiagramType, cfg: RuntimeConfig): Promise<{ buffer: Buffer; name: string }> {
  const { visio } = await loadModules()
  const slot = globalThis as unknown as Record<string, Array<{ blob: Blob; name: string }> | undefined>
  slot[SAVED_SLOT] = []
  await visio[VSDX_FN[type]](cfg.nodes, cfg.edges)
  const saved = slot[SAVED_SLOT]
  const last = saved?.[saved.length - 1]
  if (!last) throw new Error(`生成 ${type} VSDX 失败：导出器没有产生文件`)
  const buffer = Buffer.from(await last.blob.arrayBuffer())
  return { buffer, name: last.name }
}

/** 平面 JSON → VSDX Buffer */
export async function renderVsdx(spec: DiagramSpec): Promise<{ buffer: Buffer; name: string }> {
  const cfg = await parseSpec(spec)
  return renderVsdxFromConfig(spec.type, cfg)
}
