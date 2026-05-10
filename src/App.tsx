import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { ReactFlowProvider } from '@xyflow/react'
import type { Edge, Node } from '@xyflow/react'
import UseCaseDiagram from './components/diagrams/UseCaseDiagram'
import StructureDiagram from './components/diagrams/StructureDiagram'
import EntityAttributeDiagram from './components/diagrams/EntityAttributeDiagram'
import NodeEditor from './components/panels/NodeEditor'
import ExportModal from './components/panels/ExportModal'
import ExportDataModal from './components/panels/ExportDataModal'
import { useUndoRedo } from './hooks/useUndoRedo'
import type { DiagramNodeData } from './types/diagram'
import type { UseCaseState, TreeNode, EntityState } from './components/panels/NodeEditor'
import { useCasePresets, structureNodes, structureEdges, userEntityPreset } from './data/mockData'
import i18n from './i18n'

type DiagramType = 'usecase' | 'structure' | 'entity'

const LS_KEY = 'diagram-editor-configs'

const tabKeys: DiagramType[] = ['usecase', 'structure', 'entity']

// ====== JSON ↔ config ======

export type ConfigMap = Record<DiagramType, { nodes: Node<DiagramNodeData>[]; edges: Edge[] }>

function parseConfigJson(text: string): { nodes: Node<DiagramNodeData>[]; edges: Edge[] } {
  const data = JSON.parse(text)
  const nodes: Node<DiagramNodeData>[] = (data.nodes || []).map((n: any) => ({
    id: String(n.id),
    type: n.type ?? 'rectangle',
    data: {
      label: String(n.label ?? n.id),
      rx: n.rx as number | undefined,
      ry: n.ry as number | undefined,
      vertical: n.vertical as boolean | undefined,
      nodeH: n.nodeH as number | undefined,
      fontSize: n.fontSize as number | undefined,
      spacing: n.spacing as number | undefined,
    },
    position: { x: 0, y: 0 },
  }))
  const edges: Edge[] = (data.edges || []).map((e: any, i: number) => ({
    id: e.id ?? `edge_${i}`,
    source: String(e.source),
    target: String(e.target),
  }))
  return { nodes, edges }
}

function configsToJson(configs: ConfigMap): string {
  const flat: Record<string, any> = {}
  for (const key of Object.keys(configs)) {
    const cfg = configs[key as DiagramType]
    flat[key] = {
      nodes: cfg.nodes.map((n) => ({ id: n.id, type: n.type, label: n.data.label, rx: n.data.rx, ry: n.data.ry, vertical: n.data.vertical, fontSize: n.data.fontSize, spacing: n.data.spacing })),
      edges: cfg.edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
    }
  }
  return JSON.stringify(flat, null, 2)
}

function jsonToConfigs(json: string): ConfigMap | null {
  try {
    const flat = JSON.parse(json)
    const configs: any = {}
    for (const key of ['usecase', 'structure', 'entity']) {
      if (flat[key]) configs[key] = parseConfigJson(JSON.stringify(flat[key]))
    }
    return configs as ConfigMap
  } catch { return null }
}

// ====== Config → Editor state (for undo sync) ======

function configToUseCaseState(cfg: { nodes: Node<DiagramNodeData>[]; edges: Edge[] }): UseCaseState {
  const actors = cfg.nodes.filter((n) => n.type === 'actor')
  return {
    actors: actors.map((actor) => {
      const actorId = actor.id
      const connectedIds = new Set(cfg.edges.filter((e) => e.source === actorId).map((e) => e.target))
      return {
        id: actorId,
        label: (actor.data.label as string) || '角色',
        useCases: cfg.nodes
          .filter((n) => n.type === 'usecase' && connectedIds.has(n.id))
          .map((uc) => ({ id: uc.id, label: (uc.data.label as string) || '' })),
      }
    }),
  }
}

function configToTreeState(cfg: { nodes: Node<DiagramNodeData>[]; edges: Edge[] }): TreeNode {
  const childrenMap = new Map<string, string[]>()
  cfg.edges.forEach((e) => {
    const list = childrenMap.get(e.source) || []
    list.push(e.target)
    childrenMap.set(e.source, list)
  })
  const nodeMap = new Map(cfg.nodes.map((n) => [n.id, n]))
  const rootId = cfg.nodes.find((n) => !cfg.edges.some((e) => e.target === n.id))?.id

  function build(id: string, depth: number): TreeNode {
    const node = nodeMap.get(id)
    return {
      id,
      label: (node?.data.label as string) || id,
      vertical: (node?.data.vertical as boolean) || depth >= 2,
      children: (childrenMap.get(id) || []).map((cid) => build(cid, depth + 1)),
    }
  }
  return rootId ? build(rootId, 0) : { id: 'root', label: '系统', vertical: false, children: [] }
}

function configToEntityState(cfg: { nodes: Node<DiagramNodeData>[]; edges: Edge[] }): EntityState {
  const entities = cfg.nodes.filter((n) => n.type === 'rectangle')
  return {
    entities: entities.map((ent) => {
      const eid = ent.id
      const connectedIds = new Set(cfg.edges.filter((e) => e.source === eid).map((e) => e.target))
      return {
        id: eid,
        label: (ent.data.label as string) || '实体',
        attributes: cfg.nodes
          .filter((n) => n.type === 'ellipse' && connectedIds.has(n.id))
          .map((a) => ({ id: a.id, label: (a.data.label as string) || '' })),
      }
    }),
  }
}

// ====== Initial data ======

const initialConfigs: ConfigMap = {
  usecase: parseConfigJson(useCasePresets.admin.json),
  structure: parseConfigJson(JSON.stringify({
    nodes: structureNodes.map((n) => ({ id: n.id, type: n.type, label: n.data.label, vertical: n.data.vertical })),
    edges: structureEdges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
  })),
  entity: parseConfigJson(JSON.stringify({
    nodes: [
      { id: userEntityPreset.entity.id, type: 'rectangle', label: userEntityPreset.entity.data.label },
      ...userEntityPreset.attributes.map((a) => ({ id: a.id, type: 'ellipse', label: a.data.label, rx: 45, ry: 18 })),
    ],
    edges: userEntityPreset.edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
  })),
}

function loadConfigs(): ConfigMap {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) {
      const restored = jsonToConfigs(raw)
      if (restored?.usecase && restored?.structure && restored?.entity) return restored
    }
  } catch { /* ignore */ }
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
  const toggleLang = () => { const next = i18n.language === 'zh' ? 'en' : 'zh'; i18n.changeLanguage(next); localStorage.setItem('lang', next) }

  const { present: configs, push: pushConfigs, undo, redo, canUndo, canRedo } = useUndoRedo<ConfigMap>(loadConfigs())

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem(LS_KEY, configsToJson(configs))
  }, [configs])

  // Increment version when configs change (apply / undo / redo / import)
  useEffect(() => {
    setConfigVersion((v) => v + 1)
  }, [configs])

  // ? key → toggle shortcut panel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '?' && !(e.target as HTMLElement).closest('input')) {
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
        const result = parseConfigJson(json)
        pushConfigs({ ...configs, [active]: result })
      } catch { /* ignore */ }
    },
    [active, configs, pushConfigs]
  )

  // ====== Derive editor states from configs ======
  const ucState = useMemo(() => configToUseCaseState(configs.usecase), [configs.usecase])
  const treeState = useMemo(() => configToTreeState(configs.structure), [configs.structure])
  const entityState = useMemo(() => configToEntityState(configs.entity), [configs.entity])

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
  const [pendingImport, setPendingImport] = useState<ConfigMap | null>(null)

  // ====== Reset ======
  const handleReset = () => {
    if (!window.confirm(t('reset.confirm'))) return
    localStorage.removeItem(LS_KEY)
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
  const mdSectionMap: Record<string, DiagramType> = { '用例图': 'usecase', '功能结构图': 'structure', '实体属性图': 'entity' }

  const handleImport = () => {
    const input = document.createElement('input')
    input.type = 'file'; input.accept = '.json,.txt,.md'
    input.onchange = (e: any) => {
      const file = e.target?.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        const text = reader.result as string
        let importConfigs: ConfigMap | null = null
        // JSON
        if (text.trim().startsWith('{')) {
          importConfigs = jsonToConfigs(text)
          if (!importConfigs) { alert(t('import.jsonError')); return }
        }
        // MD format
        else if (text.includes('\n# ') || text.startsWith('# ')) {
          const sections = text.split(/(?=^# )/m)
          const newConfigs: Record<string, any> = { usecase: emptyConfig, structure: emptyConfig, entity: emptyConfig }
          let hasData = false
          sections.forEach((sec) => {
            const lines = sec.trim().split('\n')
            const header = lines[0].replace(/^# /, '').trim()
            const type = mdSectionMap[header]
            if (!type) return
            const body = lines.slice(1).join('\n').trim()
            if (!body) return
            const result = parseQuickFormat(body, type)
            if (result) { newConfigs[type] = result; hasData = true }
          })
          if (hasData) importConfigs = newConfigs as ConfigMap
          else { alert(t('import.mdError')); return }
        }
        // Plain quick format
        else {
          const result = parseQuickFormat(text, active)
          if (result) importConfigs = { usecase: emptyConfig, structure: emptyConfig, entity: emptyConfig, [active]: result }
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
          <button onClick={handleReset} className="px-2 py-1 text-xs text-red-400 border border-red-200 rounded hover:bg-red-50 ml-1">{t('toolbar.reset')}</button>
          <button onClick={() => setShowShortcuts(true)} className="px-2 py-1 text-xs text-gray-400 border rounded hover:bg-gray-50 ml-1" title={t('toolbar.shortcuts')}>?</button>
          <button onClick={toggleLang} className="px-2 py-1 text-xs border rounded hover:bg-gray-50 ml-1">{t('toolbar.lang')}</button>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {active === 'usecase' && <NodeEditor key={`usecase-${configVersion}`} type="usecase" useCase={ucState} onApply={handleApply} />}
        {active === 'structure' && <NodeEditor key={`structure-${configVersion}`} type="structure" tree={treeState} onApply={handleApply} />}
        {active === 'entity' && <NodeEditor key={`entity-${configVersion}`} type="entity" entity={entityState} onApply={handleApply} />}

        <div className="flex-1" ref={flowRef}>
          <ReactFlowProvider>
            {active === 'usecase' && useCaseGroups.length > 0 && (
              <UseCaseDiagram groups={useCaseGroups} />
            )}
            {active === 'usecase' && useCaseGroups.length === 0 && (
              <div className="flex items-center justify-center h-full text-gray-400">{t('editor.addActor')}</div>
            )}
            {active === 'structure' && (
              <StructureDiagram nodes={configs.structure.nodes} edges={configs.structure.edges} />
            )}
            {active === 'entity' && entityGroups.length > 0 && (
              <EntityAttributeDiagram groups={entityGroups} />
            )}
            {active === 'entity' && entityGroups.length === 0 && (
              <div className="flex items-center justify-center h-full text-gray-400">请添加实体节点</div>
            )}
          </ReactFlowProvider>
        </div>
      </div>

      {/* Export Modal */}
      {showExport && <ExportModal active={active} config={configs[active]} flowRef={flowRef} onClose={() => setShowExport(false)} />}
      {showDataExport && <ExportDataModal configs={configs} onClose={() => setShowDataExport(false)} />}

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
