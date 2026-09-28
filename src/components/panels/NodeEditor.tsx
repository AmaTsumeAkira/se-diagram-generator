import { useState, useRef, useEffect, useMemo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useVercount } from '@vercount/react'
import type { Edge } from '@xyflow/react'
import { layoutErEntities, suggestCenter } from '../../utils/erLayout'
import type { ERField } from '../../types/diagram'
import { parseFieldsText, fieldsToText, fieldsFromTable } from '../../utils/erFields'

// ====== Types ======

export interface UseCaseState {
  fontFamily?: string
  fontSize?: number
  actors: {
    id: string
    label: string
    useCases: { id: string; label: string }[]
  }[]
}

export interface TreeNode {
  id: string
  label: string
  vertical: boolean
  children: TreeNode[]
  fontSize?: number
  fontFamily?: string
  spacing?: number
}

export interface EntityState {
  fontFamily?: string
  fontSize?: number
  entities: {
    id: string
    label: string
    attributes: { id: string; label: string }[]
  }[]
  /**
   * 未被任何实体引用的椭圆节点（例如历史数据里被孤立、或手工删除实体后残留的属性）。
   * 由 App 从配置里挑出来注入，编辑器里可查看 / 删除；应用时原样写回为无连线节点，
   * 避免「看不见 → 编辑一次就被静默删除」。
   */
  unlinkedAttributes?: { id: string; label: string }[]
}

// ====== 新增图表状态接口 ======

export interface SequenceState {
  participants: {
    id: string
    label: string
    participantType: 'actor' | 'system' | 'database'
  }[]
  messages: {
    id: string
    source: string
    target: string
    label: string
    messageType: 'sync' | 'async' | 'return'
  }[]
  /**
   * participant 之外的节点（典型是 Mermaid 的 activation 激活条），由 App 注入。
   * 编辑器不认识这些节点，但应用时必须原样补回，否则会被吞掉。
   */
  extraNodes?: { id: string; type: string; data: Record<string, unknown> }[]
  /** 与 extraNodes 相关、或两端不全是 participant 的边，同样原样补回 */
  extraEdges?: Edge[]
}

export interface ClassState {
  classes: {
    id: string
    label: string
    attributes: string[]
    methods: string[]
    isAbstract?: boolean
    stereotype?: string
    /** 类 / 接口 / 枚举（缺省视为 class），决定节点 type 与渲染形状 */
    type?: 'class' | 'interface' | 'enum'
  }[]
  relations?: {
    id: string
    source: string
    target: string
    relationType: string
    label?: string
  }[]
}

export interface ActivityState {
  nodes: {
    id: string
    label: string
    nodeType: 'start' | 'end' | 'action' | 'decision'
  }[]
  edges: {
    id: string
    source: string
    target: string
    guard?: string
  }[]
}

export interface DeploymentState {
  nodes: {
    id: string
    label: string
    nodeType: 'server' | 'database' | 'component' | 'artifact' | 'node'
    technology?: string
  }[]
  edges: {
    id: string
    source: string
    target: string
    label?: string
  }[]
}

export interface ERState {
  entities: {
    id: string
    label: string
    row?: number
    col?: number
    group?: string
    x?: number
    y?: number
    /** 字段列表（字段环绕 / 表格型表示法使用，可由 SQL 导入或手动填写） */
    fields?: ERField[]
  }[]
  relationships: {
    id: string
    label: string
    source: string
    target: string
    sourceCard: string
    targetCard: string
    /** 显式几何：菱形中心坐标（px），缺省则自动取中点 */
    diamondX?: number
    diamondY?: number
    /** 显式几何：完整正交折线（源实体边缘 → 干线 → 目标实体边缘） */
    line?: number[][]
  }[]
}

export type DiagramType = 'usecase' | 'structure' | 'entity' | 'er' | 'sequence' | 'class' | 'activity' | 'deployment'

interface Props {
  type: DiagramType
  useCase?: UseCaseState
  /** 功能结构图现在是「森林」：允许多个根并存（原单根假设会把额外根/环丢成白屏） */
  tree?: { roots: TreeNode[] }
  entity?: EntityState
  er?: ERState
  sequence?: SequenceState
  classState?: ClassState
  activity?: ActivityState
  deployment?: DeploymentState
  onApply: (json: string) => void
}

// ====== ID generator ======
function uid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return 'n' + crypto.randomUUID().replace(/-/g, '').slice(0, 12)
  }
  return 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

/** 卡片级 Delete/Backspace 快捷键必须避开正在输入的控件（否则在输入框里退格会删掉整张卡片） */
function isEditableTarget(e: React.KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

const DEFAULT_FONT_FAMILY = 'SimSun'
const DEFAULT_FONT_SIZE = 14

const CHINESE_FONT_SIZES = [
  { name: '一号', pt: 26, px: 35 },
  { name: '小一', pt: 24, px: 32 },
  { name: '二号', pt: 22, px: 29 },
  { name: '小二', pt: 18, px: 24 },
  { name: '三号', pt: 16, px: 21 },
  { name: '小三', pt: 15, px: 20 },
  { name: '四号', pt: 14, px: 19 },
  { name: '小四', pt: 12, px: 16 },
  { name: '五号', pt: 10.5, px: 14 },
  { name: '小五', pt: 9, px: 12 },
  { name: '六号', pt: 7.5, px: 10 },
  { name: '小六', pt: 6.5, px: 9 },
  { name: '七号', pt: 5.5, px: 7 },
  { name: '八号', pt: 5, px: 7 },
]

function FontSettings({
  fontFamily, fontSize, onFontFamilyChange, onFontSizeChange, extra,
}: {
  fontFamily: string
  fontSize: number
  onFontFamilyChange: (value: string) => void
  onFontSizeChange: (value: number) => void
  extra?: ReactNode
}) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-2 mb-3 px-1 text-xs text-gray-500 flex-wrap">
      <label className="flex items-center gap-1">
        {t('editor.fontFamily')}
        <select value={fontFamily}
          className="w-24 px-1 py-0.5 border border-gray-300 rounded text-xs bg-white"
          onChange={(e) => onFontFamilyChange(e.target.value)}>
          <option value="SimSun">宋体</option>
          <option value="Microsoft YaHei">微软雅黑</option>
          <option value="KaiTi">楷体</option>
          <option value="SimHei">黑体</option>
        </select>
      </label>
      <label className="flex items-center gap-1">
        {t('editor.fontSize')}
        <select value={fontSize}
          className="w-24 px-1 py-0.5 border border-gray-300 rounded text-xs bg-white"
          onChange={(e) => onFontSizeChange(Number(e.target.value) || DEFAULT_FONT_SIZE)}>
          {CHINESE_FONT_SIZES.map((size) => (
            <option key={`${size.name}-${size.pt}`} value={size.px}>
              {size.name} {size.pt}磅
            </option>
          ))}
        </select>
      </label>
      {extra}
    </div>
  )
}

// ====== JSON generators ======

function useCaseToJson(state: UseCaseState): string {
  const nodes: any[] = []
  const edges: any[] = []
  const fontFamily = state.fontFamily || DEFAULT_FONT_FAMILY
  const fontSize = state.fontSize || DEFAULT_FONT_SIZE
  state.actors.forEach((actor) => {
    nodes.push({ id: actor.id, type: 'actor', label: actor.label, fontFamily, fontSize })
    actor.useCases.forEach((uc, i) => {
      nodes.push({ id: uc.id, type: 'usecase', label: uc.label, rx: 60, ry: 15, fontFamily, fontSize })
      edges.push({ id: `e_${actor.id}_${i}`, source: actor.id, target: uc.id })
    })
  })
  return JSON.stringify({ nodes, edges }, null, 2)
}

/**
 * 森林 → JSON：遍历全部根，输出所有节点与边。
 * 与原单根实现保持一致：只有根节点带 fontSize / fontFamily / spacing。
 */
function treeToJson(roots: TreeNode[], fontSize = DEFAULT_FONT_SIZE, spacing = 26, fontFamily = DEFAULT_FONT_FAMILY): string {
  const nodes: any[] = []
  const edges: any[] = []
  const seenNodes = new Set<string>()
  const seenEdges = new Set<string>()
  function walk(node: TreeNode, isRoot = false) {
    if (!seenNodes.has(node.id)) {
      seenNodes.add(node.id)
      const n: any = { id: node.id, type: 'rectangle', label: node.label, vertical: node.vertical }
      if (isRoot) { n.fontSize = node.fontSize || fontSize; n.fontFamily = node.fontFamily || fontFamily; n.spacing = node.spacing || spacing }
      nodes.push(n)
    }
    node.children.forEach((child) => {
      const eid = `e_${node.id}_${child.id}`
      if (!seenEdges.has(eid)) {
        seenEdges.add(eid)
        edges.push({ id: eid, source: node.id, target: child.id })
      }
      walk(child)
    })
  }
  roots.forEach((root) => walk(root, true))
  return JSON.stringify({ nodes, edges }, null, 2)
}

function entityToJson(state: EntityState): string {
  const nodes: any[] = []
  const edges: any[] = []
  const fontFamily = state.fontFamily || DEFAULT_FONT_FAMILY
  const fontSize = state.fontSize || DEFAULT_FONT_SIZE
  const emitted = new Set<string>()
  state.entities.forEach((ent) => {
    if (!emitted.has(ent.id)) {
      emitted.add(ent.id)
      nodes.push({ id: ent.id, type: 'rectangle', label: ent.label, fontFamily, fontSize })
    }
    const seenAttr = new Set<string>()
    ent.attributes.forEach((a, i) => {
      // 同一个属性 id 被多个实体引用（共享属性）时节点只输出一次，
      // 否则每应用一次就多一份节点，连续应用会指数膨胀；
      // 但每条 (实体 → 属性) 的连线仍要保留，否则共享属性会只剩一条边。
      if (!seenAttr.has(a.id)) {
        seenAttr.add(a.id)
        if (!emitted.has(a.id)) {
          emitted.add(a.id)
          nodes.push({ id: a.id, type: 'ellipse', label: a.label, rx: 45, ry: 18, fontFamily, fontSize })
        }
      }
      edges.push({ id: `e_${ent.id}_${i}`, source: ent.id, target: a.id })
    })
  })
  // 未被任何实体引用的椭圆：原样输出为无连线节点（可见即可删）
  ;(state.unlinkedAttributes || []).forEach((a) => {
    if (emitted.has(a.id)) return
    emitted.add(a.id)
    nodes.push({ id: a.id, type: 'ellipse', label: a.label, rx: 45, ry: 18, fontFamily, fontSize })
  })
  return JSON.stringify({ nodes, edges }, null, 2)
}

// ====== 新增图表 JSON generators ======

function sequenceToJson(state: SequenceState): string {
  const nodes: any[] = []
  state.participants.forEach((p) => {
    nodes.push({ id: p.id, type: 'participant', label: p.label, participantType: p.participantType })
  })
  // participant 之外的节点（activation 等）原样补回，否则「应用一次就少一批」
  ;(state.extraNodes || []).forEach((n) => nodes.push({ id: n.id, type: n.type, ...(n.data || {}) }))
  const edges: any[] = (state.messages || []).map((m) => ({
    id: m.id,
    source: m.source,
    target: m.target,
    label: m.label,
    data: { messageType: m.messageType || 'sync' },
  }))
  const knownNodes = new Set(nodes.map((n) => n.id))
  const knownEdges = new Set(edges.map((e) => e.id))
  ;(state.extraEdges || []).forEach((e) => {
    if (knownEdges.has(e.id)) return
    knownEdges.add(e.id)
    // 原样补回（只补节点仍在的边，避免产生悬空边）
    if (!knownNodes.has(String(e.source)) || !knownNodes.has(String(e.target))) return
    edges.push({ id: e.id, source: e.source, target: e.target, ...(e.data && { data: e.data }), ...(e.label && { label: e.label }) })
  })
  return JSON.stringify({ nodes, edges }, null, 2)
}

function classToJson(state: ClassState, relations?: { id: string; source: string; target: string; relationType: string; label?: string }[]): string {
  const nodes: any[] = []
  state.classes.forEach((cls) => {
    nodes.push({
      id: cls.id,
      // 接口 / 枚举不能被降级成 class，否则应用一次类型就丢了
      type: cls.type ?? 'class',
      label: cls.label,
      attributes: cls.attributes,
      methods: cls.methods,
      isAbstract: cls.isAbstract,
      stereotype: cls.stereotype,
    })
  })
  const edges: any[] = (relations || []).map((r) => ({
    id: r.id,
    source: r.source,
    target: r.target,
    data: { relationType: r.relationType, label: r.label || '' },
  }))
  return JSON.stringify({ nodes, edges }, null, 2)
}

function activityToJson(state: ActivityState): string {
  const nodes: any[] = []
  state.nodes.forEach((n) => {
    nodes.push({ id: n.id, type: n.nodeType, label: n.label })
  })
  const edges: any[] = (state.edges || []).map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    ...(e.guard && { data: { guard: e.guard } }),
  }))
  return JSON.stringify({ nodes, edges }, null, 2)
}

function erToJson(state: ERState): string {
  const nodes: any[] = []
  const edges: any[] = []
  state.entities.forEach((ent) => {
    nodes.push({ id: ent.id, type: 'erEntity', label: ent.label, row: ent.row, col: ent.col, group: ent.group, x: ent.x, y: ent.y, fields: ent.fields })
  })
  state.relationships.forEach((rel) => {
    const diamondId = `dia_${rel.id}`
    nodes.push({ id: diamondId, type: 'erDiamond', label: rel.label, x: rel.diamondX, y: rel.diamondY })
    if (rel.line && rel.line.length >= 2) {
      // 显式几何：单条完整正交折线
      edges.push({
        id: `e_${rel.id}`,
        source: rel.source,
        target: rel.target,
        data: { sourceCard: rel.sourceCard, targetCard: rel.targetCard, line: rel.line },
      })
    } else {
      // 自动布局：实体->菱形 / 菱形->实体 两段
      edges.push({
        id: `e_${rel.source}_${diamondId}`,
        source: rel.source,
        target: diamondId,
        data: { sourceCard: rel.sourceCard, targetCard: '' },
      })
      edges.push({
        id: `e_${diamondId}_${rel.target}`,
        source: diamondId,
        target: rel.target,
        data: { sourceCard: '', targetCard: rel.targetCard },
      })
    }
  })
  return JSON.stringify({ nodes, edges }, null, 2)
}

function deploymentToJson(state: DeploymentState): string {
  const nodes: any[] = []
  state.nodes.forEach((n) => {
    nodes.push({ id: n.id, type: n.nodeType, label: n.label, technology: n.technology })
  })
  const edges: any[] = (state.edges || []).map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    ...(e.label && { label: e.label }),
  }))
  return JSON.stringify({ nodes, edges }, null, 2)
}

// ====== Mermaid Parser ======

// Name pattern: supports Chinese, Japanese, Korean + ASCII word chars
const NAME_RE = '[\\u4e00-\\u9fff\\u3040-\\u309f\\u30a0-\\u30ff\\uac00-\\ud7af\\w]+'

function parseMermaid(code: string): SequenceState | null {
  const lines = code.split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length === 0) return null

  // Find sequenceDiagram block
  let startIdx = lines.findIndex((l) => l.startsWith('sequenceDiagram'))
  if (startIdx === -1) {
    startIdx = 0
  } else {
    startIdx += 1
  }

  const participants: { id: string; label: string; participantType: 'actor' | 'system' | 'database' }[] = []
  const messages: { id: string; source: string; target: string; label: string; messageType: 'sync' | 'async' | 'return' }[] = []
  const nameToId = new Map<string, string>()

  const getOrCreateParticipant = (name: string): string => {
    if (nameToId.has(name)) return nameToId.get(name)!
    const id = uid()
    nameToId.set(name, id)
    participants.push({ id, label: name, participantType: 'system' })
    return id
  }

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i]

    // Skip block keywords (with optional labels like "alt 验证成功")
    if (/^(loop|alt|opt|par|else|end|break|critical|rect|box)\b/.test(line)) continue

    // participant / actor declaration: "participant 客户端" or "participant Alice as A"
    const partRe = new RegExp(`^(participant|actor)\\s+(${NAME_RE})(?:\\s+as\\s+(.+))?$`)
    const partMatch = line.match(partRe)
    if (partMatch) {
      const name = partMatch[2]
      const alias = partMatch[3]?.trim() || name
      if (!nameToId.has(name)) {
        const id = uid()
        nameToId.set(name, id)
        if (alias !== name) nameToId.set(alias, id)
        participants.push({ id, label: alias, participantType: partMatch[1] === 'actor' ? 'actor' : 'system' })
      }
      continue
    }

    // Note line: skip
    if (/^Note\b/i.test(line)) continue

    // autonumber: skip
    if (/^autonumber\b/i.test(line)) continue

    // activate/deactivate: skip
    if (/^(activate|deactivate)\b/i.test(line)) continue

    // Message line: "客户端->>服务器: 发送登录请求" / "数据库-->>服务器: 返回数据" / "A-)B: 异步"
    // 箭头取最长优先，避免 --> 被 -> 抢先匹配
    const msgRe = new RegExp(`^(${NAME_RE})\\s*(--?>>|-->|->>|->|--\\)|-\\)|--x|-x)\\s*(${NAME_RE})\\s*:\\s*(.+)$`)
    const msgMatch = line.match(msgRe)
    if (msgMatch) {
      const src = msgMatch[1]
      const arrow = msgMatch[2]
      const tgt = msgMatch[3]
      const label = msgMatch[4].trim()

      let messageType: 'sync' | 'async' | 'return' = 'sync'
      if (arrow.includes(')')) messageType = 'async'
      else if (arrow.startsWith('--')) messageType = 'return'

      const srcId = getOrCreateParticipant(src)
      const tgtId = getOrCreateParticipant(tgt)
      messages.push({ id: uid(), source: srcId, target: tgtId, label, messageType })
    }
  }

  if (participants.length === 0) return null
  return { participants, messages }
}

function parseMermaidClass(code: string): {
  classes: { id: string; label: string; attributes: string[]; methods: string[]; isAbstract?: boolean; stereotype?: string; type?: 'class' | 'interface' | 'enum' }[]
  relations: { id: string; source: string; target: string; relationType: string; label?: string }[]
} | null {
  const lines = code.split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length === 0) return null

  let startIdx = lines.findIndex((l) => l.startsWith('classDiagram'))
  if (startIdx === -1) return null
  startIdx += 1

  const classes: { id: string; label: string; attributes: string[]; methods: string[]; isAbstract?: boolean; stereotype?: string; type?: 'class' | 'interface' | 'enum' }[] = []
  const relations: { id: string; source: string; target: string; relationType: string; label?: string }[] = []
  const nameToId = new Map<string, string>()

  const getOrCreateClass = (name: string): string => {
    if (nameToId.has(name)) return nameToId.get(name)!
    const id = uid()
    nameToId.set(name, id)
    classes.push({ id, label: name, attributes: [], methods: [] })
    return id
  }

  const applyStereotype = (clsId: string, kind: string) => {
    const cls = classes.find((c) => c.id === clsId)
    if (!cls) return
    const k = kind.toLowerCase()
    if (k === 'interface') { cls.type = 'interface'; cls.stereotype = 'interface' }
    else if (k === 'abstract') { cls.isAbstract = true; cls.stereotype = 'abstract' }
    else if (k === 'enum' || k === 'enumeration') { cls.type = 'enum'; cls.stereotype = 'enum' }
  }

  let currentClassId: string | null = null

  // 关系模式：第三个元素表示是否需要交换 source/target（保持「source=父/接口」的既有约定）
  const relationPatterns: [RegExp, string, boolean][] = [
    [/\s*<\|--\s*/, 'inheritance', false],
    [/\s*--\|>\s*/, 'inheritance', true],
    [/\s*\*--\s*/, 'composition', false],
    [/\s*--\*\s*/, 'composition', true],
    [/\s*o--\s*/, 'aggregation', false],
    [/\s*--o\s*/, 'aggregation', true],
    [/\s*<\|\.\.\s*/, 'implementation', false],
    [/\s*\.\.\|>\s*/, 'implementation', true],
    [/\s*\.\.>\s*/, 'dependency', false],
    [/\s*<\.\.\s*/, 'dependency', true],
    [/\s*-->\s*/, 'association', false],
    [/\s*<--\s*/, 'association', true],
    [/\s*--\s*/, 'association', false],
  ]

  const nameOnlyRe = new RegExp(`^(${NAME_RE})$`)

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i]

    // "class Animal" / "class Animal {"
    const classStartMatch = line.match(new RegExp(`^class\\s+(${NAME_RE})\\s*(\\{)?\\s*$`))
    if (classStartMatch) {
      const cid = getOrCreateClass(classStartMatch[1])
      // 只有带 { 才进入成员块；`class X` 只是声明
      currentClassId = classStartMatch[2] ? cid : null
      continue
    }

    // 类块结束
    if (line === '}' || line.startsWith('}')) {
      currentClassId = null
      continue
    }

    // <<interface>> X / <<abstract>> X / 块内 <<interface>>
    const stereoLine = line.match(/^<<\s*(interface|abstract|enum|enumeration)\s*>>\s*(.*)$/i)
    if (stereoLine) {
      const target = stereoLine[2].trim()
      let cid: string | null = null
      if (target) {
        const t = target.match(nameOnlyRe)
        cid = t ? getOrCreateClass(t[1]) : getOrCreateClass(target)
      } else {
        cid = currentClassId
      }
      if (cid) applyStereotype(cid, stereoLine[1])
      continue
    }

    // 块内成员
    if (currentClassId) {
      const cls = classes.find((c) => c.id === currentClassId)
      if (cls) {
        // 方法：带括号（方法名允许中文）
        if (/^[+#-]?\s*[^()]+\([^)]*\)\s*.*$/.test(line)) {
          cls.methods.push(line.replace(/^[+#-]\s*/, '').trim())
          continue
        }
        cls.attributes.push(line.replace(/^[+#-]\s*/, '').trim())
        continue
      }
    }

    // 独立声明行（不连线）：直接登记，避免关系行里同名节点重复
    // 这些是 Mermaid 的非类声明关键字，不能当类名登记
    if (/^(direction|note|style|classDef|cssClass|click|linkStyle)\b/i.test(line)) continue
    const bare = line.match(nameOnlyRe)
    if (bare) { getOrCreateClass(bare[1]); continue }

    // "ClassName : member"（成员单独成行，Mermaid 另一种常见写法）
    const memberLine = line.match(new RegExp(`^(${NAME_RE})\\s*:\\s*(.+)$`))
    if (memberLine) {
      const cid = getOrCreateClass(memberLine[1])
      const cls = classes.find((c) => c.id === cid)
      const member = memberLine[2].trim()
      if (cls) {
        if (/\([^)]*\)/.test(member)) cls.methods.push(member.replace(/^[+#-]\s*/, ''))
        else cls.attributes.push(member.replace(/^[+#-]\s*/, ''))
      }
      continue
    }

    // 关系行：两侧都必须是类名（支持中文）
    let foundRelation = false
    for (const [pattern, relType, swap] of relationPatterns) {
      const relRe = new RegExp(`^(${NAME_RE})${pattern.source}(${NAME_RE})(?:\\s*:\\s*(.+))?$`)
      const relMatch = line.match(relRe)
      if (relMatch) {
        const srcName = swap ? relMatch[2] : relMatch[1]
        const tgtName = swap ? relMatch[1] : relMatch[2]
        const relLabel = relMatch[3]?.trim() || undefined
        const srcId = getOrCreateClass(srcName)
        const tgtId = getOrCreateClass(tgtName)
        relations.push({ id: uid(), source: srcId, target: tgtId, relationType: relType, label: relLabel })
        foundRelation = true
        break
      }
    }
    if (foundRelation) continue
  }

  if (classes.length === 0) return null
  return { classes, relations }
}

/**
 * 拆一行 Mermaid 连线：返回各节点片段与每段箭头上的 |guard|
 * 支持一行链式 `A -->|是| B --> C`，且不会把 `|HTTPS| server[服务器]` 当成节点。
 */
function splitMermaidEdgeLine(line: string): { parts: string[]; guards: (string | undefined)[] } | null {
  const re = /\s*(?:--+>|==+>|-\.->|--x|-x)\s*(?:\|([^|]*)\|\s*)?/g
  const parts: string[] = []
  const guards: (string | undefined)[] = []
  let idx = 0
  let found = false
  for (const m of line.matchAll(re)) {
    found = true
    parts.push(line.slice(idx, m.index).trim())
    guards.push(m[1] !== undefined ? m[1].trim() : undefined)
    idx = m.index + m[0].length
  }
  if (!found) return null
  parts.push(line.slice(idx).trim())
  return { parts, guards }
}

function parseMermaidActivity(code: string): ActivityState | null {
  const lines = code.split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length === 0) return null

  let startIdx = lines.findIndex((l) => /^(flowchart|graph)\s+(TD|TB|BT|LR|RL)/i.test(l))
  if (startIdx === -1) return null
  startIdx += 1

  const nodes: ActivityState['nodes'] = []
  const edges: ActivityState['edges'] = []
  const nameToId = new Map<string, string>()

  // Parse a node reference like "Start([开始])", "Action1[用户输入]", "Decision{验证?}"
  const parseNodeRef = (ref: string): string | null => {
    ref = ref.trim()
    if (!ref) return null

    // ([text]) → start/end 药丸节点（后面统一只把首尾标成 start/end）
    let m = ref.match(/^(\w+)\(\[(.+?)\]\)$/)
    if (m) {
      const nodeId = m[1]
      if (!nameToId.has(nodeId)) {
        const id = uid()
        nameToId.set(nodeId, id)
        nodes.push({ id, label: m[2], nodeType: 'start' })
      }
      return nameToId.get(nodeId)!
    }

    // [text] → action node
    m = ref.match(/^(\w+)\[(.+?)\]$/)
    if (m) {
      const nodeId = m[1]
      if (!nameToId.has(nodeId)) {
        const id = uid()
        nameToId.set(nodeId, id)
        nodes.push({ id, label: m[2], nodeType: 'action' })
      }
      return nameToId.get(nodeId)!
    }

    // {text} → decision node
    m = ref.match(/^(\w+)\{(.+?)\}$/)
    if (m) {
      const nodeId = m[1]
      if (!nameToId.has(nodeId)) {
        const id = uid()
        nameToId.set(nodeId, id)
        nodes.push({ id, label: m[2], nodeType: 'decision' })
      }
      return nameToId.get(nodeId)!
    }

    // ((text)) → action（圆形节点在活动图里按动作处理）
    m = ref.match(/^(\w+)\(\((.+?)\)\)$/)
    if (m) {
      const nodeId = m[1]
      if (!nameToId.has(nodeId)) {
        const id = uid()
        nameToId.set(nodeId, id)
        nodes.push({ id, label: m[2], nodeType: 'action' })
      }
      return nameToId.get(nodeId)!
    }

    // Bare ID (no shape) → action node
    m = ref.match(/^(\w+)$/)
    if (m) {
      const nodeId = m[1]
      if (!nameToId.has(nodeId)) {
        const id = uid()
        nameToId.set(nodeId, id)
        nodes.push({ id, label: nodeId, nodeType: 'action' })
      }
      return nameToId.get(nodeId)!
    }

    return null
  }

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i]

    // 非节点关键字行
    if (/^(subgraph|end|direction|style|classDef|class|cssClass|click|linkStyle|%%)\b/i.test(line)) continue

    const split = splitMermaidEdgeLine(line)
    if (!split) {
      // 只声明、不连线的节点也要保留
      parseNodeRef(line)
      continue
    }

    const { parts, guards } = split
    for (let p = 0; p < parts.length - 1; p++) {
      const srcId = parseNodeRef(parts[p])
      const tgtId = parseNodeRef(parts[p + 1])
      if (srcId && tgtId) {
        edges.push({ id: uid(), source: srcId, target: tgtId, guard: guards[p] })
      }
    }
  }

  // Refine start/end：≥1 个 ([...]) 时首个为 start、末个为 end，
  // 中间的药丸节点一律降级为 action（原实现让中间节点都停留在 start，活动图会出现多个开始节点）
  const startEndNodes = nodes.filter((n) => n.nodeType === 'start')
  if (startEndNodes.length >= 1) {
    startEndNodes[0].nodeType = 'start'
    for (let k = 1; k < startEndNodes.length - 1; k++) startEndNodes[k].nodeType = 'action'
    if (startEndNodes.length >= 2) startEndNodes[startEndNodes.length - 1].nodeType = 'end'
  }

  if (nodes.length === 0) return null
  return { nodes, edges }
}

function parseMermaidDeployment(code: string): DeploymentState | null {
  const lines = code.split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length === 0) return null

  let startIdx = lines.findIndex((l) => /^(flowchart|graph)\s+(TD|TB|BT|LR|RL)/i.test(l))
  if (startIdx === -1) return null
  startIdx += 1

  const nodes: DeploymentState['nodes'] = []
  const edges: DeploymentState['edges'] = []
  const nameToId = new Map<string, string>()

  // Parse a node reference like "server[Web服务器]", "db[(MySQL)]"
  const parseNodeRef = (ref: string): string | null => {
    ref = ref.trim()
    if (!ref) return null

    const push = (nodeId: string, nodeType: DeploymentState['nodes'][number]['nodeType'], rawLabel: string) => {
      if (!nameToId.has(nodeId)) {
        const id = uid()
        nameToId.set(nodeId, id)
        let label = rawLabel
        let technology: string | undefined
        const techMatch = label.match(/^(.+?):::(.+)$/)
        if (techMatch) { label = techMatch[1]; technology = techMatch[2] }
        nodes.push({ id, label, nodeType, technology })
      }
      return nameToId.get(nodeId)!
    }

    // [(text)] → database node
    let m = ref.match(/^(\w+)\[\((.+?)\)\]$/)
    if (m) return push(m[1], 'database', m[2])

    // [text] → server node
    m = ref.match(/^(\w+)\[(.+?)\]$/)
    if (m) return push(m[1], 'server', m[2])

    // ((text)) → component（圆形节点）
    m = ref.match(/^(\w+)\(\((.+?)\)\)$/)
    if (m) return push(m[1], 'component', m[2])

    // (text) → node（圆角节点）
    m = ref.match(/^(\w+)\((.+?)\)$/)
    if (m) return push(m[1], 'node', m[2])

    // {text} → artifact（菱形/六边形按制品处理）
    m = ref.match(/^(\w+)\{(.+?)\}$/)
    if (m) return push(m[1], 'artifact', m[2])

    // Bare ID → server node
    m = ref.match(/^(\w+)$/)
    if (m) return push(m[1], 'server', m[1])

    return null
  }

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i]
    if (/^(subgraph|end|direction|style|classDef|class|cssClass|click|linkStyle|%%)\b/i.test(line)) continue

    const split = splitMermaidEdgeLine(line)
    if (!split) {
      // 只声明不连线的节点
      parseNodeRef(line)
      continue
    }
    const { parts, guards } = split
    for (let p = 0; p < parts.length - 1; p++) {
      const srcId = parseNodeRef(parts[p])
      const tgtId = parseNodeRef(parts[p + 1])
      if (srcId && tgtId) {
        // `-->|HTTPS|`：标签剥离后写到 edge.label，节点片段里不会残留 `|HTTPS|`（原先会当成假节点/直接丢边）
        const label = guards[p]
        edges.push({ id: uid(), source: srcId, target: tgtId, ...(label ? { label } : {}) })
      }
    }
  }

  if (nodes.length === 0) return null
  return { nodes, edges }
}

// ====== Main ======

export default function NodeEditor({ type, useCase, tree, entity, er, sequence, classState, activity, deployment, onApply }: Props) {
  const { t } = useTranslation()
  const { sitePv, pagePv, siteUv } = useVercount()
  const titleKeys: Record<DiagramType, string> = {
    usecase: 'editor.usecaseTitle',
    structure: 'editor.structureTitle',
    entity: 'editor.entityTitle',
    er: 'editor.erTitle',
    sequence: 'editor.sequenceTitle',
    class: 'editor.classTitle',
    activity: 'editor.activityTitle',
    deployment: 'editor.deploymentTitle',
  }
  const titleKey = titleKeys[type] || 'editor.usecaseTitle'
  return (
    <div className="w-[420px] shrink-0 border-r border-gray-200 bg-gray-50 flex flex-col h-full">
      <div className="px-4 py-3 border-b border-gray-200 bg-white">
        <h2 className="text-sm font-semibold">{t(titleKey)}</h2>
        <p className="text-xs text-gray-500 mt-0.5">{type === 'er' ? t('editor.sqlImportHint') : t('editor.hint')}</p>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {type === 'usecase' && useCase && <UseCaseEditor state={useCase} onApply={onApply} />}
        {type === 'structure' && tree && <TreeEditor roots={tree.roots} onApply={onApply} />}
        {type === 'entity' && entity && <EntityEditor state={entity} onApply={onApply} />}
        {type === 'er' && <EREditor state={er} onApply={onApply} />}
        {type === 'sequence' && <SequenceEditor state={sequence} onApply={onApply} />}
        {type === 'class' && <ClassEditor state={classState} onApply={onApply} />}
        {type === 'activity' && <ActivityEditor state={activity} onApply={onApply} />}
        {type === 'deployment' && <DeploymentEditor state={deployment} onApply={onApply} />}
      </div>
      <div className="px-3 py-2 border-t border-gray-200 bg-white text-[10px] text-gray-400 text-center">
        <div className="mb-1">{t('stats.sitePv')}: {sitePv} &nbsp; {t('stats.pagePv')}: {pagePv} &nbsp; {t('stats.siteUv')}: {siteUv}</div>
        {t('footer.copyright')} &nbsp;|&nbsp;
        <a href="https://beian.miit.gov.cn" target="_blank" rel="noopener noreferrer" className="hover:text-gray-600">{t('footer.icp')}</a>
      </div>
    </div>
  )
}

// ====== InlineEdit ======

function InlineEdit({
  value, onSave, onDelete, onTab, className = '',
}: {
  value: string; onSave: (val: string) => void; onDelete?: () => void; onTab?: () => void; className?: string
}) {
  const [text, setText] = useState(value)
  const ref = useRef<HTMLInputElement>(null)
  const doneRef = useRef(false)
  useEffect(() => { ref.current?.select() }, [])

  const commit = () => {
    if (doneRef.current) return
    doneRef.current = true
    const v = text.trim()
    if (v) onSave(v)
    else onDelete?.()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); commit() }
    if (e.key === 'Tab') { e.preventDefault(); commit(); onTab?.() }
    if (e.key === 'Escape') { onSave(value) }
  }

  return (
    <input ref={ref} value={text} onChange={(e) => setText(e.target.value)}
      onKeyDown={handleKeyDown} onBlur={commit}
      className={`text-sm border border-black rounded px-1 py-0.5 bg-white focus:outline-none ${className}`} />
  )
}

// ====== Use Case Editor ======

function UseCaseEditor({ state: initial, onApply }: { state: UseCaseState; onApply: (json: string) => void }) {
  const { t } = useTranslation()
  const [state, setState] = useState<UseCaseState>({
    ...initial,
    fontFamily: initial.fontFamily || DEFAULT_FONT_FAMILY,
    fontSize: initial.fontSize || DEFAULT_FONT_SIZE,
  })
  const [editingId, setEditingId] = useState<string | null>(null)

  const addActor = () => {
    setState((s) => ({ ...s, actors: [...s.actors, { id: uid(), label: t('editor.newActor'), useCases: [] }] }))
  }
  const removeActor = (actorId: string) => {
    setState((s) => ({ ...s, actors: s.actors.filter((a) => a.id !== actorId) }))
  }
  const renameActor = (actorId: string, label: string) => {
    setState((s) => ({ ...s, actors: s.actors.map((a) => a.id === actorId ? { ...a, label } : a) }))
  }
  const addUseCase = (actorId: string, id: string, label: string) => {
    setState((s) => ({
      ...s,
      actors: s.actors.map((a) => a.id === actorId ? { ...a, useCases: [...a.useCases, { id, label }] } : a),
    }))
  }
  const moveUseCase = (actorId: string, from: number, to: number) => {
    setState((s) => ({
      ...s,
      actors: s.actors.map((a) => {
        if (a.id !== actorId) return a
        const arr = [...a.useCases]; const [item] = arr.splice(from, 1); arr.splice(to, 0, item)
        return { ...a, useCases: arr }
      }),
    }))
  }
  const removeUseCase = (actorId: string, ucId: string) => {
    setState((s) => ({
      ...s,
      actors: s.actors.map((a) => a.id === actorId ? { ...a, useCases: a.useCases.filter((uc) => uc.id !== ucId) } : a),
    }))
    if (editingId === ucId) setEditingId(null)
  }
  const renameUseCase = (actorId: string, ucId: string, label: string) => {
    setState((s) => ({
      ...s,
      actors: s.actors.map((a) => a.id === actorId ? {
        ...a, useCases: a.useCases.map((uc) => uc.id === ucId ? { ...uc, label } : uc),
      } : a),
    }))
  }

  const [showImport, setShowImport] = useState(false)

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button onClick={addActor} className="flex-1 py-2 text-sm border-2 border-dashed border-gray-300 rounded hover:border-gray-500 hover:bg-gray-100 text-gray-500">
          {t('editor.addActor')}
        </button>
        <button onClick={() => setShowImport(true)} className="px-3 py-2 text-sm border border-gray-300 rounded hover:bg-gray-100 text-gray-500">
          {t('editor.quickImport')}
        </button>
      </div>

      <FontSettings
        fontFamily={state.fontFamily || DEFAULT_FONT_FAMILY}
        fontSize={state.fontSize || DEFAULT_FONT_SIZE}
        onFontFamilyChange={(fontFamily) => setState((s) => ({ ...s, fontFamily }))}
        onFontSizeChange={(fontSize) => setState((s) => ({ ...s, fontSize }))}
      />

      {state.actors.map((actor) => (
        <ActorSection key={actor.id} actor={actor} editingId={editingId} setEditingId={setEditingId}
          onRename={(l) => renameActor(actor.id, l)} onRemove={() => removeActor(actor.id)}
          onAddUc={(id, l) => addUseCase(actor.id, id, l)} onRemoveUc={(id) => removeUseCase(actor.id, id)}
          onRenameUc={(id, l) => renameUseCase(actor.id, id, l)}
          onMoveUc={(from, to) => moveUseCase(actor.id, from, to)} />
      ))}

      <button onClick={() => onApply(useCaseToJson(state))}
        className="w-full py-2 bg-black text-white text-sm font-medium rounded hover:bg-gray-800">
        {t('editor.apply')}
      </button>

      {showImport && (
        <QuickImport title={t('quickImport.usecaseTitle')} example={`管理员 业主管理 维修人员管理 公寓设施管理
业主 个人中心 报修服务 维修评价`}
          onClose={() => setShowImport(false)}
          onImport={(lines) => {
            lines.forEach((words) => {
              if (words.length >= 1) {
                const actorId = uid(); const actorLabel = words[0]
                const useCases = words.slice(1).map((w) => ({ id: uid(), label: w }))
                setState((s) => ({ ...s, actors: [...s.actors, { id: actorId, label: actorLabel, useCases }] }))
              }
            })
            setShowImport(false)
          }} />
      )}
    </div>
  )
}

function ActorSection({ actor, editingId, setEditingId, onRename, onRemove, onAddUc, onRemoveUc, onRenameUc, onMoveUc }: {
  actor: UseCaseState['actors'][number]
  editingId: string | null; setEditingId: (id: string | null) => void
  onRename: (label: string) => void; onRemove: () => void
  onAddUc: (id: string, label: string) => void; onRemoveUc: (id: string) => void
  onRenameUc: (id: string, label: string) => void
  onMoveUc: (from: number, to: number) => void
}) {
  const { t } = useTranslation()
  const [newLabel, setNewLabel] = useState('')
  const [focusedIdx, setFocusedIdx] = useState<number | null>(null)
  const [dragIdx, setDragIdx] = useState<number | null>(null)

  const add = () => {
    const label = newLabel.trim()
    if (!label) return
    onAddUc(uid(), label)
    setNewLabel('')
  }

  return (
    <div className="border border-gray-200 rounded-lg bg-white">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100">
        <span className="text-xs text-gray-400 mr-1">{t('editor.actorLabel')}</span>
        <input className="flex-1 text-sm bg-transparent focus:outline-none font-medium"
          value={actor.label} onChange={(e) => onRename(e.target.value)} />
        <span className="text-xs text-gray-400">({actor.useCases.length})</span>
        <button onClick={onRemove} className="text-gray-400 hover:text-red-500 text-sm ml-1" title={t('editor.deleteRole')}>×</button>
      </div>
      <div className="px-3 py-2">
        <div className="flex gap-1 mb-2">
          <input className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-black"
            placeholder={t('editor.addUseCase')} value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add() }} />
          <button onClick={add} className="px-2 py-1 text-xs bg-black text-white rounded hover:bg-gray-800">{t('editor.add')}</button>
        </div>
        <div className="space-y-1">
          {actor.useCases.map((uc, i) => (
            <div key={uc.id} draggable={editingId !== uc.id} tabIndex={0}
              className={`flex items-center justify-between px-2 py-1 bg-gray-50 border rounded text-sm cursor-default transition-colors ${focusedIdx === i ? 'border-black ring-1 ring-black' : 'border-gray-200'} ${dragIdx === i ? 'opacity-40' : ''}`}
              onDoubleClick={() => setEditingId(uc.id)}
              onDragStart={() => { if (editingId === uc.id) return; setDragIdx(i) }} onDragOver={(e) => e.preventDefault()}
              onDrop={() => { if (dragIdx !== null && dragIdx !== i) onMoveUc(dragIdx, i); setDragIdx(null) }}
              onDragEnd={() => setDragIdx(null)}
              onFocus={() => setFocusedIdx(i)} onBlur={() => setFocusedIdx(null)}
              onKeyDown={(e) => {
                if ((e.key === 'Delete' || e.key === 'Backspace') && editingId !== uc.id) onRemoveUc(uc.id)
                // 编辑框里的 Enter 由 InlineEdit 自己提交并关闭，这里不能再重新打开编辑态
                if (e.key === 'Enter' && editingId !== uc.id) setEditingId(uc.id)
              }}>
              <span className="text-xs text-gray-300 mr-1 cursor-grab select-none">⋮⋮</span>
              {editingId === uc.id ? (
                <InlineEdit value={uc.label} className="flex-1"
                  onSave={(v) => { onRenameUc(uc.id, v); setEditingId(null) }}
                  onDelete={() => { onRemoveUc(uc.id); setEditingId(null) }}
                  onTab={() => {
                    if (i + 1 < actor.useCases.length) { setEditingId(actor.useCases[i + 1].id) }
                    else { const id = uid(); onAddUc(id, ''); setTimeout(() => setEditingId(id), 0) }
                  }} />
              ) : (<span className="flex-1">{uc.label}</span>)}
              <button onClick={() => onRemoveUc(uc.id)} className="text-gray-400 hover:text-red-500 text-sm ml-1 shrink-0" title={t('editor.delete')}>×</button>
            </div>
          ))}
          {actor.useCases.length === 0 && (
            <div className="text-xs text-gray-400 text-center py-2">{t('editor.noUc')}</div>
          )}
        </div>
      </div>
    </div>
  )
}

// ====== Tree Editor ======

// 编辑态键统一带「父级维度」：同一个 id 在两处渲染时（共享子树 / 共享属性），
// 若两行都进入 InlineEdit，mount 时的 ref.select() 会互抢焦点，被抢的一方
// 触发 onBlur → commit → 编辑框立刻关闭。这里用「从根到节点的索引路径」做键，
// 每一处出现都有唯一 key（比单纯的 parentId 更严格，同级重复 id 也不会撞）。

type TreePath = number[]

const treePathKey = (path: TreePath) => `t${path.join('/')}`

/** 取某个父路径下的兄弟节点数组（父路径为空表示根层） */
function nodesAtPath(roots: TreeNode[], parentPath: TreePath): TreeNode[] {
  let list = roots
  for (const idx of parentPath) {
    const node = list[idx]
    if (!node) return []
    list = node.children
  }
  return list
}

function updateNodeAtPath(roots: TreeNode[], path: TreePath, fn: (n: TreeNode) => TreeNode): TreeNode[] {
  if (path.length === 0) return roots
  const [idx, ...rest] = path
  if (!roots[idx]) return roots
  const next = [...roots]
  if (rest.length === 0) {
    next[idx] = fn(next[idx])
  } else {
    next[idx] = { ...next[idx], children: updateNodeAtPath(next[idx].children, rest, fn) }
  }
  return next
}

/** 按路径取出节点（越界返回 null） */
function nodeAtPath(roots: TreeNode[], path: TreePath): TreeNode | null {
  let list = roots
  let node: TreeNode | null = null
  for (const idx of path) {
    node = list[idx] ?? null
    if (!node) return null
    list = node.children
  }
  return node
}

/**
 * 同一个 id 等于同一个节点：它可能在森林里出现多次（共享子节点 / 回边被渲染成浅叶子）。
 * 改名 / 删除必须作用到**所有副本**，否则 `treeToJson` 按 id 去重时第一处胜出，
 * 第二处的修改会被静默丢弃（验证员 X2：改「父2」下的共享子节点改名后不落盘）。
 */
function renameNodesById(roots: TreeNode[], id: string, label: string): TreeNode[] {
  const walk = (n: TreeNode): TreeNode => {
    const next = n.id === id ? { ...n, label } : n
    return { ...next, children: next.children.map(walk) }
  }
  return roots.map(walk)
}

function removeNodesById(roots: TreeNode[], id: string): TreeNode[] {
  return roots
    .filter((n) => n.id !== id)
    .map((n) => ({ ...n, children: removeNodesById(n.children, id) }))
}

function insertNodeAtPath(roots: TreeNode[], parentPath: TreePath, node: TreeNode): TreeNode[] {
  if (parentPath.length === 0) return [...roots, node]
  return updateNodeAtPath(roots, parentPath, (n) => ({ ...n, children: [...n.children, node] }))
}

function TreeEditor({ roots: rootsProp, onApply }: { roots: TreeNode[]; onApply: (json: string) => void }) {
  const { t } = useTranslation()
  const initialRoots = useMemo(() => rootsProp || [], [rootsProp])
  const [roots, setRoots] = useState<TreeNode[]>(initialRoots)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [showImport, setShowImport] = useState(false)
  const [fontFamily, setFontFamily] = useState(initialRoots[0]?.fontFamily || DEFAULT_FONT_FAMILY)
  const [fontSize, setFontSize] = useState(initialRoots[0]?.fontSize || DEFAULT_FONT_SIZE)
  const [spacing, setSpacing] = useState(initialRoots[0]?.spacing || 26)

  // 外部配置变化（应用修改 / 撤销 / 导入）时同步本地状态；
  // 本地编辑不会改 props，因此不会被这条 effect 冲掉。
  useEffect(() => {
    setRoots(initialRoots)
    const styleRoot = initialRoots[0]
    setFontFamily(styleRoot?.fontFamily || DEFAULT_FONT_FAMILY)
    setFontSize(styleRoot?.fontSize || DEFAULT_FONT_SIZE)
    setSpacing(styleRoot?.spacing || 26)
  }, [initialRoots])

  // 字体设置按原「全树生效」语义：写入每一个根，序列化时每个根都带上
  const changeFontFamily = (value: string) => {
    setFontFamily(value)
    setRoots((rs) => rs.map((r) => ({ ...r, fontFamily: value })))
  }
  const changeFontSize = (value: number) => {
    setFontSize(value)
    setRoots((rs) => rs.map((r) => ({ ...r, fontSize: value })))
  }
  const changeSpacing = (value: number) => {
    setSpacing(value)
    setRoots((rs) => rs.map((r) => ({ ...r, spacing: value })))
  }

  const handleAddRoot = () => {
    const id = uid()
    setRoots((prev) => [...prev, { id, label: '', vertical: false, children: [], fontFamily, fontSize, spacing }])
    setEditingKey(treePathKey([roots.length]))
  }

  const handleAddChild = (parentPath: TreePath, label: string) => {
    setRoots((prev) => insertNodeAtPath(prev, parentPath, { id: uid(), label, vertical: false, children: [] }))
  }
  const handleDelete = (path: TreePath) => {
    const target = nodeAtPath(roots, path)
    // 同 id 的副本一起删（与改名一致，避免「删了还留一条边」）
    setRoots((prev) => (target ? removeNodesById(prev, target.id) : prev))
    setEditingKey((k) => (k === treePathKey(path) ? null : k))
  }
  const handleRename = (path: TreePath, label: string) => {
    const target = nodeAtPath(roots, path)
    if (!target) return
    // 改名传播到所有同 id 副本：treeToJson 按 id 去重只写一个节点，只改一处会被丢弃
    setRoots((prev) => renameNodesById(prev, target.id, label))
  }

  const handleTabFrom = (path: TreePath) => {
    const parentPath = path.slice(0, -1)
    const siblings = nodesAtPath(roots, parentPath)
    const idx = path[path.length - 1]
    if (idx + 1 < siblings.length) {
      setEditingKey(treePathKey([...parentPath, idx + 1]))
      return
    }
    const newIndex = siblings.length
    setRoots((prev) => insertNodeAtPath(prev, parentPath, { id: uid(), label: '', vertical: false, children: [] }))
    setEditingKey(treePathKey([...parentPath, newIndex]))
  }

  return (
    <div>
      <button onClick={() => setShowImport(true)}
        className="w-full py-2 text-sm border border-gray-300 rounded hover:bg-gray-100 text-gray-500 mb-3">
        {t('editor.quickImport')}
      </button>

      <FontSettings
        fontFamily={fontFamily}
        fontSize={fontSize}
        onFontFamilyChange={changeFontFamily}
        onFontSizeChange={changeFontSize}
        extra={(
          <label className="flex items-center gap-1">
            {t('editor.spacing')}
            <input type="number" min={16} max={50} value={spacing}
            className="w-12 px-1 py-0.5 border border-gray-300 rounded text-center text-xs"
            onChange={(e) => changeSpacing(Number(e.target.value) || 26)} />
          </label>
        )}
      />

      {roots.map((root, i) => (
        <TreeNodeRow key={`${root.id}:${i}`} node={root} path={[i]} depth={0} editingKey={editingKey}
          onStartEdit={setEditingKey} onAddChild={handleAddChild} onDelete={handleDelete} onRename={handleRename} onTab={handleTabFrom} />
      ))}

      {roots.length === 0 && (
        <div className="text-center py-6 border border-dashed border-gray-300 rounded">
          <div className="text-xs text-gray-400 mb-2">{t('editor.addRoot')}</div>
          <button onClick={handleAddRoot}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-100 text-gray-500">
            + {t('tree.root')}
          </button>
        </div>
      )}

      <button onClick={() => onApply(treeToJson(roots, fontSize, spacing, fontFamily))}
        className="w-full py-2 bg-black text-white text-sm font-medium rounded hover:bg-gray-800 mt-4">
        {t('editor.apply')}
      </button>

      {showImport && (
        <QuickImport title={t('quickImport.structureTitle')} example={`公寓报修管理系统
管理员 业主管理 维修人员管理 公寓设施管理 报修服务管理 维修服务评价 修改密码
业主 个人中心 报修服务 维修评价 修改密码
维修人员 个人资料管理 报修服务订单 维修评价 修改密码`}
          onClose={() => setShowImport(false)}
          onImport={(lines) => {
            if (lines.length < 1) return
            const rootLabel = lines[0][0] || '系统'
            const children: TreeNode[] = []
            lines.slice(1).forEach((words) => {
              if (words.length < 1) return
              children.push({
                id: uid(), label: words[0], vertical: false,
                children: words.slice(1).map((w) => ({ id: uid(), label: w, vertical: true, children: [] })),
              })
            })
            // 快速导入替换整片森林（与原来替换单根的行为一致）
            setRoots([{ id: uid(), label: rootLabel, vertical: false, children, fontFamily, fontSize, spacing }])
            setShowImport(false)
          }} />
      )}
    </div>
  )
}

const typeColors: Record<number, string> = {
  0: 'text-blue-700 bg-blue-50 border-blue-200',
  1: 'text-emerald-700 bg-emerald-50 border-emerald-200',
}

function TreeNodeRow({ node, path, depth, editingKey, onStartEdit, onAddChild, onDelete, onRename, onTab }: {
  node: TreeNode; path: TreePath; depth: number; editingKey: string | null
  onStartEdit: (key: string | null) => void; onAddChild: (path: TreePath, label: string) => void
  onDelete: (path: TreePath) => void; onRename: (path: TreePath, label: string) => void; onTab: (path: TreePath) => void
}) {
  const { t } = useTranslation()
  const [adding, setAdding] = useState(false)
  const [childLabel, setChildLabel] = useState('')
  const selfKey = treePathKey(path)
  const isEditing = editingKey === selfKey
  const wrap = depth === 1
  const tc = typeColors[depth] || 'text-gray-500 bg-gray-100 border-gray-200'
  const lbl = depth === 0 ? t('tree.root') : depth === 1 ? t('tree.module') : t('tree.func')

  const confirmAdd = () => {
    const label = childLabel.trim()
    if (!label) return
    onAddChild(path, label)
    setChildLabel(''); setAdding(false)
  }

  const row = (
    <>
      <div className="flex items-center gap-1.5 py-1 px-2 rounded hover:bg-gray-100/70 group" style={{ marginLeft: depth >= 2 ? 0 : depth * 16 }}
        tabIndex={0}
        onKeyDown={(e) => {
          if (isEditing) return
          if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); onDelete(path) }
          if (e.key === 'Enter') { e.preventDefault(); onStartEdit(selfKey) }
        }}>
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${tc}`}>
          {lbl}
        </span>
        {isEditing ? (
          <InlineEdit value={node.label} className="flex-1"
            onSave={(v) => { onRename(path, v); onStartEdit(null) }}
            onDelete={() => { onDelete(path); onStartEdit(null) }}
            onTab={() => onTab(path)} />
        ) : (
          <span className={`flex-1 text-sm truncate cursor-default ${depth === 0 ? 'font-semibold' : ''}`}
            onDoubleClick={() => onStartEdit(selfKey)}>{node.label}</span>
        )}
        {depth < 2 && <button onClick={() => setAdding(!adding)} className="text-gray-400 hover:text-black text-sm px-1 opacity-0 group-hover:opacity-100 transition-opacity" title={t('tree.addChild')}>+</button>}
        {depth > 0 && (
          <button onClick={() => onDelete(path)} className="text-gray-400 hover:text-red-500 text-sm px-1 opacity-0 group-hover:opacity-100 transition-opacity" title={t('editor.delete')}>×</button>
        )}
      </div>
      {adding && (
        <div className="flex gap-1 my-1" style={{ marginLeft: depth >= 2 ? 16 : (depth + 1) * 16 }}>
          <input autoFocus className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-black"
            placeholder={depth < 1 ? t('editor.addModule') : t('editor.addFunction')} value={childLabel}
            onChange={(e) => setChildLabel(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') confirmAdd(); if (e.key === 'Escape') { setAdding(false); setChildLabel('') } }} />
          <button onClick={confirmAdd} className="px-2 py-1 text-xs bg-black text-white rounded hover:bg-gray-800">{t('editor.confirm')}</button>
          <button onClick={() => { setAdding(false); setChildLabel('') }} className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-100">{t('editor.cancel')}</button>
        </div>
      )}
      {node.children.length > 0 && (
        <div className={wrap ? 'ml-6 mt-1 border border-gray-200 rounded-lg p-2 pb-0.5' : ''}>
          {node.children.map((child, i) => (
            <TreeNodeRow key={`${child.id}:${i}`} node={child} path={[...path, i]} depth={depth + 1} editingKey={editingKey}
              onStartEdit={onStartEdit} onAddChild={onAddChild} onDelete={onDelete} onRename={onRename} onTab={onTab} />
          ))}
        </div>
      )}
    </>
  )

  return row
}

// ====== Entity Editor ======

function EntityEditor({ state: initial, onApply }: { state: EntityState; onApply: (json: string) => void }) {
  const { t } = useTranslation()
  const [state, setState] = useState<EntityState>({
    ...initial,
    fontFamily: initial.fontFamily || DEFAULT_FONT_FAMILY,
    fontSize: initial.fontSize || DEFAULT_FONT_SIZE,
  })
  // 编辑态键带父级维度：同一个属性 id 被两个实体引用时，两行不会互抢焦点
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [showImport, setShowImport] = useState(false)

  // 外部配置变化（应用 / 撤销 / 导入）时同步
  const initialRef = useRef(initial)
  useEffect(() => {
    if (initialRef.current === initial) return
    initialRef.current = initial
    setState({
      ...initial,
      fontFamily: initial.fontFamily || DEFAULT_FONT_FAMILY,
      fontSize: initial.fontSize || DEFAULT_FONT_SIZE,
    })
    setEditingKey(null)
  }, [initial])

  const addEntity = () => {
    setState((s) => ({ ...s, entities: [...s.entities, { id: uid(), label: t('editor.newEntity'), attributes: [] }] }))
  }
  const removeEntity = (entId: string) => {
    setState((s) => ({ ...s, entities: s.entities.filter((e) => e.id !== entId) }))
    setEditingKey(null)
  }
  const renameEntity = (entId: string, label: string) => {
    setState((s) => ({ ...s, entities: s.entities.map((e) => e.id === entId ? { ...e, label } : e) }))
  }
  const addAttr = (entId: string, id: string, label: string) => {
    setState((s) => ({
      ...s,
      entities: s.entities.map((e) => e.id === entId ? { ...e, attributes: [...e.attributes, { id, label }] } : e),
    }))
  }
  const removeAttr = (entId: string, attrId: string) => {
    setState((s) => ({
      ...s,
      entities: s.entities.map((e) => e.id === entId ? { ...e, attributes: e.attributes.filter((a) => a.id !== attrId) } : e),
    }))
    setEditingKey((k) => (k === `${entId}:${attrId}` ? null : k))
  }
  const renameAttr = (entId: string, attrId: string, label: string) => {
    setState((s) => ({
      ...s,
      entities: s.entities.map((e) => e.id === entId ? {
        ...e, attributes: e.attributes.map((a) => a.id === attrId ? { ...a, label } : a),
      } : e),
    }))
  }
  const moveAttr = (entId: string, from: number, to: number) => {
    setState((s) => ({
      ...s,
      entities: s.entities.map((e) => {
        if (e.id !== entId) return e
        const arr = [...e.attributes]; const [item] = arr.splice(from, 1); arr.splice(to, 0, item)
        return { ...e, attributes: arr }
      }),
    }))
  }
  const removeUnlinked = (attrId: string) => {
    setState((s) => ({ ...s, unlinkedAttributes: (s.unlinkedAttributes || []).filter((a) => a.id !== attrId) }))
    setEditingKey((k) => (k === `unlinked:${attrId}` ? null : k))
  }
  const renameUnlinked = (attrId: string, label: string) => {
    setState((s) => ({
      ...s,
      unlinkedAttributes: (s.unlinkedAttributes || []).map((a) => a.id === attrId ? { ...a, label } : a),
    }))
  }

  const unlinked = state.unlinkedAttributes || []

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button onClick={addEntity} className="flex-1 py-2 text-sm border-2 border-dashed border-gray-300 rounded hover:border-gray-500 hover:bg-gray-100 text-gray-500">
          {t('editor.addEntity')}
        </button>
        <button onClick={() => setShowImport(true)} className="px-3 py-2 text-sm border border-gray-300 rounded hover:bg-gray-100 text-gray-500">
          {t('editor.quickImport')}
        </button>
      </div>

      <FontSettings
        fontFamily={state.fontFamily || DEFAULT_FONT_FAMILY}
        fontSize={state.fontSize || DEFAULT_FONT_SIZE}
        onFontFamilyChange={(fontFamily) => setState((s) => ({ ...s, fontFamily }))}
        onFontSizeChange={(fontSize) => setState((s) => ({ ...s, fontSize }))}
      />

      {state.entities.map((ent) => (
        <div key={ent.id} className="border border-gray-200 rounded-lg bg-white">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100">
            <span className="text-xs text-gray-400 mr-1">{t('editor.entityLabel')}</span>
            <input className="flex-1 text-sm bg-transparent focus:outline-none font-medium"
              value={ent.label} onChange={(e) => renameEntity(ent.id, e.target.value)} />
            <span className="text-xs text-gray-400">({ent.attributes.length})</span>
            <button onClick={() => removeEntity(ent.id)} className="text-gray-400 hover:text-red-500 text-sm ml-1" title={t('editor.deleteEntity')}>×</button>
          </div>
          <div className="px-3 py-2">
            <AttrList scope={ent.id} attributes={ent.attributes} editingKey={editingKey} setEditingKey={setEditingKey}
              onAdd={(id, l) => addAttr(ent.id, id, l)} onRemove={(id) => removeAttr(ent.id, id)}
              onRename={(id, l) => renameAttr(ent.id, id, l)} onMove={(f, t) => moveAttr(ent.id, f, t)} />
          </div>
        </div>
      ))}

      {unlinked.length > 0 && (
        <div className="border border-dashed border-amber-300 rounded-lg bg-amber-50/40">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-amber-200">
            <span className="text-xs font-medium text-amber-700">{t('editor.unlinkedAttributes')}</span>
            <span className="text-xs text-amber-600">({unlinked.length})</span>
          </div>
          <div className="px-3 py-2 space-y-1">
            {unlinked.map((a) => (
              <div key={a.id} tabIndex={0}
                className="flex items-center justify-between px-2 py-1 bg-white border border-gray-200 rounded text-sm"
                onDoubleClick={() => setEditingKey(`unlinked:${a.id}`)}
                onKeyDown={(e) => {
                  if (editingKey !== `unlinked:${a.id}` && (e.key === 'Delete' || e.key === 'Backspace')) removeUnlinked(a.id)
                  if (editingKey !== `unlinked:${a.id}` && e.key === 'Enter') setEditingKey(`unlinked:${a.id}`)
                }}>
                {editingKey === `unlinked:${a.id}` ? (
                  <InlineEdit value={a.label} className="flex-1"
                    onSave={(v) => { renameUnlinked(a.id, v); setEditingKey(null) }}
                    onDelete={() => { removeUnlinked(a.id); setEditingKey(null) }} />
                ) : (
                  <span className="flex-1">{a.label}</span>
                )}
                <button onClick={() => removeUnlinked(a.id)} className="text-gray-400 hover:text-red-500 text-sm ml-1 shrink-0" title={t('editor.delete')}>×</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <button onClick={() => onApply(entityToJson(state))}
        className="w-full py-2 bg-black text-white text-sm font-medium rounded hover:bg-gray-800">
        {t('editor.apply')}
      </button>

      {showImport && (
        <QuickImport title={t('quickImport.entityTitle')} example={`用户 用户ID 用户名 密码 手机号 角色
维修人员 员工ID 姓名 技能类型 联系电话 当前状态`}
          onClose={() => setShowImport(false)}
          onImport={(lines) => {
            lines.forEach((words) => {
              if (words.length >= 1) {
                const entId = uid(); const entLabel = words[0]
                const attrs = words.slice(1).map((w) => ({ id: uid(), label: w }))
                setState((s) => ({ ...s, entities: [...s.entities, { id: entId, label: entLabel, attributes: attrs }] }))
              }
            })
            setShowImport(false)
          }} />
      )}
    </div>
  )
}

// ====== Quick Import ======

function QuickImport({ title, example, onClose, onImport }: {
  title: string; example: string; onClose: () => void
  onImport: (lines: string[][]) => void
}) {
  const { t } = useTranslation()
  const [text, setText] = useState('')

  const handleImport = () => {
    const lines = text.trim().split('\n').filter(Boolean).map((line) => line.trim().split(/\s+/))
    if (lines.length > 0) onImport(lines)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl p-5 w-[420px]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-black text-lg leading-none">×</button>
        </div>
        <p className="text-xs text-gray-500 mb-2">{t('quickImport.hint')}</p>
        <textarea className="w-full h-28 text-xs font-mono border border-gray-300 rounded p-2 mb-2 focus:outline-none focus:ring-1 focus:ring-black"
          placeholder={`示例:\n${example}`} value={text}
          onChange={(e) => setText(e.target.value)} />
        <div className="text-[10px] text-gray-400 mb-3 bg-gray-50 rounded p-2">
          {t('quickImport.formatExample')}{example.split('\n').map((line, i) => <span key={i}>{i > 0 && <br />}{line}</span>)}
        </div>
        <div className="flex gap-2">
          <button onClick={handleImport} className="flex-1 py-2 bg-black text-white text-sm font-medium rounded hover:bg-gray-800">{t('quickImport.import')}</button>
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-100">{t('quickImport.cancel')}</button>
        </div>
      </div>
    </div>
  )
}

function AttrList({ scope, attributes, editingKey, setEditingKey, onAdd, onRemove, onRename, onMove }: {
  scope: string
  attributes: { id: string; label: string }[]
  editingKey: string | null; setEditingKey: (key: string | null) => void
  onAdd: (id: string, label: string) => void; onRemove: (id: string) => void
  onRename: (id: string, label: string) => void; onMove: (from: number, to: number) => void
}) {
  const { t } = useTranslation()
  const [newLabel, setNewLabel] = useState('')
  const [focusedIdx, setFocusedIdx] = useState<number | null>(null)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  // 父级（实体）维度：共享属性 id 出现在两个实体下时，两行的编辑态互不影响
  const keyOf = (id: string) => `${scope}:${id}`

  const add = () => {
    const label = newLabel.trim()
    if (!label) return
    onAdd(uid(), label)
    setNewLabel('')
  }

  return (
    <div>
      <div className="flex gap-1 mb-2">
        <input className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-black"
          placeholder={t('editor.addAttribute')} value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add() }} />
        <button onClick={add} className="px-2 py-1 text-xs bg-black text-white rounded hover:bg-gray-800">{t('editor.add')}</button>
      </div>
      <div className="space-y-1">
        {attributes.map((a, i) => (
          <div key={`${a.id}:${i}`} draggable={editingKey !== keyOf(a.id)} tabIndex={0}
            className={`flex items-center justify-between px-2 py-1 bg-gray-50 border rounded text-sm cursor-default transition-colors ${focusedIdx === i ? 'border-black ring-1 ring-black' : 'border-gray-200'} ${dragIdx === i ? 'opacity-40' : ''}`}
            onDoubleClick={() => setEditingKey(keyOf(a.id))}
            onFocus={() => setFocusedIdx(i)} onBlur={() => setFocusedIdx(null)}
            onKeyDown={(e) => {
              if ((e.key === 'Delete' || e.key === 'Backspace') && editingKey !== keyOf(a.id)) onRemove(a.id)
              // 同上：编辑框里的 Enter 不应重新打开编辑态
              if (e.key === 'Enter' && editingKey !== keyOf(a.id)) setEditingKey(keyOf(a.id))
            }}
            onDragStart={() => { if (editingKey === keyOf(a.id)) return; setDragIdx(i) }} onDragOver={(e) => e.preventDefault()}
            onDrop={() => { if (dragIdx !== null && dragIdx !== i) onMove(dragIdx, i); setDragIdx(null) }}
            onDragEnd={() => setDragIdx(null)}>
            <span className="text-xs text-gray-300 mr-1 cursor-grab select-none">⋮⋮</span>
            {editingKey === keyOf(a.id) ? (
              <InlineEdit value={a.label} className="flex-1"
                onSave={(v) => { onRename(a.id, v); setEditingKey(null) }}
                onDelete={() => { onRemove(a.id); setEditingKey(null) }}
                onTab={() => {
                  if (i + 1 < attributes.length) { setEditingKey(keyOf(attributes[i + 1].id)) }
                  else { const id = uid(); onAdd(id, ''); setEditingKey(keyOf(id)) }
                }} />
            ) : (<span className="flex-1">{a.label}</span>)}
            <button onClick={() => onRemove(a.id)} className="text-gray-400 hover:text-red-500 text-sm ml-1 shrink-0" title={t('editor.delete')}>×</button>
          </div>
        ))}
        {attributes.length === 0 && (
          <div className="text-xs text-gray-400 text-center py-2">{t('editor.noAttr')}</div>
        )}
      </div>
    </div>
  )
}

// ====== Sequence Editor ======

function SequenceEditor({ state: initial, onApply }: { state?: SequenceState; onApply: (json: string) => void }) {
  const { t } = useTranslation()
  const [participants, setParticipants] = useState<{ id: string; label: string; participantType: 'actor' | 'system' | 'database' }[]>(initial?.participants || [])
  const [messages, setMessages] = useState<{ id: string; source: string; target: string; label: string; messageType: 'sync' | 'async' | 'return' }[]>(initial?.messages || [])
  // participant 之外的节点/边（activation 等）原样保留，应用时补回
  const [extraNodes, setExtraNodes] = useState<{ id: string; type: string; data: Record<string, unknown> }[]>(initial?.extraNodes || [])
  const [extraEdges, setExtraEdges] = useState<Edge[]>(initial?.extraEdges || [])
  // 编辑态键带父级维度（p:/m: 前缀 + 序号），参与者与消息、以及重复 id 都不会互抢焦点
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [msgSource, setMsgSource] = useState('')
  const [msgTarget, setMsgTarget] = useState('')
  const [msgLabel, setMsgLabel] = useState('')
  const [dragMsgIdx, setDragMsgIdx] = useState<number | null>(null)
  const [dragPartIdx, setDragPartIdx] = useState<number | null>(null)
  const [showMermaid, setShowMermaid] = useState(false)
  const [mermaidText, setMermaidText] = useState('')

  const initialRef = useRef(initial)
  useEffect(() => {
    if (initialRef.current === initial) return
    initialRef.current = initial
    setParticipants(initial?.participants || [])
    setMessages(initial?.messages || [])
    setExtraNodes(initial?.extraNodes || [])
    setExtraEdges(initial?.extraEdges || [])
    setEditingKey(null)
  }, [initial])

  const addParticipant = () => {
    const id = uid()
    setParticipants((p) => [...p, { id, label: t('editor.newParticipant'), participantType: 'system' }])
    return id
  }

  const removeParticipant = (id: string) => {
    setParticipants((p) => p.filter((item) => item.id !== id))
    setMessages((m) => m.filter((msg) => msg.source !== id && msg.target !== id))
    // 与被删参与者相连的额外边也要去掉，避免悬空边
    setExtraEdges((e) => e.filter((edge) => edge.source !== id && edge.target !== id))
    setEditingKey(null)
  }

  const renameParticipant = (id: string, label: string) => {
    setParticipants((p) => p.map((item) => item.id === id ? { ...item, label } : item))
  }

  const setType = (id: string, participantType: 'actor' | 'system' | 'database') => {
    setParticipants((p) => p.map((item) => item.id === id ? { ...item, participantType } : item))
  }

  const addMessage = () => {
    if (!msgSource || !msgTarget || !msgLabel.trim()) return
    setMessages((m) => [...m, { id: uid(), source: msgSource, target: msgTarget, label: msgLabel.trim(), messageType: 'sync' }])
    setMsgLabel('')
  }

  const removeMessage = (id: string) => {
    setMessages((m) => m.filter((msg) => msg.id !== id))
  }

  const renameMessage = (id: string, label: string) => {
    setMessages((m) => m.map((msg) => msg.id === id ? { ...msg, label } : msg))
  }

  const setMessageType = (id: string, messageType: 'sync' | 'async' | 'return') => {
    setMessages((m) => m.map((msg) => msg.id === id ? { ...msg, messageType } : msg))
  }

  const moveMessage = (from: number, to: number) => {
    setMessages((m) => {
      const arr = [...m]; const [item] = arr.splice(from, 1); arr.splice(to, 0, item); return arr
    })
  }

  const moveParticipant = (from: number, to: number) => {
    setParticipants((p) => {
      const arr = [...p]; const [item] = arr.splice(from, 1); arr.splice(to, 0, item); return arr
    })
  }

  const handleApply = () => {
    onApply(sequenceToJson({ participants, messages, extraNodes, extraEdges }))
  }

  const handleMermaidImport = () => {
    const result = parseMermaid(mermaidText)
    if (result) {
      setParticipants(result.participants)
      setMessages(result.messages)
      setExtraNodes([])
      setExtraEdges([])
      setShowMermaid(false)
      setMermaidText('')
    } else {
      alert(t('editor.mermaidError'))
    }
  }

  const getLabel = (id: string) => participants.find((p) => p.id === id)?.label || id

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button onClick={addParticipant}
          className="flex-1 py-2 text-sm border-2 border-dashed border-gray-300 rounded hover:border-gray-500 hover:bg-gray-100 text-gray-500">
          {t('editor.addParticipant')}
        </button>
        <button onClick={() => setShowMermaid(true)}
          className="px-3 py-2 text-sm border border-gray-300 rounded hover:bg-gray-100 text-gray-500">
          {t('editor.importMermaid')}
        </button>
      </div>

      <div className="space-y-2">
        {participants.map((p, i) => (
          <div key={`${p.id}:${i}`} draggable={editingKey !== `p:${i}:${p.id}`} tabIndex={0}
            className={`bg-white border border-gray-200 rounded p-2 transition-opacity ${dragPartIdx === i ? 'opacity-40' : ''}`}
            onDragStart={() => { if (editingKey === `p:${i}:${p.id}`) return; setDragPartIdx(i) }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => { if (dragPartIdx !== null && dragPartIdx !== i) moveParticipant(dragPartIdx, i); setDragPartIdx(null) }}
            onDragEnd={() => setDragPartIdx(null)}
            onKeyDown={(e) => {
              if (isEditableTarget(e)) return
              if ((e.key === 'Delete' || e.key === 'Backspace') && editingKey !== `p:${i}:${p.id}`) {
                e.preventDefault()
                removeParticipant(p.id)
              }
            }}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-400 cursor-grab select-none">⋮⋮ {t('editor.participantLabel')}</span>
              <button onClick={() => removeParticipant(p.id)} className="text-gray-400 hover:text-red-500 text-sm" title={t('editor.deleteParticipant')}>×</button>
            </div>
            {editingKey === `p:${i}:${p.id}` ? (
              <InlineEdit value={p.label}
                onSave={(v) => { renameParticipant(p.id, v); setEditingKey(null) }}
                onDelete={() => { removeParticipant(p.id); setEditingKey(null) }}
                onTab={() => {
                  if (i + 1 < participants.length) setEditingKey(`p:${i + 1}:${participants[i + 1].id}`)
                  else { const newId = addParticipant(); setEditingKey(`p:${participants.length}:${newId}`) }
                }} />
            ) : (
              <div className="text-sm cursor-pointer" onDoubleClick={() => setEditingKey(`p:${i}:${p.id}`)}>{p.label}</div>
            )}
            <div className="flex gap-1 mt-2">
              {(['actor', 'system', 'database'] as const).map((type) => (
                <button key={type} onClick={() => setType(p.id, type)}
                  className={`px-2 py-0.5 text-xs rounded ${p.participantType === type ? 'bg-black text-white' : 'bg-gray-100 hover:bg-gray-200'}`}>
                  {type}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Messages section：不再要求 participants >= 2，否则自调用消息看不见也删不掉 */}
      <div className="border-t border-gray-200 pt-3">
          <div className="text-xs font-medium text-gray-500 mb-2">{t('editor.messageSection')}</div>

          {/* Add message form */}
          <div className="flex gap-1 mb-2">
            <select value={msgSource} onChange={(e) => setMsgSource(e.target.value)}
              className="flex-1 px-1 py-0.5 text-xs border border-gray-300 rounded bg-white">
              <option value="">{t('editor.msgFrom')}</option>
              {participants.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
            <span className="text-xs text-gray-400 self-center">→</span>
            <select value={msgTarget} onChange={(e) => setMsgTarget(e.target.value)}
              className="flex-1 px-1 py-0.5 text-xs border border-gray-300 rounded bg-white">
              <option value="">{t('editor.msgTo')}</option>
              {participants.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
          <div className="flex gap-1 mb-2">
            <input className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-black"
              placeholder={t('editor.msgPlaceholder')} value={msgLabel}
              onChange={(e) => setMsgLabel(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addMessage() }} />
            <button onClick={addMessage} className="px-2 py-1 text-xs bg-black text-white rounded hover:bg-gray-800">{t('editor.add')}</button>
          </div>

          {/* Message list */}
          <div className="space-y-1">
            {messages.map((msg, i) => (
              <div key={`${msg.id}:${i}`} draggable={editingKey !== `m:${i}:${msg.id}`} tabIndex={0}
                className={`flex items-center gap-1 px-2 py-1 bg-gray-50 border border-gray-200 rounded text-xs ${dragMsgIdx === i ? 'opacity-40' : ''}`}
                onDragStart={() => { if (editingKey === `m:${i}:${msg.id}`) return; setDragMsgIdx(i) }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => { if (dragMsgIdx !== null && dragMsgIdx !== i) moveMessage(dragMsgIdx, i); setDragMsgIdx(null) }}
                onDragEnd={() => setDragMsgIdx(null)}
                onKeyDown={(e) => {
                  if (isEditableTarget(e)) return
                  if ((e.key === 'Delete' || e.key === 'Backspace') && editingKey !== `m:${i}:${msg.id}`) {
                    e.preventDefault()
                    removeMessage(msg.id)
                  }
                }}>
                <span className="text-xs text-gray-300 mr-1 cursor-grab select-none">⋮⋮</span>
                <span className="text-gray-500 truncate">{getLabel(msg.source)}</span>
                <span className="text-gray-400">→</span>
                <span className="text-gray-500 truncate">{getLabel(msg.target)}</span>
                {editingKey === `m:${i}:${msg.id}` ? (
                  <InlineEdit value={msg.label} className="flex-1 min-w-0"
                    onSave={(v) => { renameMessage(msg.id, v); setEditingKey(null) }}
                    onDelete={() => { removeMessage(msg.id); setEditingKey(null) }}
                    onTab={() => {
                      if (i + 1 < messages.length) setEditingKey(`m:${i + 1}:${messages[i + 1].id}`)
                      else { const id = uid(); setMessages((m) => [...m, { id, source: msg.source, target: msg.target, label: '', messageType: 'sync' }]); setEditingKey(`m:${messages.length}:${id}`) }
                    }} />
                ) : (
                  <span className="flex-1 min-w-0 truncate cursor-pointer" onDoubleClick={() => setEditingKey(`m:${i}:${msg.id}`)}>: {msg.label}</span>
                )}
                <div className="flex gap-0.5 shrink-0">
                  {(['sync', 'async', 'return'] as const).map((type) => (
                    <button key={type} onClick={() => setMessageType(msg.id, type)}
                      className={`px-1 text-[10px] rounded ${msg.messageType === type ? 'bg-black text-white' : 'bg-gray-100 hover:bg-gray-200'}`}>
                      {type === 'sync' ? 'S' : type === 'async' ? 'A' : 'R'}
                    </button>
                  ))}
                </div>
                <button onClick={() => removeMessage(msg.id)} className="text-gray-400 hover:text-red-500 text-xs shrink-0">×</button>
              </div>
            ))}
            {messages.length === 0 && (
              <div className="text-xs text-gray-400 text-center py-1">{t('editor.noMessages')}</div>
            )}
          </div>
        </div>

      <button onClick={handleApply}
        className="w-full py-2 bg-black text-white text-sm font-medium rounded hover:bg-gray-800">
        {t('editor.apply')}
      </button>

      {/* Mermaid Import Modal */}
      {showMermaid && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setShowMermaid(false)}>
          <div className="bg-white rounded-lg shadow-xl p-5 w-[460px]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">{t('editor.mermaidTitle')}</h3>
              <button onClick={() => setShowMermaid(false)} className="text-gray-400 hover:text-black text-lg leading-none">×</button>
            </div>
            <pre className="text-[10px] text-gray-400 mb-2 whitespace-pre-wrap">{t('editor.mermaidHint')}</pre>
            <textarea
              className="w-full h-40 text-xs font-mono border border-gray-300 rounded p-2 mb-3 focus:outline-none focus:ring-1 focus:ring-black"
              placeholder={t('editor.mermaidPlaceholder')}
              value={mermaidText}
              onChange={(e) => setMermaidText(e.target.value)}
            />
            <div className="flex gap-2">
              <button onClick={handleMermaidImport}
                className="flex-1 py-2 bg-black text-white text-sm font-medium rounded hover:bg-gray-800">
                {t('quickImport.import')}
              </button>
              <button onClick={() => { setShowMermaid(false); setMermaidText('') }}
                className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-100">
                {t('quickImport.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ====== Class Editor ======

function ClassEditor({ state: initial, onApply }: { state?: ClassState; onApply: (json: string) => void }) {
  const { t } = useTranslation()
  type ClassItem = ClassState['classes'][number]
  const [classes, setClasses] = useState<ClassItem[]>(initial?.classes || [])
  // 编辑态键带父级维度：重复 id 时两行的 InlineEdit 不会互抢焦点
  const [editingKey, setEditingKey] = useState<string | null>(null)
  // 草稿按 classId 分开存，避免「A 类里输入的属性写进 B 类」
  const [newAttr, setNewAttr] = useState<Record<string, string>>({})
  const [newMethod, setNewMethod] = useState<Record<string, string>>({})
  const [showMermaid, setShowMermaid] = useState(false)
  const [mermaidText, setMermaidText] = useState('')
  const [dragClassIdx, setDragClassIdx] = useState<number | null>(null)
  const [relations, setRelations] = useState<{ id: string; source: string; target: string; relationType: string; label?: string }[]>(initial?.relations || [])

  // 外部配置变化（应用 / 撤销 / 导入）时同步
  const initialRef = useRef(initial)
  useEffect(() => {
    if (initialRef.current === initial) return
    initialRef.current = initial
    setClasses(initial?.classes || [])
    setRelations(initial?.relations || [])
    setEditingKey(null)
    setNewAttr({})
    setNewMethod({})
  }, [initial])

  // AI states
  const [classAiText, setClassAiText] = useState('')
  const [isParsingClass, setIsParsingClass] = useState(false)
  const [classParseError, setClassParseError] = useState('')
  const [classParsePreview, setClassParsePreview] = useState<{ classes: number; relations: number; source: string } | null>(null)

  const handleParseClassAi = async () => {
    setClassParseError('')
    setClassParsePreview(null)
    setIsParsingClass(true)

    try {
      const { getApiKey } = await import('./SettingsModal')
      const apiKey = getApiKey()

      if (apiKey) {
        const { generateClassFromAI } = await import('../../utils/aiService')
        const aiState = await generateClassFromAI(classAiText, apiKey)
        setClasses(aiState.classes)
        setRelations(aiState.relations)
        setClassParsePreview({ classes: aiState.classes.length, relations: aiState.relations.length, source: 'AI' })
      } else {
        // 之前这里复用 ER 的「将使用本地基础解析」文案，但类图并没有本地解析器，
        // 点了按钮配置节点数不变 —— 文案与行为不符，改为明确提示去配置 Key。
        setClassParseError(t('editor.classAiNoKey'))
      }
    } catch (err: any) {
      setClassParseError(err.message || 'Parsing failed')
    } finally {
      setIsParsingClass(false)
    }
  }

  const addClass = () => {
    setClasses((c) => [...c, { id: uid(), label: t('editor.newClass'), attributes: [], methods: [], type: 'class' }])
  }

  const removeClass = (id: string) => {
    setClasses((c) => c.filter((item) => item.id !== id))
    // 同时删掉挂在这个类上的关系，否则会留下 source/target 指向不存在节点的悬空边
    setRelations((r) => r.filter((rel) => rel.source !== id && rel.target !== id))
    setEditingKey(null)
  }

  const setClassType = (id: string, type: 'class' | 'interface' | 'enum') => {
    setClasses((c) => c.map((item) => item.id === id
      ? { ...item, type, stereotype: type === 'class' ? undefined : type }
      : item))
  }

  const renameClass = (id: string, label: string) => {
    setClasses((c) => c.map((item) => item.id === id ? { ...item, label } : item))
  }

  const addAttribute = (classId: string) => {
    const label = (newAttr[classId] || '').trim()
    if (!label) return
    setClasses((c) => c.map((item) => item.id === classId ? { ...item, attributes: [...item.attributes, label] } : item))
    setNewAttr((m) => ({ ...m, [classId]: '' }))
  }

  const removeAttribute = (classId: string, index: number) => {
    setClasses((c) => c.map((item) => item.id === classId ? { ...item, attributes: item.attributes.filter((_, i) => i !== index) } : item))
  }

  const addMethod = (classId: string) => {
    const label = (newMethod[classId] || '').trim()
    if (!label) return
    setClasses((c) => c.map((item) => item.id === classId ? { ...item, methods: [...item.methods, label] } : item))
    setNewMethod((m) => ({ ...m, [classId]: '' }))
  }

  const removeMethod = (classId: string, index: number) => {
    setClasses((c) => c.map((item) => item.id === classId ? { ...item, methods: item.methods.filter((_, i) => i !== index) } : item))
  }

  const moveClass = (from: number, to: number) => {
    setClasses((c) => {
      const arr = [...c]
      const [item] = arr.splice(from, 1)
      arr.splice(to, 0, item)
      return arr
    })
  }

  const handleApply = () => {
    onApply(classToJson({ classes }, relations))
  }

  const handleMermaidImport = () => {
    const result = parseMermaidClass(mermaidText)
    if (result) {
      setClasses(result.classes)
      setRelations(result.relations)
      setShowMermaid(false)
      setMermaidText('')
    } else {
      alert(t('editor.mermaidError'))
    }
  }

  return (
    <div className="space-y-4">
      {/* AI Import Section */}
      <div className="bg-gray-50 border border-gray-200 rounded p-3">
        <div className="text-xs font-semibold mb-2">{t('editor.classAiGenerate')} (DeepSeek)</div>
        <textarea
          className="w-full h-24 text-sm border border-gray-300 rounded p-2 focus:outline-none focus:ring-1 focus:ring-black font-mono resize-y mb-2"
          placeholder={t('editor.classAiInput')}
          value={classAiText}
          onChange={(e) => setClassAiText(e.target.value)}
        />
        {classParseError && (
          <div className="text-xs text-red-500 mb-2 bg-red-50 rounded p-2">{classParseError}</div>
        )}
        {classParsePreview && (
          <div className="text-xs text-green-600 mb-2 bg-green-50 rounded p-2">
            ✓ {t('editor.classAiPreview')}: {classParsePreview.classes} Classes, {classParsePreview.relations} Relations
          </div>
        )}
        <button
          onClick={handleParseClassAi}
          disabled={!classAiText.trim() || isParsingClass}
          className="w-full py-2 bg-black text-white text-sm font-medium rounded hover:bg-gray-800 disabled:opacity-30"
        >
          {isParsingClass ? t('editor.classAiParsing') : t('editor.classAiGenerate')}
        </button>
      </div>

      <div className="flex gap-2">
        <button onClick={addClass}
          className="flex-1 py-2 text-sm border-2 border-dashed border-gray-300 rounded hover:border-gray-500 hover:bg-gray-100 text-gray-500">
          {t('editor.addClass')}
        </button>
        <button onClick={() => setShowMermaid(true)}
          className="px-3 py-2 text-sm border border-gray-300 rounded hover:bg-gray-100 text-gray-500">
          {t('editor.importMermaid')}
        </button>
      </div>

      <div className="space-y-2">
        {classes.map((cls, ci) => (
          <div key={`${cls.id}:${ci}`} draggable={editingKey !== `class:${ci}:${cls.id}`} tabIndex={0}
            className={`bg-white border border-gray-200 rounded p-2 transition-opacity ${dragClassIdx === ci ? 'opacity-40' : ''}`}
            onDragStart={() => { if (editingKey === `class:${ci}:${cls.id}`) return; setDragClassIdx(ci) }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => { if (dragClassIdx !== null && dragClassIdx !== ci) moveClass(dragClassIdx, ci); setDragClassIdx(null) }}
            onDragEnd={() => setDragClassIdx(null)}
            onKeyDown={(e) => {
              if (isEditableTarget(e)) return
              if ((e.key === 'Delete' || e.key === 'Backspace') && editingKey !== `class:${ci}:${cls.id}`) {
                e.preventDefault()
                removeClass(cls.id)
              }
            }}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-400 cursor-grab select-none">⋮⋮ {t('editor.classLabel')}</span>
              <button onClick={() => removeClass(cls.id)} className="text-gray-400 hover:text-red-500 text-sm" title={t('editor.deleteClass')}>×</button>
            </div>
            {/* 类型切换：类 / 接口 / 枚举 */}
            <div className="flex gap-1 mb-1">
              {(['class', 'interface', 'enum'] as const).map((tp) => (
                <button key={tp} onClick={() => setClassType(cls.id, tp)}
                  className={`px-2 py-0.5 text-[10px] rounded ${(cls.type ?? 'class') === tp ? 'bg-black text-white' : 'bg-gray-100 hover:bg-gray-200'}`}>
                  {t(`editor.classType${tp.charAt(0).toUpperCase()}${tp.slice(1)}`)}
                </button>
              ))}
            </div>
            {editingKey === `class:${ci}:${cls.id}` ? (
              <InlineEdit value={cls.label}
                onSave={(v) => { renameClass(cls.id, v); setEditingKey(null) }}
                onDelete={() => { removeClass(cls.id) }}
                onTab={() => {
                  if (ci + 1 < classes.length) setEditingKey(`class:${ci + 1}:${classes[ci + 1].id}`)
                  else { const id = uid(); setClasses((c) => [...c, { id, label: '', attributes: [], methods: [], type: 'class' }]); setEditingKey(`class:${classes.length}:${id}`) }
                }} />
            ) : (
              <div className="text-sm font-medium cursor-pointer" onDoubleClick={() => setEditingKey(`class:${ci}:${cls.id}`)}>{cls.label}</div>
            )}

            {/* 属性 */}
            <div className="mt-2">
              <div className="text-xs text-gray-400 mb-1">{t('editor.attribute')}</div>
              {cls.attributes.map((attr, i) => (
                <div key={i} className="flex items-center text-xs py-0.5">
                  <span className="flex-1">{attr}</span>
                  <button onClick={() => removeAttribute(cls.id, i)} className="text-gray-400 hover:text-red-500">×</button>
                </div>
              ))}
              <div className="flex gap-1 mt-1">
                <input className="flex-1 px-1 py-0.5 text-xs border border-gray-300 rounded"
                  placeholder={t('editor.addAttribute')} value={newAttr[cls.id] || ''}
                  onChange={(e) => setNewAttr((m) => ({ ...m, [cls.id]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === 'Enter') addAttribute(cls.id) }} />
                <button onClick={() => addAttribute(cls.id)} className="px-1 py-0.5 text-xs bg-black text-white rounded">{t('editor.add')}</button>
              </div>
            </div>

            {/* 方法 */}
            <div className="mt-2">
              <div className="text-xs text-gray-400 mb-1">{t('editor.method')}</div>
              {cls.methods.map((method, i) => (
                <div key={i} className="flex items-center text-xs py-0.5">
                  <span className="flex-1">{method}</span>
                  <button onClick={() => removeMethod(cls.id, i)} className="text-gray-400 hover:text-red-500">×</button>
                </div>
              ))}
              <div className="flex gap-1 mt-1">
                <input className="flex-1 px-1 py-0.5 text-xs border border-gray-300 rounded"
                  placeholder={t('editor.addMethod')} value={newMethod[cls.id] || ''}
                  onChange={(e) => setNewMethod((m) => ({ ...m, [cls.id]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === 'Enter') addMethod(cls.id) }} />
                <button onClick={() => addMethod(cls.id)} className="px-1 py-0.5 text-xs bg-black text-white rounded">{t('editor.add')}</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <button onClick={handleApply}
        className="w-full py-2 bg-black text-white text-sm font-medium rounded hover:bg-gray-800">
        {t('editor.apply')}
      </button>

      {/* Mermaid Import Modal */}
      {showMermaid && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setShowMermaid(false)}>
          <div className="bg-white rounded-lg shadow-xl p-5 w-[460px]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">{t('editor.mermaidClassTitle')}</h3>
              <button onClick={() => setShowMermaid(false)} className="text-gray-400 hover:text-black text-lg leading-none">×</button>
            </div>
            <pre className="text-[10px] text-gray-400 mb-2 whitespace-pre-wrap">{t('editor.mermaidClassHint')}</pre>
            <textarea
              className="w-full h-40 text-xs font-mono border border-gray-300 rounded p-2 mb-3 focus:outline-none focus:ring-1 focus:ring-black"
              placeholder={t('editor.mermaidClassPlaceholder')}
              value={mermaidText}
              onChange={(e) => setMermaidText(e.target.value)}
            />
            <div className="flex gap-2">
              <button onClick={handleMermaidImport}
                className="flex-1 py-2 bg-black text-white text-sm font-medium rounded hover:bg-gray-800">
                {t('quickImport.import')}
              </button>
              <button onClick={() => { setShowMermaid(false); setMermaidText('') }}
                className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-100">
                {t('quickImport.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ====== Activity Editor ======

function ActivityEditor({ state: initial, onApply }: { state?: ActivityState; onApply: (json: string) => void }) {
  const { t } = useTranslation()
  const [nodes, setNodes] = useState<{ id: string; label: string; nodeType: 'start' | 'end' | 'action' | 'decision' }[]>(initial?.nodes || [])
  const [edges, setEdges] = useState<{ id: string; source: string; target: string; guard?: string }[]>(initial?.edges || [])
  // 编辑态键带父级维度（序号 + id），重复 id 也不会两行互抢焦点
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [dragNodeIdx, setDragNodeIdx] = useState<number | null>(null)
  const [showMermaid, setShowMermaid] = useState(false)
  const [mermaidText, setMermaidText] = useState('')

  const initialRef = useRef(initial)
  useEffect(() => {
    if (initialRef.current === initial) return
    initialRef.current = initial
    setNodes(initial?.nodes || [])
    setEdges(initial?.edges || [])
    setEditingKey(null)
  }, [initial])

  const addNode = (nodeType: 'action' | 'decision') => {
    setNodes((n) => [...n, { id: uid(), label: nodeType === 'action' ? t('editor.newAction') : t('editor.decisionNode'), nodeType }])
  }

  const moveNode = (from: number, to: number) => {
    setNodes((n) => { const arr = [...n]; const [item] = arr.splice(from, 1); arr.splice(to, 0, item); return arr })
  }

  const addStartEnd = (nodeType: 'start' | 'end') => {
    setNodes((n) => [...n, { id: uid(), label: '', nodeType }])
  }

  const removeNode = (id: string) => {
    setNodes((n) => n.filter((item) => item.id !== id))
    setEdges((e) => e.filter((edge) => edge.source !== id && edge.target !== id))
    setEditingKey(null)
  }

  /** 开始/结束节点是流程锚点，删除前确认一次，避免误删 */
  const requestRemoveNode = (id: string, nodeType: string) => {
    if ((nodeType === 'start' || nodeType === 'end') &&
      !window.confirm(t('editor.deleteNodeConfirm'))) return
    removeNode(id)
  }

  const renameNode = (id: string, label: string) => {
    setNodes((n) => n.map((item) => item.id === id ? { ...item, label } : item))
  }

  // ===== P2：最小连线编辑 =====
  const addEdge = () => {
    const src = nodes[0]?.id
    const tgt = nodes[1]?.id || nodes[0]?.id
    if (!src || !tgt) return
    setEdges((e) => [...e, { id: uid(), source: src, target: tgt }])
  }
  const removeEdge = (id: string) => setEdges((e) => e.filter((edge) => edge.id !== id))
  const updateEdge = (id: string, updates: Partial<{ source: string; target: string; guard: string }>) => {
    setEdges((e) => e.map((edge) => edge.id === id ? { ...edge, ...updates } : edge))
  }
  const nodeLabel = (id: string) => nodes.find((n) => n.id === id)?.label || id

  const handleApply = () => {
    onApply(activityToJson({ nodes, edges }))
  }

  const handleMermaidImport = () => {
    const result = parseMermaidActivity(mermaidText)
    if (result) {
      setNodes(result.nodes)
      setEdges(result.edges)
      setShowMermaid(false)
      setMermaidText('')
    } else {
      alert(t('editor.mermaidError'))
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button onClick={() => addStartEnd('start')}
          className="flex-1 py-2 text-sm border-2 border-dashed border-gray-300 rounded hover:border-gray-500 hover:bg-gray-100 text-gray-500">
          {t('editor.addStart')}
        </button>
        <button onClick={() => addStartEnd('end')}
          className="flex-1 py-2 text-sm border-2 border-dashed border-gray-300 rounded hover:border-gray-500 hover:bg-gray-100 text-gray-500">
          {t('editor.addEnd')}
        </button>
        <button onClick={() => setShowMermaid(true)}
          className="px-3 py-2 text-sm border border-gray-300 rounded hover:bg-gray-100 text-gray-500">
          {t('editor.importMermaid')}
        </button>
      </div>
      <div className="flex gap-2">
        <button onClick={() => addNode('action')}
          className="flex-1 py-2 text-sm border-2 border-dashed border-gray-300 rounded hover:border-gray-500 hover:bg-gray-100 text-gray-500">
          {t('editor.addAction')}
        </button>
        <button onClick={() => addNode('decision')}
          className="flex-1 py-2 text-sm border-2 border-dashed border-gray-300 rounded hover:border-gray-500 hover:bg-gray-100 text-gray-500">
          {t('editor.addDecision')}
        </button>
      </div>

      <div className="space-y-2">
        {nodes.map((node, i) => (
          <div key={`${node.id}:${i}`} draggable={editingKey !== `a:${i}:${node.id}`} tabIndex={0}
            className={`bg-white border border-gray-200 rounded p-2 transition-opacity ${dragNodeIdx === i ? 'opacity-40' : ''}`}
            onDragStart={() => { if (editingKey === `a:${i}:${node.id}`) return; setDragNodeIdx(i) }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => { if (dragNodeIdx !== null && dragNodeIdx !== i) moveNode(dragNodeIdx, i); setDragNodeIdx(null) }}
            onDragEnd={() => setDragNodeIdx(null)}
            onKeyDown={(e) => {
              if (isEditableTarget(e)) return
              if ((e.key === 'Delete' || e.key === 'Backspace') && editingKey !== `a:${i}:${node.id}`) {
                e.preventDefault()
                requestRemoveNode(node.id, node.nodeType)
              }
            }}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-400 cursor-grab select-none">
                ⋮⋮ {node.nodeType === 'start'
                  ? t('editor.startNode')
                  : node.nodeType === 'end'
                    ? t('editor.endNode')
                    : node.nodeType === 'decision'
                      ? t('editor.decisionNode')
                      : t('editor.actionNode')}
              </span>
              <button onClick={() => requestRemoveNode(node.id, node.nodeType)} className="text-gray-400 hover:text-red-500 text-sm" title={t('editor.deleteAction')}>×</button>
            </div>
            {node.nodeType === 'start' || node.nodeType === 'end' ? (
              <div className="text-sm text-gray-500">{node.nodeType === 'start' ? t('editor.startNode') : t('editor.endNode')}</div>
            ) : (
              editingKey === `a:${i}:${node.id}` ? (
                <InlineEdit value={node.label}
                  onSave={(v) => { renameNode(node.id, v); setEditingKey(null) }}
                  onDelete={() => { removeNode(node.id) }}
                  onTab={() => {
                    if (i + 1 < nodes.length) setEditingKey(`a:${i + 1}:${nodes[i + 1].id}`)
                    else { const id = uid(); setNodes((n) => [...n, { id, label: '', nodeType: 'action' }]); setEditingKey(`a:${nodes.length}:${id}`) }
                  }} />
              ) : (
                <div className="text-sm cursor-pointer" onDoubleClick={() => setEditingKey(`a:${i}:${node.id}`)}>{node.label}</div>
              )
            )}
          </div>
        ))}
      </div>

      {/* 连线（P2：最小连线编辑） */}
      <div className="border-t border-gray-200 pt-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-gray-500">{t('editor.addEdge')}</span>
          <button onClick={addEdge} disabled={nodes.length < 1}
            className="px-2 py-0.5 text-xs bg-black text-white rounded hover:bg-gray-800 disabled:opacity-30">
            + {t('editor.addEdge')}
          </button>
        </div>
        <div className="space-y-1">
          {edges.map((edge) => (
            <div key={edge.id} className="flex items-center gap-1 text-xs bg-gray-50 border border-gray-200 rounded px-1 py-1">
              <select className="flex-1 min-w-0 px-1 py-0.5 border border-gray-300 rounded bg-white"
                value={edge.source} onChange={(e) => updateEdge(edge.id, { source: e.target.value })}>
                {nodes.map((n) => <option key={n.id} value={n.id}>{nodeLabel(n.id)}</option>)}
              </select>
              <span className="text-gray-400">→</span>
              <select className="flex-1 min-w-0 px-1 py-0.5 border border-gray-300 rounded bg-white"
                value={edge.target} onChange={(e) => updateEdge(edge.id, { target: e.target.value })}>
                {nodes.map((n) => <option key={n.id} value={n.id}>{nodeLabel(n.id)}</option>)}
              </select>
              <input className="w-16 px-1 py-0.5 border border-gray-300 rounded" placeholder={t('editor.guard')}
                value={edge.guard || ''} onChange={(e) => updateEdge(edge.id, { guard: e.target.value })} />
              <button onClick={() => removeEdge(edge.id)} className="text-gray-400 hover:text-red-500 px-0.5" title={t('editor.removeEdge')}>×</button>
            </div>
          ))}
          {edges.length === 0 && <div className="text-xs text-gray-400 text-center py-1">{t('editor.addEdge')}</div>}
        </div>
      </div>

      <button onClick={handleApply}
        className="w-full py-2 bg-black text-white text-sm font-medium rounded hover:bg-gray-800">
        {t('editor.apply')}
      </button>

      {/* Mermaid Import Modal */}
      {showMermaid && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setShowMermaid(false)}>
          <div className="bg-white rounded-lg shadow-xl p-5 w-[460px]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">{t('editor.mermaidActivityTitle')}</h3>
              <button onClick={() => setShowMermaid(false)} className="text-gray-400 hover:text-black text-lg leading-none">×</button>
            </div>
            <pre className="text-[10px] text-gray-400 mb-2 whitespace-pre-wrap">{t('editor.mermaidActivityHint')}</pre>
            <textarea
              className="w-full h-40 text-xs font-mono border border-gray-300 rounded p-2 mb-3 focus:outline-none focus:ring-1 focus:ring-black"
              placeholder={t('editor.mermaidActivityPlaceholder')}
              value={mermaidText}
              onChange={(e) => setMermaidText(e.target.value)}
            />
            <div className="flex gap-2">
              <button onClick={handleMermaidImport}
                className="flex-1 py-2 bg-black text-white text-sm font-medium rounded hover:bg-gray-800">
                {t('quickImport.import')}
              </button>
              <button onClick={() => { setShowMermaid(false); setMermaidText('') }}
                className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-100">
                {t('quickImport.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ====== Deployment Editor ======

function DeploymentEditor({ state: initial, onApply }: { state?: DeploymentState; onApply: (json: string) => void }) {
  const { t } = useTranslation()
  type DepNodeType = DeploymentState['nodes'][number]['nodeType']
  const DEP_TYPES: DepNodeType[] = ['server', 'database', 'component', 'artifact', 'node']
  const depLabel = (tp: DepNodeType) =>
    t('editor.depNode' + (tp === 'node' ? 'Device' : tp.charAt(0).toUpperCase() + tp.slice(1)))
  const [nodes, setNodes] = useState<{ id: string; label: string; nodeType: DepNodeType; technology?: string }[]>(initial?.nodes || [])
  const [edges, setEdges] = useState<{ id: string; source: string; target: string; label?: string }[]>(initial?.edges || [])
  // 编辑态键带父级维度（序号 + id），重复 id 也不会两行互抢焦点
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [dragNodeIdx, setDragNodeIdx] = useState<number | null>(null)
  const [showMermaid, setShowMermaid] = useState(false)
  const [mermaidText, setMermaidText] = useState('')

  const initialRef = useRef(initial)
  useEffect(() => {
    if (initialRef.current === initial) return
    initialRef.current = initial
    setNodes(initial?.nodes || [])
    setEdges(initial?.edges || [])
    setEditingKey(null)
  }, [initial])

  const addNode = (nodeType: DepNodeType) => {
    setNodes((n) => [...n, { id: uid(), label: depLabel(nodeType), nodeType, technology: '' }])
  }

  const moveNode = (from: number, to: number) => {
    setNodes((n) => { const arr = [...n]; const [item] = arr.splice(from, 1); arr.splice(to, 0, item); return arr })
  }

  const removeNode = (id: string) => {
    setNodes((n) => n.filter((item) => item.id !== id))
    setEdges((e) => e.filter((edge) => edge.source !== id && edge.target !== id))
    setEditingKey(null)
  }

  const renameNode = (id: string, label: string) => {
    setNodes((n) => n.map((item) => item.id === id ? { ...item, label } : item))
  }

  const setTechnology = (id: string, technology: string) => {
    setNodes((n) => n.map((item) => item.id === id ? { ...item, technology } : item))
  }

  // ===== P2：最小连线编辑 =====
  const addEdge = () => {
    const src = nodes[0]?.id
    const tgt = nodes[1]?.id || nodes[0]?.id
    if (!src || !tgt) return
    setEdges((e) => [...e, { id: uid(), source: src, target: tgt }])
  }
  const removeEdge = (id: string) => setEdges((e) => e.filter((edge) => edge.id !== id))
  const updateEdge = (id: string, updates: Partial<{ source: string; target: string; label: string }>) => {
    setEdges((e) => e.map((edge) => edge.id === id ? { ...edge, ...updates } : edge))
  }

  const handleApply = () => {
    onApply(deploymentToJson({ nodes, edges }))
  }

  const handleMermaidImport = () => {
    const result = parseMermaidDeployment(mermaidText)
    if (result) {
      setNodes(result.nodes)
      setEdges(result.edges)
      setShowMermaid(false)
      setMermaidText('')
    } else {
      alert(t('editor.mermaidError'))
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {DEP_TYPES.map((tp) => (
          <button key={tp} onClick={() => addNode(tp)}
            className="px-3 py-2 text-sm border-2 border-dashed border-gray-300 rounded hover:border-gray-500 hover:bg-gray-100 text-gray-500">
            {'+ ' + depLabel(tp)}
          </button>
        ))}
        <button onClick={() => setShowMermaid(true)}
          className="px-3 py-2 text-sm border border-gray-300 rounded hover:bg-gray-100 text-gray-500">
          {t('editor.importMermaid')}
        </button>
      </div>

      <div className="space-y-2">
        {nodes.map((node, i) => (
          <div key={`${node.id}:${i}`} draggable={editingKey !== `d:${i}:${node.id}`} tabIndex={0}
            className={`bg-white border border-gray-200 rounded p-2 transition-opacity ${dragNodeIdx === i ? 'opacity-40' : ''}`}
            onDragStart={() => { if (editingKey === `d:${i}:${node.id}`) return; setDragNodeIdx(i) }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => { if (dragNodeIdx !== null && dragNodeIdx !== i) moveNode(dragNodeIdx, i); setDragNodeIdx(null) }}
            onDragEnd={() => setDragNodeIdx(null)}
            onKeyDown={(e) => {
              if (isEditableTarget(e)) return
              if ((e.key === 'Delete' || e.key === 'Backspace') && editingKey !== `d:${i}:${node.id}`) {
                e.preventDefault()
                removeNode(node.id)
              }
            }}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-400 cursor-grab select-none">⋮⋮ {depLabel(node.nodeType)}</span>
              <button onClick={() => removeNode(node.id)} className="text-gray-400 hover:text-red-500 text-sm" title={t('editor.deleteServer')}>×</button>
            </div>
            {editingKey === `d:${i}:${node.id}` ? (
              <InlineEdit value={node.label}
                onSave={(v) => { renameNode(node.id, v); setEditingKey(null) }}
                onDelete={() => { removeNode(node.id) }}
                onTab={() => {
                  if (i + 1 < nodes.length) setEditingKey(`d:${i + 1}:${nodes[i + 1].id}`)
                  else { const id = uid(); setNodes((n) => [...n, { id, label: '', nodeType: 'server', technology: '' }]); setEditingKey(`d:${nodes.length}:${id}`) }
                }} />
            ) : (
              <div className="text-sm cursor-pointer" onDoubleClick={() => setEditingKey(`d:${i}:${node.id}`)}>{node.label}</div>
            )}
            <input className="w-full mt-1 px-1 py-0.5 text-xs border border-gray-300 rounded"
              placeholder={t('editor.techPlaceholder')}
              value={node.technology || ''}
              onChange={(e) => setTechnology(node.id, e.target.value)} />
          </div>
        ))}
      </div>

      {/* 连线（P2：最小连线编辑） */}
      <div className="border-t border-gray-200 pt-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-gray-500">{t('editor.addEdge')}</span>
          <button onClick={addEdge} disabled={nodes.length < 1}
            className="px-2 py-0.5 text-xs bg-black text-white rounded hover:bg-gray-800 disabled:opacity-30">
            + {t('editor.addEdge')}
          </button>
        </div>
        <div className="space-y-1">
          {edges.map((edge) => (
            <div key={edge.id} className="flex items-center gap-1 text-xs bg-gray-50 border border-gray-200 rounded px-1 py-1">
              <select className="flex-1 min-w-0 px-1 py-0.5 border border-gray-300 rounded bg-white"
                value={edge.source} onChange={(e) => updateEdge(edge.id, { source: e.target.value })}>
                {nodes.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
              </select>
              <span className="text-gray-400">→</span>
              <select className="flex-1 min-w-0 px-1 py-0.5 border border-gray-300 rounded bg-white"
                value={edge.target} onChange={(e) => updateEdge(edge.id, { target: e.target.value })}>
                {nodes.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
              </select>
              <input className="w-20 px-1 py-0.5 border border-gray-300 rounded" placeholder={t('editor.edgeLabel')}
                value={edge.label || ''} onChange={(e) => updateEdge(edge.id, { label: e.target.value })} />
              <button onClick={() => removeEdge(edge.id)} className="text-gray-400 hover:text-red-500 px-0.5" title={t('editor.removeEdge')}>×</button>
            </div>
          ))}
        </div>
      </div>

      <button onClick={handleApply}
        className="w-full py-2 bg-black text-white text-sm font-medium rounded hover:bg-gray-800">
        {t('editor.apply')}
      </button>

      {/* Mermaid Import Modal */}
      {showMermaid && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setShowMermaid(false)}>
          <div className="bg-white rounded-lg shadow-xl p-5 w-[460px]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">{t('editor.mermaidDeploymentTitle')}</h3>
              <button onClick={() => setShowMermaid(false)} className="text-gray-400 hover:text-black text-lg leading-none">×</button>
            </div>
            <pre className="text-[10px] text-gray-400 mb-2 whitespace-pre-wrap">{t('editor.mermaidDeploymentHint')}</pre>
            <textarea
              className="w-full h-40 text-xs font-mono border border-gray-300 rounded p-2 mb-3 focus:outline-none focus:ring-1 focus:ring-black"
              placeholder={t('editor.mermaidDeploymentPlaceholder')}
              value={mermaidText}
              onChange={(e) => setMermaidText(e.target.value)}
            />
            <div className="flex gap-2">
              <button onClick={handleMermaidImport}
                className="flex-1 py-2 bg-black text-white text-sm font-medium rounded hover:bg-gray-800">
                {t('quickImport.import')}
              </button>
              <button onClick={() => { setShowMermaid(false); setMermaidText('') }}
                className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-100">
                {t('quickImport.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ====== ER Editor (SQL Import) ======

function EREditor({ state: initial, onApply }: { state?: ERState; onApply: (json: string) => void }) {
  const { t } = useTranslation()
  const [state, setState] = useState<ERState>(initial || { entities: [], relationships: [] })
  const [sqlText, setSqlText] = useState('')
  const [parseError, setParseError] = useState('')
  const [isParsing, setIsParsing] = useState(false)
  const [aiLayout, setAiLayout] = useState(true)
  const [mergeMn, setMergeMn] = useState(true)
  const [centerId, setCenterId] = useState('auto')
  const [parsePreview, setParsePreview] = useState<{ tables: number; relations: number; source: string } | null>(null)

  // App 已去掉 key={er-...-configVersion} 的重挂载，改为受控同步：
  // 外部配置变化（应用修改 / 撤销 / 导入）时刷新实体与关系，
  // 但本地 UI 状态（SQL 文本 / 合并 M:N / AI 布局 / 中心实体 / 解析提示）保持不变，
  // 否则点一次「应用修改」就把用户刚粘的 SQL 和布局选项清空了。
  const initialRef = useRef(initial)
  useEffect(() => {
    if (initialRef.current === initial) return
    initialRef.current = initial
    setState(initial || { entities: [], relationships: [] })
  }, [initial])

  const handleParseSql = async () => {
    setParseError('')
    setParsePreview(null)
    setIsParsing(true)

    try {
      const { getApiKey } = await import('./SettingsModal')
      const apiKey = getApiKey()

      if (apiKey) {
        const { generateERFromAI } = await import('../../utils/aiService')
        const aiState = await generateERFromAI(sqlText, apiKey, aiLayout)
        // 关闭 AI 网格时改用本地图布局（按外键结构），而不是退回声明顺序网格
        const finalState = aiLayout
          ? aiState
          : (() => {
              const placed = layoutErEntities(
                aiState.entities.map(e => ({ id: e.id, label: e.label })),
                aiState.relationships.map(r => ({ source: r.source, target: r.target })),
                centerId === 'auto' ? {} : { centerId },
              )
              const pos = new Map(placed.map(p => [p.id, p]))
              return {
                ...aiState,
                entities: aiState.entities.map(e => {
                  const p = pos.get(e.id)
                  return p ? { ...e, x: p.x, y: p.y, row: undefined, col: undefined } : e
                }),
              }
            })()
        setState(finalState)
        setParsePreview({
          tables: finalState.entities.length,
          relations: finalState.relationships.length,
          source: aiLayout ? 'AI+\u5e03\u5c40' : 'AI+\u672c\u5730\u5e03\u5c40',
        })
      } else {
        // Fallback to local parser（本地解析 + 本地图布局，全链路不依赖 AI）
        const { parseSql, buildErModel } = await import('../../utils/sqlParser')
        const result = parseSql(sqlText)
        if (result.errors.length > 0 && result.tables.length === 0) {
          setParseError(result.errors.join('\n') + '\n\n' + t('editor.sqlAiFallback'))
          setIsParsing(false)
          return
        }

        // mergeMn：纯连接表折叠成一个 M:N 联系（Chen 表示法），不再保留关联实体
        const model = buildErModel(result.tables, { mergeManyToMany: mergeMn })
        const relationships = model.relationships
        const baseEntities = model.entities.map(table => ({
          id: `ent_${table.name}`,
          label: table.label || table.name,
          // 把列信息带进来：表格型 / 字段环绕型表示法要用
          fields: fieldsFromTable(table),
        }))
        // 按外键结构布局（主表居中、近邻落在同行/同列），避免声明顺序造成的扇形长线
        const placed = layoutErEntities(
          baseEntities,
          relationships.map(rel => ({ source: `ent_${rel.sourceTable}`, target: `ent_${rel.targetTable}` })),
          centerId === 'auto' ? {} : { centerId },
        )
        const pos = new Map(placed.map(p => [p.id, p]))
        const entities = baseEntities.map(e => {
          const p = pos.get(e.id)
          return p ? { ...e, x: p.x, y: p.y } : e
        })
        const rels = relationships.map(rel => ({
          id: uid(),
          label: rel.label,
          source: `ent_${rel.sourceTable}`,
          target: `ent_${rel.targetTable}`,
          sourceCard: rel.sourceCardinality,
          targetCard: rel.targetCardinality,
        }))

        setState({ entities, relationships: rels })
        setParsePreview({ tables: entities.length, relations: rels.length, source: 'Local' })
      }
    } catch (err: any) {
      setParseError(err.message || 'Parsing failed')
    } finally {
      setIsParsing(false)
    }
  }

  /** 系统建议的中心实体（下拉里直接显示，避免"算法猜了但用户不知道"） */
  const autoCenter = useMemo(
    () => suggestCenter(
      state.entities.map((e) => ({ id: e.id, label: e.label })),
      state.relationships.map((r) => ({ source: r.source, target: r.target })),
    ),
    [state.entities, state.relationships],
  )

  /** 重新排版：可指定中心实体（解决"度数最高 ≠ 业务核心"） */
  const applyAutoLayout = (center: string) => {
    setState((s) => {
      if (s.entities.length < 2) return s
      const placed = layoutErEntities(
        s.entities.map((e) => ({ id: e.id, label: e.label })),
        s.relationships.map((r) => ({ source: r.source, target: r.target })),
        center === 'auto' ? {} : { centerId: center },
      )
      const pos = new Map(placed.map((p) => [p.id, p]))
      return {
        ...s,
        entities: s.entities.map((e) => {
          const p = pos.get(e.id)
          return p ? { ...e, x: p.x, y: p.y } : e
        }),
      }
    })
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (ev) => {
        if (ev.target?.result) {
          setSqlText(ev.target.result as string)
        }
      }
      reader.readAsText(file)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const addEntity = () => {
    setState(s => ({
      ...s,
      entities: [...s.entities, { id: `ent_${uid()}`, label: t('editor.newErEntity') }],
    }))
  }

  const removeEntity = (entId: string) => {
    setState(s => ({
      ...s,
      entities: s.entities.filter(e => e.id !== entId),
      relationships: s.relationships.filter(r => r.source !== entId && r.target !== entId),
    }))
  }

  const renameEntity = (entId: string, label: string) => {
    setState(s => ({
      ...s,
      entities: s.entities.map(e => e.id === entId ? { ...e, label } : e),
    }))
  }

  const updateEntity = (entId: string, updates: Partial<ERState['entities'][0]>) => {
    setState(s => ({
      ...s,
      entities: s.entities.map(e => e.id === entId ? { ...e, ...updates } : e),
    }))
  }

  const addRelation = () => {
    const src = state.entities[0]?.id || ''
    const tgt = state.entities[1]?.id || state.entities[0]?.id || ''
    setState(s => ({
      ...s,
      relationships: [...s.relationships, {
        id: uid(),
        label: t('editor.erRelationLabel'),
        source: src,
        target: tgt,
        sourceCard: '1',
        targetCard: 'N',
      }],
    }))
  }

  const removeRelation = (relId: string) => {
    setState(s => ({
      ...s,
      relationships: s.relationships.filter(r => r.id !== relId),
    }))
  }

  const updateRelation = (relId: string, updates: Partial<ERState['relationships'][0]>) => {
    setState(s => ({
      ...s,
      relationships: s.relationships.map(r => r.id === relId ? { ...r, ...updates } : r),
    }))
  }

  return (
    <div className="space-y-4">
      {/* SQL Input */}
      <div className="border border-gray-200 rounded-lg bg-white p-3">
        <h3 className="text-xs font-semibold text-gray-600 mb-2">{t('editor.importSql')}</h3>
        <textarea
          className="w-full h-40 text-xs font-mono border border-gray-300 rounded p-2 mb-2 focus:outline-none focus:ring-1 focus:ring-black resize-y"
          placeholder={t('editor.sqlExample').replace(/\\n/g, '\n') + '\n\n(支持将 .sql 文件拖拽到此处)'}
          value={sqlText}
          onChange={(e) => setSqlText(e.target.value)}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
        />
        {parseError && (
          <div className="text-xs text-red-500 mb-2 bg-red-50 rounded p-2">{parseError}</div>
        )}
        {parsePreview && (
          <div className="text-xs text-green-600 mb-2 bg-green-50 rounded p-2">
            {t('editor.sqlPreview')} ({parsePreview.source}): {parsePreview.tables} {t('editor.sqlTables')}, {parsePreview.relations} {t('editor.sqlRelations')}
          </div>
        )}
        <div className="flex items-center gap-2 mb-2">
          <button
            onClick={() => setAiLayout(!aiLayout)}
            className={`px-3 py-1 text-xs rounded border font-medium transition-colors ${aiLayout ? 'bg-black text-white border-black' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-500'}`}
            title={t('editor.aiLayoutHint')}
          >
            {aiLayout ? t('editor.aiLayoutOn') : t('editor.aiLayoutOff')}
          </button>
          <button
            onClick={() => setMergeMn(!mergeMn)}
            className={`px-3 py-1 text-xs rounded border font-medium transition-colors ${mergeMn ? 'bg-black text-white border-black' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-500'}`}
            title={t('editor.mergeMnHint')}
          >
            {mergeMn ? t('editor.mergeMnOn') : t('editor.mergeMnOff')}
          </button>
        </div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] text-gray-400 flex-1">
            {t('editor.aiLayoutHint')} · {t('editor.mergeMnHint')}
          </span>
        </div>
        {state.entities.length >= 2 && (
          <div className="flex items-center gap-2 mb-2">
            <label className="text-[10px] text-gray-400 shrink-0">{t('editor.layoutCenter')}</label>
            <select
              className="flex-1 px-1 py-1 text-xs border border-gray-300 rounded bg-white"
              value={centerId}
              onChange={(e) => {
                setCenterId(e.target.value)
                applyAutoLayout(e.target.value)
              }}
            >
              <option value="auto">
                {t('editor.layoutCenterAuto', {
                  name: autoCenter?.label ?? t('editor.layoutCenterAutoFallback'),
                })}
              </option>
              {state.entities.map((e) => (
                <option key={e.id} value={e.id}>{e.label}</option>
              ))}
            </select>
          </div>
        )}
        <button
          onClick={handleParseSql}
          disabled={!sqlText.trim() || isParsing}
          className="w-full py-2 bg-black text-white text-sm font-medium rounded hover:bg-gray-800 disabled:opacity-30"
        >
          {isParsing ? t('editor.sqlAiParsing') : t('editor.sqlGenerate')}
        </button>
      </div>

      {/* Entity List */}
      <div>
        <button onClick={addEntity} className="w-full py-2 text-sm border-2 border-dashed border-gray-300 rounded hover:border-gray-500 hover:bg-gray-100 text-gray-500 mb-3">
          {t('editor.addErEntity')}
        </button>
        <div className="space-y-2">
          {state.entities.map((ent) => (
            <div key={ent.id} className="px-3 py-2 border border-gray-200 rounded-lg bg-white">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 shrink-0">▪</span>
                <input
                  className="flex-1 text-sm bg-transparent focus:outline-none font-medium"
                  value={ent.label}
                  onChange={(e) => renameEntity(ent.id, e.target.value)}
                />
                <button
                  onClick={() => removeEntity(ent.id)}
                  className="text-gray-400 hover:text-red-500 text-sm"
                  title={t('editor.deleteErEntity')}
                >×</button>
              </div>
              <input
                className="w-full mt-1 px-1 py-0.5 text-xs border border-gray-300 rounded"
                placeholder={t('editor.erGroupPlaceholder')}
                value={ent.group || ''}
                onChange={(e) => updateEntity(ent.id, { group: e.target.value.trim() || undefined })}
              />
              <textarea
                className="w-full mt-1 px-1 py-1 text-xs border border-gray-300 rounded font-mono resize-y"
                rows={Math.min(7, Math.max(2, (ent.fields?.length || 0) + 1))}
                placeholder={t('editor.erFieldsPlaceholder')}
                value={fieldsToText(ent.fields)}
                onChange={(e) => {
                  const fields = parseFieldsText(e.target.value)
                  updateEntity(ent.id, { fields: fields.length ? fields : undefined })
                }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Relationship List */}
      {state.entities.length >= 2 && (
        <div>
          <button onClick={addRelation} className="w-full py-2 text-sm border-2 border-dashed border-gray-300 rounded hover:border-gray-500 hover:bg-gray-100 text-gray-500 mb-3">
            {t('editor.addErRelation')}
          </button>
          <div className="space-y-2">
            {state.relationships.map((rel) => (
              <div key={rel.id} className="border border-gray-200 rounded-lg bg-white p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs text-gray-400 shrink-0">◇</span>
                  <input
                    className="flex-1 text-sm bg-transparent focus:outline-none font-medium"
                    value={rel.label}
                    placeholder={t('editor.erRelationName')}
                    onChange={(e) => updateRelation(rel.id, { label: e.target.value })}
                  />
                  <button
                    onClick={() => removeRelation(rel.id)}
                    className="text-gray-400 hover:text-red-500 text-sm"
                    title={t('editor.deleteErRelation')}
                  >×</button>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <label className="text-gray-400 block mb-1">{t('editor.erSource')}</label>
                    <select
                      className="w-full px-1 py-1 border border-gray-300 rounded text-xs bg-white"
                      value={rel.source}
                      onChange={(e) => updateRelation(rel.id, { source: e.target.value })}
                    >
                      {state.entities.map(e => (
                        <option key={e.id} value={e.id}>{e.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-gray-400 block mb-1">{t('editor.erTarget')}</label>
                    <select
                      className="w-full px-1 py-1 border border-gray-300 rounded text-xs bg-white"
                      value={rel.target}
                      onChange={(e) => updateRelation(rel.id, { target: e.target.value })}
                    >
                      {state.entities.map(e => (
                        <option key={e.id} value={e.id}>{e.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-gray-400 block mb-1">{t('editor.erSourceCard')}</label>
                    <select
                      className="w-full px-1 py-1 border border-gray-300 rounded text-xs bg-white"
                      value={rel.sourceCard}
                      onChange={(e) => updateRelation(rel.id, { sourceCard: e.target.value })}
                    >
                      <option value="1">1</option>
                      <option value="N">N</option>
                      <option value="M">M</option>
                      <option value="0..1">0..1</option>
                      <option value="0..N">0..N</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-gray-400 block mb-1">{t('editor.erTargetCard')}</label>
                    <select
                      className="w-full px-1 py-1 border border-gray-300 rounded text-xs bg-white"
                      value={rel.targetCard}
                      onChange={(e) => updateRelation(rel.id, { targetCard: e.target.value })}
                    >
                      <option value="1">1</option>
                      <option value="N">N</option>
                      <option value="M">M</option>
                      <option value="0..1">0..1</option>
                      <option value="0..N">0..N</option>
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Apply Button：不再受 entities.length > 0 门禁，空实体（全删）也要能提交 */}
      <button
        onClick={() => onApply(erToJson(state))}
        className="w-full py-2 bg-black text-white text-sm font-medium rounded hover:bg-gray-800"
      >
        {t('editor.apply')}
      </button>
    </div>
  )
}
