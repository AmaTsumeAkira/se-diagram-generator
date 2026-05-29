import { useState, useRef, useEffect, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useVercount } from '@vercount/react'

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
}

export interface ClassState {
  classes: {
    id: string
    label: string
    attributes: string[]
    methods: string[]
    isAbstract?: boolean
    stereotype?: string
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
    nodeType: 'server' | 'database'
    technology?: string
  }[]
  edges: {
    id: string
    source: string
    target: string
    label?: string
  }[]
}

export type DiagramType = 'usecase' | 'structure' | 'entity' | 'sequence' | 'class' | 'activity' | 'deployment'

interface Props {
  type: DiagramType
  useCase?: UseCaseState
  tree?: TreeNode
  entity?: EntityState
  sequence?: SequenceState
  classState?: ClassState
  activity?: ActivityState
  deployment?: DeploymentState
  onApply: (json: string) => void
}

// ====== ID generator ======
let _id = 100
function uid(): string { return 'n' + _id++ }

const DEFAULT_FONT_FAMILY = 'SimSun'
const DEFAULT_FONT_SIZE = 14

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
        <input type="number" min={10} max={22} value={fontSize}
          className="w-12 px-1 py-0.5 border border-gray-300 rounded text-center text-xs"
          onChange={(e) => onFontSizeChange(Number(e.target.value) || DEFAULT_FONT_SIZE)} />
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

function treeToJson(root: TreeNode, fontSize = DEFAULT_FONT_SIZE, spacing = 26, fontFamily = DEFAULT_FONT_FAMILY): string {
  const nodes: any[] = []
  const edges: any[] = []
  function walk(node: TreeNode, isRoot = false) {
    const n: any = { id: node.id, type: 'rectangle', label: node.label, vertical: node.vertical }
    if (isRoot) { n.fontSize = fontSize; n.fontFamily = fontFamily; n.spacing = spacing }
    nodes.push(n)
    node.children.forEach((child) => {
      edges.push({ id: `e_${node.id}_${child.id}`, source: node.id, target: child.id })
      walk(child)
    })
  }
  walk(root, true)
  return JSON.stringify({ nodes, edges }, null, 2)
}

function entityToJson(state: EntityState): string {
  const nodes: any[] = []
  const edges: any[] = []
  const fontFamily = state.fontFamily || DEFAULT_FONT_FAMILY
  const fontSize = state.fontSize || DEFAULT_FONT_SIZE
  state.entities.forEach((ent) => {
    nodes.push({ id: ent.id, type: 'rectangle', label: ent.label, fontFamily, fontSize })
    ent.attributes.forEach((a, i) => {
      nodes.push({ id: a.id, type: 'ellipse', label: a.label, rx: 45, ry: 18, fontFamily, fontSize })
      edges.push({ id: `e_${ent.id}_${i}`, source: ent.id, target: a.id })
    })
  })
  return JSON.stringify({ nodes, edges }, null, 2)
}

// ====== 新增图表 JSON generators ======

function sequenceToJson(state: SequenceState): string {
  const nodes: any[] = []
  state.participants.forEach((p) => {
    nodes.push({ id: p.id, type: 'participant', label: p.label, participantType: p.participantType })
  })
  const edges: any[] = (state.messages || []).map((m) => ({
    id: m.id,
    source: m.source,
    target: m.target,
    label: m.label,
    data: { messageType: m.messageType || 'sync' },
  }))
  return JSON.stringify({ nodes, edges }, null, 2)
}

function classToJson(state: ClassState, relations?: { id: string; source: string; target: string; relationType: string; label?: string }[]): string {
  const nodes: any[] = []
  state.classes.forEach((cls) => {
    nodes.push({
      id: cls.id,
      type: 'class',
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

    // participant declaration: "participant 客户端" or "participant Alice as A"
    const partRe = new RegExp(`^participant\\s+(${NAME_RE})(?:\\s+as\\s+(.+))?$`)
    const partMatch = line.match(partRe)
    if (partMatch) {
      const name = partMatch[1]
      const alias = partMatch[2]?.trim() || name
      if (!nameToId.has(name)) {
        const id = uid()
        nameToId.set(name, id)
        if (alias !== name) nameToId.set(alias, id)
        participants.push({ id, label: alias, participantType: 'system' })
      }
      continue
    }

    // Note line: skip
    if (/^Note\b/i.test(line)) continue

    // autonumber: skip
    if (/^autonumber\b/i.test(line)) continue

    // activate/deactivate: skip
    if (/^(activate|deactivate)\b/i.test(line)) continue

    // Message line: "客户端->>服务器: 发送登录请求" or "数据库-->>服务器: 返回数据"
    const msgRe = new RegExp(`^(${NAME_RE})\\s*(--?>>?|-{1,2}>|-x)\\s*(${NAME_RE})\\s*:\\s*(.+)$`)
    const msgMatch = line.match(msgRe)
    if (msgMatch) {
      const src = msgMatch[1]
      const arrow = msgMatch[2]
      const tgt = msgMatch[3]
      const label = msgMatch[4].trim()

      let messageType: 'sync' | 'async' | 'return' = 'sync'
      if (arrow.startsWith('--')) messageType = 'return'

      const srcId = getOrCreateParticipant(src)
      const tgtId = getOrCreateParticipant(tgt)
      messages.push({ id: uid(), source: srcId, target: tgtId, label, messageType })
    }
  }

  if (participants.length === 0) return null
  return { participants, messages }
}

function parseMermaidClass(code: string): { classes: { id: string; label: string; attributes: string[]; methods: string[]; isAbstract?: boolean; stereotype?: string }[]; relations: { id: string; source: string; target: string; relationType: string; label?: string }[] } | null {
  const lines = code.split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length === 0) return null

  let startIdx = lines.findIndex((l) => l.startsWith('classDiagram'))
  if (startIdx === -1) return null
  startIdx += 1

  const classes: { id: string; label: string; attributes: string[]; methods: string[]; isAbstract?: boolean; stereotype?: string }[] = []
  const relations: { id: string; source: string; target: string; relationType: string; label?: string }[] = []
  const nameToId = new Map<string, string>()

  const getOrCreateClass = (name: string): string => {
    if (nameToId.has(name)) return nameToId.get(name)!
    const id = uid()
    nameToId.set(name, id)
    classes.push({ id, label: name, attributes: [], methods: [] })
    return id
  }

  let currentClass: string | null = null
  let currentClassId: string | null = null

  const relationPatterns: [RegExp, string][] = [
    [/\s*<\|--\s*/, 'inheritance'],
    [/\s*\*--\s*/, 'composition'],
    [/\s*o--\s*/, 'aggregation'],
    [/\s*-->\s*/, 'association'],
    [/\s*\.\.>\s*/, 'dependency'],
    [/\s*<\|\.\.\s*/, 'implementation'],
  ]

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i]

    // Class block start: "class ClassName {"
    const classStartMatch = line.match(/^class\s+(\w[\w]*)\s*\{?$/)
    if (classStartMatch) {
      currentClass = classStartMatch[1]
      currentClassId = getOrCreateClass(currentClass)
      continue
    }

    // Class block end
    if (line === '}') {
      currentClass = null
      currentClassId = null
      continue
    }

    // Inside a class block: attribute or method
    if (currentClassId && currentClass) {
      const cls = classes.find((c) => c.id === currentClassId)
      if (cls) {
        // Method: contains parentheses like "+makeSound() void"
        const methodMatch = line.match(/^[+#-]\s*([\w]+)\s*\([^)]*\)\s*(.*)?$/)
        if (methodMatch) {
          cls.methods.push(line.replace(/^[+#-]\s*/, ''))
          continue
        }
        // Attribute: "+String name" or "-int age"
        const attrMatch = line.match(/^[+#-]\s*(.+)$/)
        if (attrMatch) {
          cls.attributes.push(attrMatch[1].trim())
          continue
        }
      }
    }

    // Relation lines
    let foundRelation = false
    for (const [pattern, relType] of relationPatterns) {
      const relRe = new RegExp(`^(\\w[\\w]*)${pattern.source}(\\w[\\w]*)(?:\\s*:\\s*(.+))?$`)
      const relMatch = line.match(relRe)
      if (relMatch) {
        const srcName = relMatch[1]
        const tgtName = relMatch[2]
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

function parseMermaidActivity(code: string): ActivityState | null {
  const lines = code.split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length === 0) return null

  let startIdx = lines.findIndex((l) => /^(flowchart|graph)\s+TD/i.test(l))
  if (startIdx === -1) return null
  startIdx += 1

  const nodes: ActivityState['nodes'] = []
  const edges: ActivityState['edges'] = []
  const nameToId = new Map<string, string>()

  // Parse a node reference like "Start([开始])", "Action1[用户输入]", "Decision{验证?}"
  // Returns the node ID, creating the node if needed
  const parseNodeRef = (ref: string): string | null => {
    ref = ref.trim()
    if (!ref) return null

    // ([text]) → start/end node
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

    // Split by --> to get edge parts
    const arrowParts = line.split(/\s*-->\s*/)
    if (arrowParts.length < 2) continue

    for (let p = 0; p < arrowParts.length - 1; p++) {
      let leftPart = arrowParts[p]
      let rightPart = arrowParts[p + 1]

      // Extract guard from rightPart: "|label| NodeRef"
      let guard: string | undefined
      const guardMatch = rightPart.match(/^\|([^|]+)\|\s*(.+)$/)
      if (guardMatch) {
        guard = guardMatch[1].trim()
        rightPart = guardMatch[2]
      }

      // For the first part, the left side might have a guard from previous split - not typical
      // Parse node references
      const srcId = parseNodeRef(leftPart)
      const tgtId = parseNodeRef(rightPart)
      if (srcId && tgtId) {
        edges.push({ id: uid(), source: srcId, target: tgtId, guard })
      }
    }
  }

  // Refine start/end: first node with "start" type → start, last → end
  const startEndNodes = nodes.filter((n) => n.nodeType === 'start')
  if (startEndNodes.length >= 1) {
    startEndNodes[0].nodeType = 'start'
    if (startEndNodes.length >= 2) {
      startEndNodes[startEndNodes.length - 1].nodeType = 'end'
    }
  }

  if (nodes.length === 0) return null
  return { nodes, edges }
}

function parseMermaidDeployment(code: string): DeploymentState | null {
  const lines = code.split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length === 0) return null

  let startIdx = lines.findIndex((l) => /^(flowchart|graph)\s+TD/i.test(l))
  if (startIdx === -1) return null
  startIdx += 1

  const nodes: DeploymentState['nodes'] = []
  const edges: DeploymentState['edges'] = []
  const nameToId = new Map<string, string>()

  // Parse a node reference like "server[Web服务器]", "db[(MySQL)]"
  const parseNodeRef = (ref: string): string | null => {
    ref = ref.trim()
    if (!ref) return null

    // [(text)] → database node
    let m = ref.match(/^(\w+)\[\((.+?)\)\]$/)
    if (m) {
      const nodeId = m[1]
      if (!nameToId.has(nodeId)) {
        const id = uid()
        nameToId.set(nodeId, id)
        let label = m[2]
        let technology: string | undefined
        const techMatch = label.match(/^(.+?):::(.+)$/)
        if (techMatch) { label = techMatch[1]; technology = techMatch[2] }
        nodes.push({ id, label, nodeType: 'database', technology })
      }
      return nameToId.get(nodeId)!
    }

    // [text] → server node
    m = ref.match(/^(\w+)\[(.+?)\]$/)
    if (m) {
      const nodeId = m[1]
      if (!nameToId.has(nodeId)) {
        const id = uid()
        nameToId.set(nodeId, id)
        let label = m[2]
        let technology: string | undefined
        const techMatch = label.match(/^(.+?):::(.+)$/)
        if (techMatch) { label = techMatch[1]; technology = techMatch[2] }
        nodes.push({ id, label, nodeType: 'server', technology })
      }
      return nameToId.get(nodeId)!
    }

    // Bare ID → server node
    m = ref.match(/^(\w+)$/)
    if (m) {
      const nodeId = m[1]
      if (!nameToId.has(nodeId)) {
        const id = uid()
        nameToId.set(nodeId, id)
        nodes.push({ id, label: nodeId, nodeType: 'server' })
      }
      return nameToId.get(nodeId)!
    }

    return null
  }

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i]
    const arrowParts = line.split(/\s*-->\s*/)
    if (arrowParts.length < 2) continue

    for (let p = 0; p < arrowParts.length - 1; p++) {
      const srcId = parseNodeRef(arrowParts[p])
      const tgtId = parseNodeRef(arrowParts[p + 1])
      if (srcId && tgtId) {
        edges.push({ id: uid(), source: srcId, target: tgtId })
      }
    }
  }

  if (nodes.length === 0) return null
  return { nodes, edges }
}

// ====== Main ======

export default function NodeEditor({ type, useCase, tree, entity, sequence, onApply }: Props) {
  const { t } = useTranslation()
  const { sitePv, pagePv, siteUv } = useVercount()
  const titleKeys: Record<DiagramType, string> = {
    usecase: 'editor.usecaseTitle',
    structure: 'editor.structureTitle',
    entity: 'editor.entityTitle',
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
        <p className="text-xs text-gray-500 mt-0.5">{t('editor.hint')}</p>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {type === 'usecase' && useCase && <UseCaseEditor state={useCase} onApply={onApply} />}
        {type === 'structure' && tree && <TreeEditor root={tree} onApply={onApply} />}
        {type === 'entity' && entity && <EntityEditor state={entity} onApply={onApply} />}
        {type === 'sequence' && <SequenceEditor state={sequence} onApply={onApply} />}
        {type === 'class' && <ClassEditor onApply={onApply} />}
        {type === 'activity' && <ActivityEditor onApply={onApply} />}
        {type === 'deployment' && <DeploymentEditor onApply={onApply} />}
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
    setState((s) => ({ actors: [...s.actors, { id: uid(), label: t('editor.newActor'), useCases: [] }] }))
  }
  const removeActor = (actorId: string) => {
    setState((s) => ({ actors: s.actors.filter((a) => a.id !== actorId) }))
  }
  const renameActor = (actorId: string, label: string) => {
    setState((s) => ({ actors: s.actors.map((a) => a.id === actorId ? { ...a, label } : a) }))
  }
  const addUseCase = (actorId: string, id: string, label: string) => {
    setState((s) => ({
      actors: s.actors.map((a) => a.id === actorId ? { ...a, useCases: [...a.useCases, { id, label }] } : a),
    }))
  }
  const moveUseCase = (actorId: string, from: number, to: number) => {
    setState((s) => ({
      actors: s.actors.map((a) => {
        if (a.id !== actorId) return a
        const arr = [...a.useCases]; const [item] = arr.splice(from, 1); arr.splice(to, 0, item)
        return { ...a, useCases: arr }
      }),
    }))
  }
  const removeUseCase = (actorId: string, ucId: string) => {
    setState((s) => ({
      actors: s.actors.map((a) => a.id === actorId ? { ...a, useCases: a.useCases.filter((uc) => uc.id !== ucId) } : a),
    }))
    if (editingId === ucId) setEditingId(null)
  }
  const renameUseCase = (actorId: string, ucId: string, label: string) => {
    setState((s) => ({
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
                setState((s) => ({ actors: [...s.actors, { id: actorId, label: actorLabel, useCases }] }))
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
                if (e.key === 'Enter') setEditingId(uc.id)
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

function updateTreeNode(node: TreeNode, targetId: string, fn: (n: TreeNode) => TreeNode): TreeNode {
  if (node.id === targetId) return fn(node)
  return { ...node, children: node.children.map((c) => updateTreeNode(c, targetId, fn)) }
}
function deleteTreeNode(node: TreeNode, targetId: string): TreeNode | null {
  if (node.id === targetId) return null
  return { ...node, children: node.children.map((c) => deleteTreeNode(c, targetId)).filter((c): c is TreeNode => c !== null) }
}
function getSiblingGroups(node: TreeNode, groups: Map<string, string[]>) {
  if (node.children.length > 0) groups.set(node.id, node.children.map((c) => c.id))
  node.children.forEach((c) => getSiblingGroups(c, groups))
}

function TreeEditor({ root: initialRoot, onApply }: { root: TreeNode; onApply: (json: string) => void }) {
  const { t } = useTranslation()
  const [root, setRoot] = useState<TreeNode>(initialRoot)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showImport, setShowImport] = useState(false)
  const [fontFamily, setFontFamily] = useState(initialRoot.fontFamily || DEFAULT_FONT_FAMILY)
  const [fontSize, setFontSize] = useState(initialRoot.fontSize || DEFAULT_FONT_SIZE)
  const [spacing, setSpacing] = useState(initialRoot.spacing || 26)

  const handleAddChild = (parentId: string, label: string) => {
    setRoot((prev) => updateTreeNode(prev, parentId, (node) => ({ ...node, children: [...node.children, { id: uid(), label, vertical: false, children: [] }] })))
  }
  const handleDelete = (nodeId: string) => {
    setRoot((prev) => deleteTreeNode(prev, nodeId) ?? prev)
    if (editingId === nodeId) setEditingId(null)
  }
  const handleRename = (nodeId: string, label: string) => {
    setRoot((prev) => updateTreeNode(prev, nodeId, (node) => ({ ...node, label })))
  }

  const siblingGroups = new Map<string, string[]>()
  getSiblingGroups(root, siblingGroups)

  const handleTabFrom = (nodeId: string) => {
    for (const [parentId, siblings] of siblingGroups) {
      const idx = siblings.indexOf(nodeId)
      if (idx !== -1) {
        if (idx + 1 < siblings.length) { setEditingId(siblings[idx + 1]) }
        else { const id = uid(); setRoot((prev) => updateTreeNode(prev, parentId, (n) => ({ ...n, children: [...n.children, { id, label: '', vertical: false, children: [] }] }))); setTimeout(() => setEditingId(id), 0) }
        return
      }
    }
    setEditingId(null)
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
        onFontFamilyChange={setFontFamily}
        onFontSizeChange={setFontSize}
        extra={(
          <label className="flex items-center gap-1">
            {t('editor.spacing')}
            <input type="number" min={16} max={50} value={spacing}
            className="w-12 px-1 py-0.5 border border-gray-300 rounded text-center text-xs"
            onChange={(e) => setSpacing(Number(e.target.value) || 26)} />
          </label>
        )}
      />

      <TreeNodeRow node={root} depth={0} editingId={editingId} onStartEdit={setEditingId}
        onAddChild={handleAddChild} onDelete={handleDelete} onRename={handleRename} onTab={handleTabFrom} />
      <button onClick={() => onApply(treeToJson(root, fontSize, spacing, fontFamily))}
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
            setRoot({ id: uid(), label: rootLabel, vertical: false, children })
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

function TreeNodeRow({ node, depth, editingId, onStartEdit, onAddChild, onDelete, onRename, onTab }: {
  node: TreeNode; depth: number; editingId: string | null
  onStartEdit: (id: string) => void; onAddChild: (pid: string, label: string) => void
  onDelete: (id: string) => void; onRename: (id: string, label: string) => void; onTab: (id: string) => void
}) {
  const { t } = useTranslation()
  const [adding, setAdding] = useState(false)
  const [childLabel, setChildLabel] = useState('')
  const isEditing = editingId === node.id
  const wrap = depth === 1
  const tc = typeColors[depth] || 'text-gray-500 bg-gray-100 border-gray-200'
  const lbl = depth === 0 ? t('tree.root') : depth === 1 ? t('tree.module') : t('tree.func')

  const confirmAdd = () => {
    const label = childLabel.trim()
    if (!label) return
    onAddChild(node.id, label)
    setChildLabel(''); setAdding(false)
  }

  const row = (
    <>
      <div className="flex items-center gap-1.5 py-1 px-2 rounded hover:bg-gray-100/70 group" style={{ marginLeft: depth >= 2 ? 0 : depth * 16 }}>
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${tc}`}>
          {lbl}
        </span>
        {isEditing ? (
          <InlineEdit value={node.label} className="flex-1"
            onSave={(v) => { onRename(node.id, v); onStartEdit('') }}
            onDelete={() => { onDelete(node.id); onStartEdit('') }}
            onTab={() => onTab(node.id)} />
        ) : (
          <span className={`flex-1 text-sm truncate cursor-default ${depth === 0 ? 'font-semibold' : ''}`}
            onDoubleClick={() => onStartEdit(node.id)}>{node.label}</span>
        )}
        {depth < 2 && <button onClick={() => setAdding(!adding)} className="text-gray-400 hover:text-black text-sm px-1 opacity-0 group-hover:opacity-100 transition-opacity" title={t('tree.addChild')}>+</button>}
        {depth > 0 && (
          <button onClick={() => onDelete(node.id)} className="text-gray-400 hover:text-red-500 text-sm px-1 opacity-0 group-hover:opacity-100 transition-opacity" title={t('editor.delete')}>×</button>
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
          {node.children.map((child) => (
            <TreeNodeRow key={child.id} node={child} depth={depth + 1} editingId={editingId}
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
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showImport, setShowImport] = useState(false)

  const addEntity = () => {
    setState((s) => ({ entities: [...s.entities, { id: uid(), label: t('editor.newEntity'), attributes: [] }] }))
  }
  const removeEntity = (entId: string) => {
    setState((s) => ({ entities: s.entities.filter((e) => e.id !== entId) }))
  }
  const renameEntity = (entId: string, label: string) => {
    setState((s) => ({ entities: s.entities.map((e) => e.id === entId ? { ...e, label } : e) }))
  }
  const addAttr = (entId: string, id: string, label: string) => {
    setState((s) => ({
      entities: s.entities.map((e) => e.id === entId ? { ...e, attributes: [...e.attributes, { id, label }] } : e),
    }))
  }
  const removeAttr = (entId: string, attrId: string) => {
    setState((s) => ({
      entities: s.entities.map((e) => e.id === entId ? { ...e, attributes: e.attributes.filter((a) => a.id !== attrId) } : e),
    }))
    if (editingId === attrId) setEditingId(null)
  }
  const renameAttr = (entId: string, attrId: string, label: string) => {
    setState((s) => ({
      entities: s.entities.map((e) => e.id === entId ? {
        ...e, attributes: e.attributes.map((a) => a.id === attrId ? { ...a, label } : a),
      } : e),
    }))
  }
  const moveAttr = (entId: string, from: number, to: number) => {
    setState((s) => ({
      entities: s.entities.map((e) => {
        if (e.id !== entId) return e
        const arr = [...e.attributes]; const [item] = arr.splice(from, 1); arr.splice(to, 0, item)
        return { ...e, attributes: arr }
      }),
    }))
  }

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
            <AttrList attributes={ent.attributes} editingId={editingId} setEditingId={setEditingId}
              onAdd={(id, l) => addAttr(ent.id, id, l)} onRemove={(id) => removeAttr(ent.id, id)}
              onRename={(id, l) => renameAttr(ent.id, id, l)} onMove={(f, t) => moveAttr(ent.id, f, t)} />
          </div>
        </div>
      ))}

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
                setState((s) => ({ entities: [...s.entities, { id: entId, label: entLabel, attributes: attrs }] }))
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

function AttrList({ attributes, editingId, setEditingId, onAdd, onRemove, onRename, onMove }: {
  attributes: { id: string; label: string }[]
  editingId: string | null; setEditingId: (id: string | null) => void
  onAdd: (id: string, label: string) => void; onRemove: (id: string) => void
  onRename: (id: string, label: string) => void; onMove: (from: number, to: number) => void
}) {
  const { t } = useTranslation()
  const [newLabel, setNewLabel] = useState('')
  const [focusedIdx, setFocusedIdx] = useState<number | null>(null)
  const [dragIdx, setDragIdx] = useState<number | null>(null)

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
          <div key={a.id} draggable={editingId !== a.id} tabIndex={0}
            className={`flex items-center justify-between px-2 py-1 bg-gray-50 border rounded text-sm cursor-default transition-colors ${focusedIdx === i ? 'border-black ring-1 ring-black' : 'border-gray-200'} ${dragIdx === i ? 'opacity-40' : ''}`}
            onDoubleClick={() => setEditingId(a.id)}
            onFocus={() => setFocusedIdx(i)} onBlur={() => setFocusedIdx(null)}
            onKeyDown={(e) => {
              if ((e.key === 'Delete' || e.key === 'Backspace') && editingId !== a.id) onRemove(a.id)
              if (e.key === 'Enter') setEditingId(a.id)
            }}
            onDragStart={() => { if (editingId === a.id) return; setDragIdx(i) }} onDragOver={(e) => e.preventDefault()}
            onDrop={() => { if (dragIdx !== null && dragIdx !== i) onMove(dragIdx, i); setDragIdx(null) }}
            onDragEnd={() => setDragIdx(null)}>
            <span className="text-xs text-gray-300 mr-1 cursor-grab select-none">⋮⋮</span>
            {editingId === a.id ? (
              <InlineEdit value={a.label} className="flex-1"
                onSave={(v) => { onRename(a.id, v); setEditingId(null) }}
                onDelete={() => { onRemove(a.id); setEditingId(null) }}
                onTab={() => {
                  if (i + 1 < attributes.length) { setEditingId(attributes[i + 1].id) }
                  else { const id = uid(); onAdd(id, ''); setTimeout(() => setEditingId(id), 0) }
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
  const [editingId, setEditingId] = useState<string | null>(null)
  const [msgSource, setMsgSource] = useState('')
  const [msgTarget, setMsgTarget] = useState('')
  const [msgLabel, setMsgLabel] = useState('')
  const [dragMsgIdx, setDragMsgIdx] = useState<number | null>(null)
  const [showMermaid, setShowMermaid] = useState(false)
  const [mermaidText, setMermaidText] = useState('')

  const addParticipant = () => {
    const id = uid()
    setParticipants((p) => [...p, { id, label: t('editor.newParticipant'), participantType: 'system' }])
    return id
  }

  const removeParticipant = (id: string) => {
    setParticipants((p) => p.filter((item) => item.id !== id))
    setMessages((m) => m.filter((msg) => msg.source !== id && msg.target !== id))
    if (editingId === id) setEditingId(null)
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

  const handleApply = () => {
    onApply(sequenceToJson({ participants, messages }))
  }

  const handleMermaidImport = () => {
    const result = parseMermaid(mermaidText)
    if (result) {
      setParticipants(result.participants)
      setMessages(result.messages)
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
          <div key={p.id} className="bg-white border border-gray-200 rounded p-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-400">{t('editor.participantLabel')}</span>
              <button onClick={() => removeParticipant(p.id)} className="text-gray-400 hover:text-red-500 text-sm" title={t('editor.deleteParticipant')}>×</button>
            </div>
            {editingId === p.id ? (
              <InlineEdit value={p.label}
                onSave={(v) => { renameParticipant(p.id, v); setEditingId(null) }}
                onDelete={() => { removeParticipant(p.id); setEditingId(null) }}
                onTab={() => {
                  if (i + 1 < participants.length) setEditingId(participants[i + 1].id)
                  else { const newId = addParticipant(); setTimeout(() => setEditingId(newId), 0) }
                }} />
            ) : (
              <div className="text-sm cursor-pointer" onDoubleClick={() => setEditingId(p.id)}>{p.label}</div>
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

      {/* Messages section */}
      {participants.length >= 2 && (
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
              <div key={msg.id} draggable={editingId !== msg.id}
                className={`flex items-center gap-1 px-2 py-1 bg-gray-50 border border-gray-200 rounded text-xs ${dragMsgIdx === i ? 'opacity-40' : ''}`}
                onDragStart={() => { if (editingId === msg.id) return; setDragMsgIdx(i) }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => { if (dragMsgIdx !== null && dragMsgIdx !== i) moveMessage(dragMsgIdx, i); setDragMsgIdx(null) }}
                onDragEnd={() => setDragMsgIdx(null)}>
                <span className="text-xs text-gray-300 mr-1 cursor-grab select-none">⋮⋮</span>
                <span className="text-gray-500 truncate">{getLabel(msg.source)}</span>
                <span className="text-gray-400">→</span>
                <span className="text-gray-500 truncate">{getLabel(msg.target)}</span>
                {editingId === msg.id ? (
                  <InlineEdit value={msg.label} className="flex-1 min-w-0"
                    onSave={(v) => { renameMessage(msg.id, v); setEditingId(null) }}
                    onDelete={() => { removeMessage(msg.id); setEditingId(null) }} />
                ) : (
                  <span className="flex-1 min-w-0 truncate cursor-pointer" onDoubleClick={() => setEditingId(msg.id)}>: {msg.label}</span>
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
      )}

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

function ClassEditor({ onApply }: { onApply: (json: string) => void }) {
  const { t } = useTranslation()
  const [classes, setClasses] = useState<{ id: string; label: string; attributes: string[]; methods: string[]; isAbstract?: boolean; stereotype?: string }[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingField, setEditingField] = useState<'label' | 'attr' | 'method' | null>(null)
  const [newAttr, setNewAttr] = useState('')
  const [newMethod, setNewMethod] = useState('')
  const [showMermaid, setShowMermaid] = useState(false)
  const [mermaidText, setMermaidText] = useState('')
  const [relations, setRelations] = useState<{ id: string; source: string; target: string; relationType: string; label?: string }[]>([])

  const addClass = () => {
    setClasses((c) => [...c, { id: uid(), label: t('editor.newClass'), attributes: [], methods: [] }])
  }

  const removeClass = (id: string) => {
    setClasses((c) => c.filter((item) => item.id !== id))
    if (editingId === id) { setEditingId(null); setEditingField(null) }
  }

  const renameClass = (id: string, label: string) => {
    setClasses((c) => c.map((item) => item.id === id ? { ...item, label } : item))
  }

  const addAttribute = (classId: string) => {
    const label = newAttr.trim()
    if (!label) return
    setClasses((c) => c.map((item) => item.id === classId ? { ...item, attributes: [...item.attributes, label] } : item))
    setNewAttr('')
  }

  const removeAttribute = (classId: string, index: number) => {
    setClasses((c) => c.map((item) => item.id === classId ? { ...item, attributes: item.attributes.filter((_, i) => i !== index) } : item))
  }

  const addMethod = (classId: string) => {
    const label = newMethod.trim()
    if (!label) return
    setClasses((c) => c.map((item) => item.id === classId ? { ...item, methods: [...item.methods, label] } : item))
    setNewMethod('')
  }

  const removeMethod = (classId: string, index: number) => {
    setClasses((c) => c.map((item) => item.id === classId ? { ...item, methods: item.methods.filter((_, i) => i !== index) } : item))
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
        {classes.map((cls) => (
          <div key={cls.id} className="bg-white border border-gray-200 rounded p-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-400">{t('editor.classLabel')}</span>
              <button onClick={() => removeClass(cls.id)} className="text-gray-400 hover:text-red-500 text-sm" title={t('editor.deleteClass')}>×</button>
            </div>
            {editingId === cls.id && editingField === 'label' ? (
              <InlineEdit value={cls.label}
                onSave={(v) => { renameClass(cls.id, v); setEditingId(null); setEditingField(null) }}
                onDelete={() => { removeClass(cls.id) }} />
            ) : (
              <div className="text-sm font-medium cursor-pointer" onDoubleClick={() => { setEditingId(cls.id); setEditingField('label') }}>{cls.label}</div>
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
                  placeholder={t('editor.addAttribute')} value={editingId === cls.id ? newAttr : ''}
                  onChange={(e) => { setEditingId(cls.id); setNewAttr(e.target.value) }}
                  onKeyDown={(e) => { if (e.key === 'Enter') addAttribute(cls.id) }} />
                <button onClick={() => { setEditingId(cls.id); addAttribute(cls.id) }} className="px-1 py-0.5 text-xs bg-black text-white rounded">{t('editor.add')}</button>
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
                  placeholder={t('editor.addMethod')} value={editingId === cls.id ? newMethod : ''}
                  onChange={(e) => { setEditingId(cls.id); setNewMethod(e.target.value) }}
                  onKeyDown={(e) => { if (e.key === 'Enter') addMethod(cls.id) }} />
                <button onClick={() => { setEditingId(cls.id); addMethod(cls.id) }} className="px-1 py-0.5 text-xs bg-black text-white rounded">{t('editor.add')}</button>
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

function ActivityEditor({ onApply }: { onApply: (json: string) => void }) {
  const { t } = useTranslation()
  const [nodes, setNodes] = useState<{ id: string; label: string; nodeType: 'start' | 'end' | 'action' | 'decision' }[]>([])
  const [edges, setEdges] = useState<{ id: string; source: string; target: string; guard?: string }[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showMermaid, setShowMermaid] = useState(false)
  const [mermaidText, setMermaidText] = useState('')

  const addNode = (nodeType: 'action' | 'decision') => {
    setNodes((n) => [...n, { id: uid(), label: nodeType === 'action' ? t('editor.newAction') : t('editor.decisionNode'), nodeType }])
  }

  const addStartEnd = (nodeType: 'start' | 'end') => {
    setNodes((n) => [...n, { id: uid(), label: '', nodeType }])
  }

  const removeNode = (id: string) => {
    setNodes((n) => n.filter((item) => item.id !== id))
    setEdges((e) => e.filter((edge) => edge.source !== id && edge.target !== id))
    if (editingId === id) setEditingId(null)
  }

  const renameNode = (id: string, label: string) => {
    setNodes((n) => n.map((item) => item.id === id ? { ...item, label } : item))
  }

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
          <div key={node.id} className="bg-white border border-gray-200 rounded p-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-400">{node.nodeType}</span>
              <button onClick={() => removeNode(node.id)} className="text-gray-400 hover:text-red-500 text-sm" title={t('editor.deleteAction')}>×</button>
            </div>
            {node.nodeType === 'start' || node.nodeType === 'end' ? (
              <div className="text-sm text-gray-500">{node.nodeType === 'start' ? t('editor.startNode') : t('editor.endNode')}</div>
            ) : (
              editingId === node.id ? (
                <InlineEdit value={node.label}
                  onSave={(v) => { renameNode(node.id, v); setEditingId(null) }}
                  onDelete={() => { removeNode(node.id) }}
                  onTab={() => {
                    if (i + 1 < nodes.length) setEditingId(nodes[i + 1].id)
                  }} />
              ) : (
                <div className="text-sm cursor-pointer" onDoubleClick={() => setEditingId(node.id)}>{node.label}</div>
              )
            )}
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

function DeploymentEditor({ onApply }: { onApply: (json: string) => void }) {
  const { t } = useTranslation()
  const [nodes, setNodes] = useState<{ id: string; label: string; nodeType: 'server' | 'database'; technology?: string }[]>([])
  const [edges, setEdges] = useState<{ id: string; source: string; target: string; label?: string }[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showMermaid, setShowMermaid] = useState(false)
  const [mermaidText, setMermaidText] = useState('')

  const addNode = (nodeType: 'server' | 'database') => {
    setNodes((n) => [...n, { id: uid(), label: t('editor.newServer'), nodeType, technology: '' }])
  }

  const removeNode = (id: string) => {
    setNodes((n) => n.filter((item) => item.id !== id))
    setEdges((e) => e.filter((edge) => edge.source !== id && edge.target !== id))
    if (editingId === id) setEditingId(null)
  }

  const renameNode = (id: string, label: string) => {
    setNodes((n) => n.map((item) => item.id === id ? { ...item, label } : item))
  }

  const setTechnology = (id: string, technology: string) => {
    setNodes((n) => n.map((item) => item.id === id ? { ...item, technology } : item))
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
        <button onClick={() => addNode('server')}
          className="flex-1 py-2 text-sm border-2 border-dashed border-gray-300 rounded hover:border-gray-500 hover:bg-gray-100 text-gray-500">
          {t('editor.addServer')}
        </button>
        <button onClick={() => addNode('database')}
          className="flex-1 py-2 text-sm border-2 border-dashed border-gray-300 rounded hover:border-gray-500 hover:bg-gray-100 text-gray-500">
          {t('editor.addDatabase')}
        </button>
        <button onClick={() => setShowMermaid(true)}
          className="px-3 py-2 text-sm border border-gray-300 rounded hover:bg-gray-100 text-gray-500">
          {t('editor.importMermaid')}
        </button>
      </div>

      <div className="space-y-2">
        {nodes.map((node, i) => (
          <div key={node.id} className="bg-white border border-gray-200 rounded p-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-400">{node.nodeType}</span>
              <button onClick={() => removeNode(node.id)} className="text-gray-400 hover:text-red-500 text-sm" title={t('editor.deleteServer')}>×</button>
            </div>
            {editingId === node.id ? (
              <InlineEdit value={node.label}
                onSave={(v) => { renameNode(node.id, v); setEditingId(null) }}
                onDelete={() => { removeNode(node.id) }}
                onTab={() => {
                  if (i + 1 < nodes.length) setEditingId(nodes[i + 1].id)
                }} />
            ) : (
              <div className="text-sm cursor-pointer" onDoubleClick={() => setEditingId(node.id)}>{node.label}</div>
            )}
            <input className="w-full mt-1 px-1 py-0.5 text-xs border border-gray-300 rounded"
              placeholder={t('editor.techPlaceholder')}
              value={node.technology || ''}
              onChange={(e) => setTechnology(node.id, e.target.value)} />
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
