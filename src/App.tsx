import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
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

type DiagramType = 'usecase' | 'structure' | 'entity'

const LS_KEY = 'diagram-editor-configs'

const tabs: { key: DiagramType; label: string }[] = [
  { key: 'usecase', label: '用例图' },
  { key: 'structure', label: '功能结构图' },
  { key: 'entity', label: '实体属性图' },
]

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
      nodes: cfg.nodes.map((n) => ({ id: n.id, type: n.type, label: n.data.label, rx: n.data.rx, ry: n.data.ry, vertical: n.data.vertical })),
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

const shortcuts = [
  { keys: 'Ctrl+Z', desc: '撤销' },
  { keys: 'Ctrl+Y', desc: '重做' },
  { keys: '双击元素', desc: '编辑名称' },
  { keys: 'Enter', desc: '保存编辑' },
  { keys: 'Tab', desc: '保存并跳转下一个' },
  { keys: 'Tab(末尾)', desc: '新建空白元素' },
  { keys: 'Delete', desc: '删除选中元素' },
  { keys: '拖拽 ⠿', desc: '列表排序' },
  { keys: '?', desc: '显示/隐藏快捷键' },
]

// ====== App ======

function App() {
  const [active, setActive] = useState<DiagramType>('usecase')
  const [configVersion, setConfigVersion] = useState(0)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const flowRef = useRef<HTMLDivElement>(null)

  const { present: configs, push: pushConfigs, undo, redo, canUndo, canRedo } = useUndoRedo<ConfigMap>(loadConfigs)

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

  // ====== Export ======
  const [showExport, setShowExport] = useState(false)
  const [showDataExport, setShowDataExport] = useState(false)

  // ====== Reset ======
  const handleReset = () => {
    if (!window.confirm('确定要重置所有图表为初始状态吗？此操作不可撤销。')) return
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

  const handleImport = () => {
    const input = document.createElement('input')
    input.type = 'file'; input.accept = '.json,.txt,.md'
    input.onchange = (e: any) => {
      const file = e.target?.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        if (!window.confirm('导入将清空所有现有数据，确定继续吗？')) return
        const text = reader.result as string
        // JSON
        if (text.trim().startsWith('{')) {
          const restored = jsonToConfigs(text)
          if (restored) pushConfigs(restored)
          else alert('JSON 格式不正确')
          return
        }
        // Quick format - import for current diagram type, others empty
        const result = parseQuickFormat(text, active)
        if (result) {
          pushConfigs({ usecase: emptyConfig, structure: emptyConfig, entity: emptyConfig, [active]: result })
        } else {
          alert('快速导入格式不正确')
        }
      }
      reader.readAsText(file)
    }
    input.click()
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Top Navigation */}
      <header className="flex items-center gap-1 px-4 py-2 border-b border-gray-200 bg-white shrink-0">
        <h1 className="text-base font-bold mr-4">软件工程图生成器</h1>
        {tabs.map((tab) => (
          <button key={tab.key} onClick={() => setActive(tab.key)}
            className={`px-3 py-1 rounded text-sm font-medium transition-colors ${active === tab.key ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
            {tab.label}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-1">
          <button onClick={undo} disabled={!canUndo} className="px-2 py-1 text-xs border rounded disabled:opacity-30 hover:bg-gray-50" title="Ctrl+Z">撤销</button>
          <button onClick={redo} disabled={!canRedo} className="px-2 py-1 text-xs border rounded disabled:opacity-30 hover:bg-gray-50" title="Ctrl+Y">重做</button>
          <span className="w-px h-5 bg-gray-300 mx-1" />
          <button onClick={handleImport} className="px-2 py-1 text-xs border rounded hover:bg-gray-50">导入</button>
          <button onClick={() => setShowDataExport(true)} className="px-2 py-1 text-xs border rounded hover:bg-gray-50">导出数据</button>
          <button onClick={() => setShowExport(true)} className="px-3 py-1 text-xs bg-black text-white rounded hover:bg-gray-800">
            导出图片
          </button>
          <button onClick={handleReset} className="px-2 py-1 text-xs text-red-400 border border-red-200 rounded hover:bg-red-50 ml-1" title="重置所有图表">重置</button>
          <button onClick={() => setShowShortcuts(true)} className="px-2 py-1 text-xs text-gray-400 border rounded hover:bg-gray-50 ml-1" title="快捷键">?</button>
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
              <div className="flex items-center justify-center h-full text-gray-400">请添加角色节点</div>
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

      {/* Shortcut Help Modal */}
      {showShortcuts && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setShowShortcuts(false)}>
          <div className="bg-white rounded-lg shadow-xl p-6 min-w-[320px]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold">键盘快捷键</h3>
              <button onClick={() => setShowShortcuts(false)} className="text-gray-400 hover:text-black text-lg leading-none">×</button>
            </div>
            <div className="space-y-2">
              {shortcuts.map((s) => (
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
