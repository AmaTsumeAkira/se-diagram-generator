import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { ReactFlowProvider } from '@xyflow/react'
import type { Edge, Node } from '@xyflow/react'
import UseCaseDiagram from './components/diagrams/UseCaseDiagram'
import StructureDiagram from './components/diagrams/StructureDiagram'
import EntityAttributeDiagram from './components/diagrams/EntityAttributeDiagram'
import ERDiagram from './components/diagrams/ERDiagram'
import SequenceDiagram from './components/diagrams/SequenceDiagram'
import ClassDiagram from './components/diagrams/ClassDiagram'
import ActivityDiagram from './components/diagrams/ActivityDiagram'
import DeploymentDiagram from './components/diagrams/DeploymentDiagram'
import NodeEditor from './components/panels/NodeEditor'
import ExportModal from './components/panels/ExportModal'
import ExportDataModal from './components/panels/ExportDataModal'
import SettingsModal from './components/panels/SettingsModal'
import PromoPopup from './components/PromoPopup'
import { useUndoRedo } from './hooks/useUndoRedo'
import type { DiagramNodeData, DiagramType, ConfigMap, ERNotation } from './types/diagram'
import type { UseCaseState, TreeNode, EntityState, SequenceState, ERState, ClassState, ActivityState, DeploymentState } from './components/panels/NodeEditor'
import { useCasePresets, structureNodes, structureEdges, userEntityPreset, erSystemJson, sequenceSystemJson, classSystemJson, activitySystemJson, deploymentSystemJson } from './data/mockData'
import { configsToJson, parseDiagram, jsonToConfigs, normalizeUseCaseConfig, normalizeEntityConfig, TAB_KEYS } from './utils/configSerialize'
import i18n from './i18n'

const LS_KEY = 'diagram-editor-configs'

const tabKeys = TAB_KEYS

// localStorage 安全操作
function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch (e) {
    console.warn('Failed to read from localStorage:', e)
    return null
  }
}

function safeSetItem(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value)
    return true
  } catch (e) {
    console.warn('Failed to write to localStorage:', e)
    return false
  }
}

function safeRemoveItem(key: string): boolean {
  try {
    localStorage.removeItem(key)
    return true
  } catch (e) {
    console.warn('Failed to remove from localStorage:', e)
    return false
  }
}

// 说明：图表配置的（反）序列化统一由 utils/configSerialize 提供，
// 排除式字段策略保证 ER 图绝对坐标 x/y 等不会在持久化 / 导出时被漏掉。

// ====== Config → Editor state (for undo sync) ======

function configToUseCaseState(cfg: { nodes: Node<DiagramNodeData>[]; edges: Edge[] }): UseCaseState {
  // 用例之间相互独立：列表顺序取「该角色自己的关联边顺序」，
  // 而不是全局节点数组顺序（否则别的角色块里的节点会插到前面，顺序错乱）。
  const firstById = new Map<string, Node<DiagramNodeData>>()
  for (const n of cfg.nodes) if (!firstById.has(n.id)) firstById.set(n.id, n)

  const actors: Node<DiagramNodeData>[] = []
  const seenActor = new Set<string>()
  for (const n of cfg.nodes) {
    if (n.type !== 'actor' || seenActor.has(n.id)) continue
    seenActor.add(n.id)
    actors.push(n)
  }

  const styleSource = cfg.nodes[0]?.data
  return {
    fontFamily: (styleSource?.fontFamily as string) || 'SimSun',
    fontSize: (styleSource?.fontSize as number) || 14,
    actors: actors.map((actor) => {
      const seen = new Set<string>()
      const useCases: { id: string; label: string }[] = []
      for (const e of cfg.edges) {
        if (String(e.source) !== actor.id) continue
        const target = String(e.target)
        if (seen.has(target)) continue
        seen.add(target)
        const node = firstById.get(target)
        if (!node || node.type !== 'usecase') continue
        useCases.push({ id: node.id, label: (node.data.label as string) || '' })
      }
      return {
        id: actor.id,
        label: (actor.data.label as string) || '角色',
        useCases,
      }
    }),
  }
}

type TreeStateLike = { roots: TreeNode[] }

/**
 * 功能结构图：配置 → 编辑器状态（**森林**，不是单棵树）。
 *
 * 历史缺陷：旧实现只取「第一个无入边的节点」当根，
 * - 配置里有多个顶层模块时，其余模块及其子树在「应用修改」后被静默删除；
 * - 配置里有环（数据损坏 / 手工导入）时 `build()` 无 visited，直接 `Maximum call stack size exceeded` 把整个应用打白；
 * - 没有任何根（纯环）或空配置时伪造 `{id:'root',label:'系统'}`，应用后被写回成真实数据，覆盖用户内容。
 *
 * 现在：DFS 带 visited（防环 / 防 DAG 重复），未被任何根覆盖的节点再作为新根补上（不丢数据），
 * 无节点时返回空森林（编辑器显示空态 + 「添加根节点」，绝不伪造节点）。
 */
function configToTreeState(cfg: { nodes: Node<DiagramNodeData>[]; edges: Edge[] }): TreeStateLike {
  const nodeMap = new Map<string, Node<DiagramNodeData>>()
  for (const n of cfg.nodes) if (!nodeMap.has(n.id)) nodeMap.set(n.id, n)

  const childrenMap = new Map<string, string[]>()
  for (const e of cfg.edges) {
    const source = String(e.source)
    const target = String(e.target)
    if (!nodeMap.has(source) || !nodeMap.has(target)) continue
    const list = childrenMap.get(source) || []
    if (!list.includes(target)) list.push(target)
    childrenMap.set(source, list)
  }

  const styleSource = cfg.nodes[0]?.data
  const fontFamily = (styleSource?.fontFamily as string) || 'SimSun'
  const fontSize = (styleSource?.fontSize as number) || 14
  const spacing = (styleSource?.spacing as number) || 26

  const hasParent = new Set(cfg.edges.map((e) => String(e.target)))
  const visited = new Set<string>()

  function build(id: string, depth: number): TreeNode {
    visited.add(id)
    const node = nodeMap.get(id)
    const children = (childrenMap.get(id) || [])
      .filter((cid) => nodeMap.has(cid))
      .map((cid) => visited.has(cid)
        // 已访问过的子节点（共享子节点 / 环的回边）：浅拷贝成叶子 ——
        // 既保留这条边（否则「应用修改」会把 p2→shared 静默删掉），又不会无限递归。
        // 编辑器用「父级维度编辑态键」区分两处副本，treeToJson 会按 id 去重节点但保留每条边。
        ? {
            id: cid,
            label: (nodeMap.get(cid)?.data.label as string) || cid,
            vertical: (nodeMap.get(cid)?.data.vertical as boolean) || depth + 1 >= 2,
            children: [] as TreeNode[],
          }
        : build(cid, depth + 1))
    return {
      id,
      label: (node?.data.label as string) || id,
      vertical: (node?.data.vertical as boolean) || depth >= 2,
      fontSize: depth === 0 ? ((node?.data.fontSize as number) || fontSize) : undefined,
      fontFamily: depth === 0 ? ((node?.data.fontFamily as string) || fontFamily) : undefined,
      spacing: depth === 0 ? ((node?.data.spacing as number) || spacing) : undefined,
      children,
    }
  }

  const roots: TreeNode[] = []
  // 第一轮：真正的顶层节点（无入边），保持配置顺序
  for (const n of cfg.nodes) {
    if (hasParent.has(n.id) || visited.has(n.id)) continue
    roots.push(build(n.id, 0))
  }
  // 第二轮：只出现在环里 / 不可达的节点 —— 让它们各自成根，既不丢数据也不会无限递归
  for (const n of cfg.nodes) {
    if (visited.has(n.id)) continue
    roots.push(build(n.id, 0))
  }
  return { roots }
}

function configToEntityState(cfg: { nodes: Node<DiagramNodeData>[]; edges: Edge[] }): EntityState {
  const firstById = new Map<string, Node<DiagramNodeData>>()
  for (const n of cfg.nodes) if (!firstById.has(n.id)) firstById.set(n.id, n)

  const entities: Node<DiagramNodeData>[] = []
  const seenEntity = new Set<string>()
  for (const n of cfg.nodes) {
    if (n.type !== 'rectangle' || seenEntity.has(n.id)) continue
    seenEntity.add(n.id)
    entities.push(n)
  }

  const styleSource = cfg.nodes[0]?.data
  const usedAttributeIds = new Set<string>()
  const stateEntities = entities.map((ent) => {
    const seen = new Set<string>()
    const attributes: { id: string; label: string }[] = []
    // 按该实体的出边顺序收集属性（列表顺序 = 图上顺序），同 id 只保留一条
    for (const e of cfg.edges) {
      if (String(e.source) !== ent.id) continue
      const target = String(e.target)
      if (seen.has(target)) continue
      const node = firstById.get(target)
      if (!node || node.type !== 'ellipse') continue
      seen.add(target)
      usedAttributeIds.add(target)
      attributes.push({ id: node.id, label: (node.data.label as string) || '' })
    }
    return {
      id: ent.id,
      label: (ent.data.label as string) || '实体',
      attributes,
    }
  })

  // 未被任何实体引用的椭圆：保留并在编辑器「未关联属性」区块里可管理，不再静默删除
  const unlinkedAttributes: { id: string; label: string }[] = []
  const seenUnlinked = new Set<string>()
  for (const n of cfg.nodes) {
    if (n.type !== 'ellipse' || usedAttributeIds.has(n.id) || seenUnlinked.has(n.id)) continue
    seenUnlinked.add(n.id)
    unlinkedAttributes.push({ id: n.id, label: (n.data.label as string) || '' })
  }

  return {
    fontFamily: (styleSource?.fontFamily as string) || 'SimSun',
    fontSize: (styleSource?.fontSize as number) || 14,
    entities: stateEntities,
    unlinkedAttributes,
  } as EntityState & { unlinkedAttributes: { id: string; label: string }[] }
}

function configToSequenceState(cfg: { nodes: Node<DiagramNodeData>[]; edges: Edge[] }): SequenceState {
  const participants = cfg.nodes.filter((n) => n.type === 'participant').map((p) => ({
    id: p.id,
    label: (p.data.label as string) || '',
    participantType: ((p.data as any).participantType || 'system') as 'actor' | 'system' | 'database',
  }))
  // 编辑器不建模的节点（例如 activation）与它们相关的边：原样带着走，避免「应用修改」时被吞
  const extraNodes = cfg.nodes
    .filter((n) => n.type !== 'participant')
    .map((n) => ({ id: n.id, type: String(n.type), data: { ...(n.data as Record<string, unknown>) } }))
  const participantIds = new Set(participants.map((p) => p.id))
  const extraNodeIds = new Set(extraNodes.map((n) => n.id))
  const messages = cfg.edges
    .filter((e) => participantIds.has(String(e.source)) && participantIds.has(String(e.target)))
    .map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: (e.label as string) || (e as any).data?.label || '',
      messageType: (((e as any).data?.messageType || 'sync') as 'sync' | 'async' | 'return'),
    }))
  const extraEdges = cfg.edges.filter(
    (e) => extraNodeIds.has(String(e.source)) || extraNodeIds.has(String(e.target)),
  )
  return {
    participants,
    messages,
    extraNodes,
    extraEdges,
  } as SequenceState & { extraNodes: { id: string; type: string; data: Record<string, unknown> }[]; extraEdges: Edge[] }
}

function configToERState(cfg: { nodes: Node<DiagramNodeData>[]; edges: Edge[] }): ERState {
  const entities = cfg.nodes.filter((n) => n.type === 'erEntity').map((n) => ({
    id: n.id,
    label: (n.data.label as string) || '',
    row: n.data.row as number | undefined,
    col: n.data.col as number | undefined,
    group: n.data.group as string | undefined,
    x: n.data.x as number | undefined,
    y: n.data.y as number | undefined,
    fields: n.data.fields as ERState['entities'][number]['fields'],
  }))

  // Reconstruct relationships from diamond nodes + edges
  const diamonds = cfg.nodes.filter((n) => n.type === 'erDiamond')
  const relationships: ERState['relationships'] = []

  for (const dia of diamonds) {
    const relId = dia.id.replace(/^(dia_)+/, '')
    const diamondX = dia.data.x as number | undefined
    const diamondY = dia.data.y as number | undefined

    // 优先：显式几何（一条完整正交折线边 e_<relId>）
    const lineEdge = cfg.edges.find((e) => e.id === `e_${relId}`)
    if (lineEdge) {
      const d = (lineEdge.data as Record<string, unknown> | undefined) || {}
      relationships.push({
        id: relId,
        label: (dia.data.label as string) || '',
        source: lineEdge.source,
        target: lineEdge.target,
        sourceCard: (d.sourceCard as string) || '1',
        targetCard: (d.targetCard as string) || 'N',
        diamondX,
        diamondY,
        line: d.line as number[][] | undefined,
      })
      continue
    }

    // 回退：自动布局（实体->菱形 / 菱形->实体 两段边）
    const inEdge = cfg.edges.find((e) => e.target === dia.id)
    const outEdge = cfg.edges.find((e) => e.source === dia.id)
    if (inEdge && outEdge) {
      relationships.push({
        id: relId,
        label: (dia.data.label as string) || '',
        source: inEdge.source,
        target: outEdge.target,
        sourceCard: (inEdge.data?.sourceCard as string) || '1',
        targetCard: (outEdge.data?.targetCard as string) || 'N',
        diamondX,
        diamondY,
      })
    }
  }

  return { entities, relationships }
}

const CLASS_NODE_TYPES = ['class', 'interface', 'enum'] as const

function configToClassState(cfg: { nodes: Node<DiagramNodeData>[]; edges: Edge[] }): ClassState {
  // 旧实现只认 type==='class'：默认示例里的 «interface» Notifiable（type:'interface'）在编辑器里根本不可见，
  // 点一次「应用修改」就被永久删除，还留下 2 条悬空关系。现在保留 class/interface/enum 并带出 type。
  const classes = cfg.nodes
    .filter((n) => (CLASS_NODE_TYPES as readonly string[]).includes(String(n.type)))
    .map((n) => ({
      id: n.id,
      label: (n.data.label as string) || '',
      attributes: (n.data.attributes as string[]) || [],
      methods: (n.data.methods as string[]) || [],
      isAbstract: n.data.isAbstract as boolean | undefined,
      stereotype: n.data.stereotype as string | undefined,
      type: String(n.type) as 'class' | 'interface' | 'enum',
    }))
  const classIds = new Set(classes.map((c) => c.id))
  // 端点已不存在的边（悬空关系）不再带进编辑器，避免越积越多
  const relations = cfg.edges
    .filter((e) => classIds.has(String(e.source)) && classIds.has(String(e.target)))
    .map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      relationType: (e.data?.relationType as string) || 'association',
      label: (e.data?.label as string) || undefined,
    }))
  return { classes, relations } as ClassState & { classes: (ClassState['classes'][number] & { type: 'class' | 'interface' | 'enum' })[] }
}

function configToActivityState(cfg: { nodes: Node<DiagramNodeData>[]; edges: Edge[] }): ActivityState {
  const nodes = cfg.nodes.map((n) => ({
    id: n.id,
    label: (n.data.label as string) || '',
    nodeType: (n.type as ActivityState['nodes'][number]['nodeType']) || 'action',
  }))
  const edges = cfg.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    // 渲染层（drawio/SVG）同时认 data.guard、data.label、顶层 label；
    // 读入侧只认 data.guard 会导致「图上看得到、应用一次就没了」
    guard: (e.data?.guard as string) || (e.data?.label as string) || (e.label as string) || undefined,
  }))
  return { nodes, edges }
}

function configToDeploymentState(cfg: { nodes: Node<DiagramNodeData>[]; edges: Edge[] }): DeploymentState {
  // 白名单必须与 types/diagram.ts 的 DeploymentNodeType 对齐（曾漏 browser/mobile → 被悄悄改成 server）
  const DEPLOY_TYPES = ['server', 'database', 'component', 'artifact', 'node', 'browser', 'mobile']
  const nodes = cfg.nodes.map((n) => ({
    id: n.id,
    label: (n.data.label as string) || '',
    nodeType: (DEPLOY_TYPES.includes(String(n.type))
      ? n.type
      : 'server') as DeploymentState['nodes'][number]['nodeType'],
    technology: (n.data.technology as string) || undefined,
  }))
  const edges = cfg.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: (e.data?.label as string) || (e.label as string) || undefined,
  }))
  return { nodes, edges }
}

// ====== Initial data ======

const initialConfigs: ConfigMap = {
  // 默认给整个系统的完整用例图（全部角色 + 全部用例），而不是单个角色那一份
  usecase: normalizeUseCaseConfig(parseDiagram(useCasePresets.system.json)),
  structure: parseDiagram(JSON.stringify({
    nodes: structureNodes.map((n) => ({ id: n.id, type: n.type, label: n.data.label, vertical: n.data.vertical })),
    edges: structureEdges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
  })),
  entity: parseDiagram(JSON.stringify({
    nodes: [
      { id: userEntityPreset.entity.id, type: 'rectangle', label: userEntityPreset.entity.data.label },
      ...userEntityPreset.attributes.map((a) => ({ id: a.id, type: 'ellipse', label: a.data.label, rx: 45, ry: 18 })),
    ],
    edges: userEntityPreset.edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
  })),
  er: parseDiagram(erSystemJson),
  sequence: parseDiagram(sequenceSystemJson),
  class: parseDiagram(classSystemJson),
  activity: parseDiagram(activitySystemJson),
  deployment: parseDiagram(deploymentSystemJson),
}

function loadConfigs(): ConfigMap {
  const raw = safeGetItem(LS_KEY)
  if (raw) {
    try {
      const restored = jsonToConfigs(raw)
      if (restored) return restored
    } catch { /* ignore */ }
  }
  return initialConfigs
}

// ====== Shortcut Help ======

// ====== App ======

function App() {
  const { t } = useTranslation()
  const [active, setActive] = useState<DiagramType>('usecase')
  const [configVersion, setConfigVersion] = useState(0)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const flowRef = useRef<HTMLDivElement>(null)
  const toggleLang = () => { const next = i18n.language === 'zh' ? 'en' : 'zh'; i18n.changeLanguage(next); safeSetItem('lang', next) }

  const { present: configs, push: pushConfigs, undo, redo, canUndo, canRedo } = useUndoRedo<ConfigMap>(loadConfigs())

  // Persist to localStorage
  useEffect(() => {
    safeSetItem(LS_KEY, configsToJson(configs))
  }, [configs])

  // Increment version when configs change (apply / undo / redo / import)
  useEffect(() => {
    setConfigVersion((v) => v + 1)
  }, [configs])

  // ? key → toggle shortcut panel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      const editable = tag === 'INPUT' || tag === 'TEXTAREA' || !!target?.isContentEditable
      if (e.key === '?' && !editable) {
        e.preventDefault()
        setShowShortcuts((s) => !s)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const handleApply = useCallback(
    (json: string) => {
      try {
        const result = parseDiagram(json)
        // 用例图 / 实体属性图：应用时归一化，保证「一个子节点只属于一个父级」
        // （否则共享子节点会在配置 ↔ 编辑态之间交叉放大）
        const normalized =
          active === 'usecase' ? normalizeUseCaseConfig(result)
            : active === 'entity' ? normalizeEntityConfig(result)
              : result
        pushConfigs({ ...configs, [active]: normalized })
      } catch { /* ignore */ }
    },
    [active, configs, pushConfigs]
  )

  // ====== Derive editor states from configs ======
  const ucState = useMemo(() => configToUseCaseState(configs.usecase), [configs.usecase])
  const treeState = useMemo(() => configToTreeState(configs.structure), [configs.structure])
  const entityState = useMemo(() => configToEntityState(configs.entity), [configs.entity])
  const erState = useMemo(() => configToERState(configs.er), [configs.er])
  const seqState = useMemo(() => configToSequenceState(configs.sequence), [configs.sequence])
  const classState = useMemo(() => configToClassState(configs.class), [configs.class])
  const activityState = useMemo(() => configToActivityState(configs.activity), [configs.activity])
  const deploymentState = useMemo(() => configToDeploymentState(configs.deployment), [configs.deployment])

  // ====== Derive diagram data ======
  const useCaseGroups = useMemo(() => {
    const cfg = configs.usecase
    const actors = cfg.nodes.filter((n) => n.type === 'actor')
    return actors.map((actor) => {
      const actorEdges = cfg.edges.filter((e) => e.source === actor.id)
      const ids = new Set(actorEdges.map((e) => e.target))
      return {
        actor,
        useCases: cfg.nodes.filter((n) => n.type === 'usecase' && ids.has(n.id)),
        edges: actorEdges,
      }
    })
  }, [configs.usecase])

  const entityGroups = useMemo(() => {
    const cfg = configs.entity
    const entities = cfg.nodes.filter((n) => n.type === 'rectangle')
    return entities.map((ent) => {
      const entEdges = cfg.edges.filter((e) => e.source === ent.id)
      const ids = new Set(entEdges.map((e) => e.target))
      return {
        entity: ent,
        attributes: cfg.nodes.filter((n) => n.type === 'ellipse' && ids.has(n.id)),
        edges: entEdges,
      }
    })
  }, [configs.entity])

  // ====== Modal state ======
  const [showExport, setShowExport] = useState(false)
  const [showDataExport, setShowDataExport] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [pendingImport, setPendingImport] = useState<ConfigMap | null>(null)
  // ER 图表示法（chen=陈氏 / entity=实体直连 / attribute=字段环绕 / table=表格型）
  const [erNotation, setErNotation] = useState<ERNotation>(() => {
    try {
      const saved = localStorage.getItem('diagram-er-notation')
      if (saved === 'entity' || saved === 'attribute' || saved === 'table' || saved === 'chen') return saved
    } catch { /* 忽略隐私模式等异常 */ }
    return 'chen'
  })
  const changeErNotation = (n: ERNotation) => {
    setErNotation(n)
    try {
      localStorage.setItem('diagram-er-notation', n)
    } catch { /* 忽略 */ }
  }
  const [showGrid, setShowGrid] = useState(true)

  // ====== Reset ======
  const handleReset = () => {
    if (!window.confirm(t('reset.confirm'))) return
    safeRemoveItem(LS_KEY)
    pushConfigs(initialConfigs)
  }

  // ====== Import ======
  const parseQuickFormat = (text: string, type: DiagramType) => {
    const lines = text.trim().split('\n').filter(Boolean).map((l) => l.trim().split(/\s+/))
    if (lines.length === 0) return null

    if (type === 'structure') {
      const rootLabel = lines[0][0] || '系统'
      const nodes: Node<DiagramNodeData>[] = [{ id: 'root', type: 'rectangle', data: { label: rootLabel }, position: { x: 0, y: 0 } }]
      const edges: Edge[] = []
      lines.slice(1).forEach((words, mi) => {
        if (words.length < 1) return
        const modId = `m${mi}`; const modLabel = words[0]
        nodes.push({ id: modId, type: 'rectangle', data: { label: modLabel }, position: { x: 0, y: 0 } })
        edges.push({ id: `e_root_${modId}`, source: 'root', target: modId })
        words.slice(1).forEach((w, fi) => {
          const fId = `${modId}_f${fi}`
          nodes.push({ id: fId, type: 'rectangle', data: { label: w, vertical: true }, position: { x: 0, y: 0 } })
          edges.push({ id: `e_${modId}_${fId}`, source: modId, target: fId })
        })
      })
      return { nodes, edges }
    }

    const sourceType = type === 'usecase' ? 'actor' : 'rectangle'
    const targetType = type === 'usecase' ? 'usecase' : 'ellipse'
    const nodes: Node<DiagramNodeData>[] = []; const edges: Edge[] = []
    lines.forEach((words, ai) => {
      if (words.length < 1) return
      const srcId = `s${ai}`; const srcLabel = words[0]
      nodes.push({ id: srcId, type: sourceType, data: { label: srcLabel }, position: { x: 0, y: 0 } })
      words.slice(1).forEach((w, ti) => {
        const tId = `${srcId}_t${ti}`
        nodes.push({ id: tId, type: targetType, data: { label: w, rx: type === 'usecase' ? 60 : 45, ry: type === 'usecase' ? 15 : 18 }, position: { x: 0, y: 0 } })
        edges.push({ id: `e_${srcId}_${ti}`, source: srcId, target: tId })
      })
    })
    return { nodes, edges }
  }

  const emptyConfig = { nodes: [], edges: [] }
  const mdSectionMap: Record<string, DiagramType> = {
    '用例图': 'usecase', 'Use Case': 'usecase',
    '功能结构图': 'structure', 'Structure': 'structure',
    '实体属性图': 'entity', 'Entity': 'entity', 'E-R Diagram': 'entity',
    '总体ER图': 'er', 'ER Diagram': 'er',
    '时序图': 'sequence', 'Sequence': 'sequence',
    '类图': 'class', 'Class': 'class', 'Class Diagram': 'class',
    '活动图': 'activity', 'Activity': 'activity',
    '部署图': 'deployment', 'Deployment': 'deployment',
  }
  // 纯文本快速导入只支持这三种图（其余图的节点语义无法用「空格分隔的层级文本」表达）
  const quickFormatTypes: DiagramType[] = ['usecase', 'structure', 'entity']
  const emptyConfigMap = (): ConfigMap => ({
    usecase: { ...emptyConfig }, structure: { ...emptyConfig }, entity: { ...emptyConfig },
    er: { ...emptyConfig }, sequence: { ...emptyConfig }, class: { ...emptyConfig },
    activity: { ...emptyConfig }, deployment: { ...emptyConfig },
  })

  const handleImport = () => {
    const input = document.createElement('input')
    input.type = 'file'; input.accept = '.json,.txt,.md'
    input.onchange = (e: any) => {
      const file = e.target?.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        const text = reader.result as string
        const trimmed = text.trim()
        let importConfigs: ConfigMap | null = null
        // JSON（对象或数组都走 JSON 分支：数组交给 jsonToConfigs 判定为非法并提示）
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
          importConfigs = jsonToConfigs(text)
          if (!importConfigs) { alert(t('import.jsonError')); return }
        }
        // MD format —— 合并式：只覆盖文件里出现的节，其余图保持现状（旧实现会把其余 5 张图清空）
        else if (text.includes('\n# ') || text.startsWith('# ')) {
          const sections = text.split(/(?=^# )/m)
          const nextConfigs: ConfigMap = { ...configs }
          let hasData = false
          sections.forEach((sec) => {
            const lines = sec.trim().split('\n')
            const header = lines[0].replace(/^# /, '').trim()
            const type = mdSectionMap[header]
            if (!type) return
            const body = lines.slice(1).join('\n').trim()
            if (!body) return
            const result = parseQuickFormat(body, type)
            if (result) { nextConfigs[type] = result; hasData = true }
          })
          if (hasData) importConfigs = nextConfigs
          else { alert(t('import.mdError')); return }
        }
        // Plain quick format
        else {
          if (!quickFormatTypes.includes(active)) { alert(t('import.quickUnsupported')); return }
          const result = parseQuickFormat(text, active)
          if (result) importConfigs = { ...emptyConfigMap(), [active]: result }
          else { alert(t('import.quickError')); return }
        }
        setPendingImport(importConfigs)
      }
      reader.readAsText(file)
    }
    input.click()
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Top Navigation */}
      <header className="flex items-center gap-1 px-4 py-2 border-b border-gray-200 bg-white shrink-0">
        <h1 className="text-base font-bold mr-4">{t('app.title')}</h1>
        {tabKeys.map((key) => (
          <button key={key} onClick={() => setActive(key)}
            className={`px-3 py-1 rounded text-sm font-medium transition-colors ${active === key ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
            {t(`app.${key}`)}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-1">
          <button onClick={undo} disabled={!canUndo} className="px-2 py-1 text-xs border rounded disabled:opacity-30 hover:bg-gray-50" title="Ctrl+Z">{t('toolbar.undo')}</button>
          <button onClick={redo} disabled={!canRedo} className="px-2 py-1 text-xs border rounded disabled:opacity-30 hover:bg-gray-50" title="Ctrl+Y">{t('toolbar.redo')}</button>
          <span className="w-px h-5 bg-gray-300 mx-1" />
          <button onClick={handleImport} className="px-2 py-1 text-xs border rounded hover:bg-gray-50">{t('toolbar.import')}</button>
          <button onClick={() => setShowDataExport(true)} className="px-2 py-1 text-xs border rounded hover:bg-gray-50">{t('toolbar.exportData')}</button>
          <button onClick={() => setShowExport(true)} className="px-3 py-1 text-xs bg-black text-white rounded hover:bg-gray-800">{t('toolbar.exportImage')}</button>
          <span className="w-px h-5 bg-gray-300 mx-1" />
          <button onClick={() => setShowSettings(true)} className="px-2 py-1 text-xs border rounded hover:bg-gray-50" title={t('toolbar.settings')}>{t('toolbar.settings')}</button>
          <button onClick={handleReset} className="px-2 py-1 text-xs text-red-400 border border-red-200 rounded hover:bg-red-50 ml-1">{t('toolbar.reset')}</button>
          <button onClick={() => setShowShortcuts(true)} className="px-2 py-1 text-xs text-gray-400 border rounded hover:bg-gray-50 ml-1" title={t('toolbar.shortcuts')}>?</button>
          <button onClick={() => setShowGrid(!showGrid)} className={`px-2 py-1 text-xs border rounded hover:bg-gray-50 ml-1 ${!showGrid ? 'text-red-400 border-red-200' : ''}`}>{showGrid ? t('toolbar.gridOn') : t('toolbar.gridOff')}</button>
          <button onClick={toggleLang} className="px-2 py-1 text-xs border rounded hover:bg-gray-50 ml-1">{t('toolbar.lang')}</button>
          {active === 'er' && (
            <div className="flex items-center gap-0.5 ml-2 pl-2 border-l" title={t('editor.erNotationHint')}>
              <span className="text-[10px] text-gray-400 mr-1">{t('editor.erNotation')}</span>
              {([
                ['chen', t('editor.erNotationChen')],
                ['entity', t('editor.erNotationEntity')],
                ['attribute', t('editor.erNotationAttribute')],
                ['table', t('editor.erNotationTable')],
              ] as [ERNotation, string][]).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => changeErNotation(key)}
                  className={`px-2 py-1 text-xs border rounded ${erNotation === key ? 'bg-black text-white border-black' : 'hover:bg-gray-50'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {active === 'usecase' && <NodeEditor key={`usecase-${configVersion}`} type="usecase" useCase={ucState} onApply={handleApply} />}
        {active === 'structure' && <NodeEditor key={`structure-${configVersion}`} type="structure" tree={treeState} onApply={handleApply} />}
        {active === 'entity' && <NodeEditor key={`entity-${configVersion}`} type="entity" entity={entityState} onApply={handleApply} />}
        {/* ER 编辑器不再按 configVersion 重挂载：内部用 useEffect 同步 state，
            sqlText / 合并M:N / AI布局 / 中心实体 这些输入不会在「应用修改」后被打回原状 */}
        {active === 'er' && <NodeEditor type="er" er={erState} onApply={handleApply} />}
        {active === 'sequence' && <NodeEditor key={`sequence-${configVersion}`} type="sequence" sequence={seqState} onApply={handleApply} />}
        {active === 'class' && <NodeEditor key={`class-${configVersion}`} type="class" classState={classState} onApply={handleApply} />}
        {active === 'activity' && <NodeEditor key={`activity-${configVersion}`} type="activity" activity={activityState} onApply={handleApply} />}
        {active === 'deployment' && <NodeEditor key={`deployment-${configVersion}`} type="deployment" deployment={deploymentState} onApply={handleApply} />}

        <div className="flex-1" ref={flowRef}>
          <ReactFlowProvider>
            {active === 'usecase' && useCaseGroups.length > 0 && (
              <UseCaseDiagram groups={useCaseGroups} showGrid={showGrid} />
            )}
            {active === 'usecase' && useCaseGroups.length === 0 && (
              <div className="flex items-center justify-center h-full text-gray-400">{t('editor.addActor')}</div>
            )}
            {active === 'entity' && entityGroups.length > 0 && (
              <EntityAttributeDiagram groups={entityGroups} showGrid={showGrid} />
            )}
            {active === 'entity' && entityGroups.length === 0 && (
              <div className="flex items-center justify-center h-full text-gray-400">{t('editor.addEntityNode')}</div>
            )}
          </ReactFlowProvider>
          {/* drawio iframe diagrams */}
          {active === 'structure' && (
            <StructureDiagram nodes={configs.structure.nodes} edges={configs.structure.edges} />
          )}
          {active === 'er' && configs.er.nodes.length > 0 && (
            <ERDiagram key={`er-${configVersion}`} nodes={configs.er.nodes} edges={configs.er.edges} notation={erNotation} />
          )}
          {active === 'er' && configs.er.nodes.length === 0 && (
            <div className="flex items-center justify-center h-full text-gray-400">{t('editor.addErEntityHint')}</div>
          )}
          {active === 'sequence' && configs.sequence.nodes.length > 0 && (
            <SequenceDiagram nodes={configs.sequence.nodes} edges={configs.sequence.edges} />
          )}
          {active === 'sequence' && configs.sequence.nodes.length === 0 && (
            <div className="flex items-center justify-center h-full text-gray-400">{t('editor.addParticipantHint')}</div>
          )}
          {active === 'class' && configs.class.nodes.length > 0 && (
            <ClassDiagram nodes={configs.class.nodes} edges={configs.class.edges} />
          )}
          {active === 'class' && configs.class.nodes.length === 0 && (
            <div className="flex items-center justify-center h-full text-gray-400">{t('editor.addClassHint')}</div>
          )}
          {active === 'activity' && configs.activity.nodes.length > 0 && (
            <ActivityDiagram nodes={configs.activity.nodes} edges={configs.activity.edges} />
          )}
          {active === 'activity' && configs.activity.nodes.length === 0 && (
            <div className="flex items-center justify-center h-full text-gray-400">{t('editor.addActivityHint')}</div>
          )}
          {active === 'deployment' && configs.deployment.nodes.length > 0 && (
            <DeploymentDiagram nodes={configs.deployment.nodes} edges={configs.deployment.edges} />
          )}
          {active === 'deployment' && configs.deployment.nodes.length === 0 && (
            <div className="flex items-center justify-center h-full text-gray-400">{t('editor.addDeploymentHint')}</div>
          )}
        </div>
      </div>

      {/* Modals */}
      {showExport && <ExportModal active={active} config={configs[active as DiagramType]} erNotation={erNotation} flowRef={flowRef} onClose={() => setShowExport(false)} />}
      {showDataExport && <ExportDataModal configs={configs} onClose={() => setShowDataExport(false)} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}

      {/* 右下角推广二维码弹窗 */}
      <PromoPopup />
      {/* Import confirm modal */}
      {pendingImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-lg shadow-xl p-6 w-80">
            <p className="text-sm mb-4">{t('import.confirmTitle')}</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setPendingImport(null)}
                className="px-4 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50">{t('import.cancel')}</button>
              <button onClick={() => { pushConfigs(pendingImport); setPendingImport(null) }}
                className="px-4 py-1.5 text-sm bg-black text-white rounded hover:bg-gray-800">{t('import.confirm')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Shortcut Help Modal */}
      {showShortcuts && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setShowShortcuts(false)}>
          <div className="bg-white rounded-lg shadow-xl p-6 min-w-[320px]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold">{t('shortcuts.title')}</h3>
              <button onClick={() => setShowShortcuts(false)} className="text-gray-400 hover:text-black text-lg leading-none">×</button>
            </div>
            <div className="space-y-2">
              {(t('shortcuts.list', { returnObjects: true }) as { keys: string; desc: string }[]).map((s) => (
                <div key={s.keys} className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">{s.desc}</span>
                  <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded text-xs font-mono text-gray-700">{s.keys}</kbd>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
