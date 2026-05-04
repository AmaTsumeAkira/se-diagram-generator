import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import type { Edge, Node } from '@xyflow/react'
import { toPng } from 'html-to-image'
import UseCaseDiagram from './components/diagrams/UseCaseDiagram'
import StructureDiagram from './components/diagrams/StructureDiagram'
import EntityAttributeDiagram from './components/diagrams/EntityAttributeDiagram'
import NodeEditor from './components/panels/NodeEditor'
import { useUndoRedo } from './hooks/useUndoRedo'
import type { DiagramNodeData } from './types/diagram'
import type { UseCaseState, TreeNode, EntityState } from './components/panels/NodeEditor'
import {
  useCasePresets,
  structureNodes,
  structureEdges,
  userEntityPreset,
} from './data/mockData'

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
      if (flat[key]) {
        configs[key] = parseConfigJson(JSON.stringify(flat[key]))
      }
    }
    return configs as ConfigMap
  } catch { return null }
}

const initialConfigs: ConfigMap = {
  usecase: parseConfigJson(useCasePresets.admin.json),
  structure: parseConfigJson(
    JSON.stringify({
      nodes: structureNodes.map((n) => ({ id: n.id, type: n.type, label: n.data.label, vertical: n.data.vertical })),
      edges: structureEdges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
    })
  ),
  entity: parseConfigJson(
    JSON.stringify({
      nodes: [
        { id: userEntityPreset.entity.id, type: 'rectangle', label: userEntityPreset.entity.data.label },
        ...userEntityPreset.attributes.map((a) => ({ id: a.id, type: 'ellipse', label: a.data.label, rx: 45, ry: 18 })),
      ],
      edges: userEntityPreset.edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
    })
  ),
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

// ====== Initial editor data ======

function buildUseCase(): UseCaseState {
  const p = useCasePresets.admin
  return { actorId: p.actor.id, actorLabel: p.actor.data.label as string, useCases: p.useCases.map((uc) => ({ id: uc.id, label: uc.data.label as string })) }
}

function buildTree(): TreeNode {
  const cm = new Map<string, string[]>()
  structureEdges.forEach((e) => { const l = cm.get(e.source) || []; l.push(e.target); cm.set(e.source, l) })
  const nm = new Map(structureNodes.map((n) => [n.id, n]))
  function build(id: string, d: number): TreeNode {
    const n = nm.get(id)
    return { id, label: (n?.data.label as string) ?? id, vertical: d >= 2, children: (cm.get(id) || []).map((k) => build(k, d + 1)) }
  }
  return build(structureNodes.find((n) => !structureEdges.some((e) => e.target === n.id))?.id ?? 'root', 0)
}

function buildEntity(): EntityState {
  return { entityId: userEntityPreset.entity.id, entityLabel: userEntityPreset.entity.data.label as string, attributes: userEntityPreset.attributes.map((a) => ({ id: a.id, label: a.data.label as string })) }
}

// ====== App ======

function App() {
  const [active, setActive] = useState<DiagramType>('usecase')
  const flowRef = useRef<HTMLDivElement>(null)

  // Undo/Redo over configs
  const { present: configs, push: pushConfigs, undo, redo, canUndo, canRedo } = useUndoRedo<ConfigMap>(loadConfigs)

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem(LS_KEY, configsToJson(configs))
  }, [configs])

  const handleApply = useCallback(
    (json: string) => {
      try {
        const result = parseConfigJson(json)
        pushConfigs({ ...configs, [active]: result })
      } catch { /* ignore invalid */ }
    },
    [active, configs, pushConfigs]
  )

  // ====== Derive diagram data ======

  const useCaseData = useMemo(() => {
    const cfg = configs.usecase
    const actors = cfg.nodes.filter((n) => n.type === 'actor')
    const useCases = cfg.nodes.filter((n) => n.type === 'usecase')
    const actor = actors[0]
    const actorEdges = actor ? cfg.edges.filter((e) => e.source === actor.id) : cfg.edges
    const ids = new Set(actorEdges.map((e) => e.target))
    return { actor: actor ?? null, useCases: useCases.filter((uc) => ids.has(uc.id)), edges: actorEdges }
  }, [configs.usecase])

  const entityData = useMemo(() => {
    const cfg = configs.entity
    const entity = cfg.nodes.find((n) => n.type === 'rectangle')
    const attributes = cfg.nodes.filter((n) => n.type === 'ellipse')
    const eid = entity?.id
    const entityEdges = eid ? cfg.edges.filter((e) => e.source === eid || e.target === eid) : cfg.edges
    return { entity: entity ?? null, attributes, edges: entityEdges }
  }, [configs.entity])

  // ====== Export image ======

  const [exporting, setExporting] = useState(false)
  const handleExportPng = useCallback(async () => {
    const el = flowRef.current?.querySelector('.react-flow') as HTMLElement | null
    if (!el) return

    // 计算所有节点的包围盒
    const nodeEls = el.querySelectorAll('.react-flow__node')
    if (nodeEls.length === 0) return

    const flowRect = el.getBoundingClientRect()
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    nodeEls.forEach((node) => {
      const r = node.getBoundingClientRect()
      minX = Math.min(minX, r.left - flowRect.left)
      minY = Math.min(minY, r.top - flowRect.top)
      maxX = Math.max(maxX, r.right - flowRect.left)
      maxY = Math.max(maxY, r.bottom - flowRect.top)
    })

    const padding = 40
    const scale = 2
    const w = maxX - minX + padding * 2
    const h = maxY - minY + padding * 2

    // 隐藏背景格点
    const bg = el.querySelector('.react-flow__background') as HTMLElement | null
    if (bg) bg.style.display = 'none'

    setExporting(true)
    try {
      const dataUrl = await toPng(el, { backgroundColor: '#ffffff', pixelRatio: scale })

      // 裁剪到内容区域
      const img = new Image()
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('Image load failed'))
        img.src = dataUrl
      })

      const canvas = document.createElement('canvas')
      canvas.width = w * scale
      canvas.height = h * scale
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(
        img,
        (minX - padding) * scale, (minY - padding) * scale, w * scale, h * scale,
        0, 0, w * scale, h * scale,
      )

      const a = document.createElement('a')
      a.download = `diagram-${active}-${Date.now()}.png`
      a.href = canvas.toDataURL('image/png')
      a.click()
    } catch (e) {
      console.error('Export failed', e)
    } finally {
      if (bg) bg.style.display = ''
      setExporting(false)
    }
  }, [active])

  // ====== Import / Export JSON ======

  const handleExportJson = () => {
    const json = configsToJson(configs)
    const blob = new Blob([json], { type: 'application/json' })
    const a = document.createElement('a')
    a.download = `diagram-configs-${Date.now()}.json`
    a.href = URL.createObjectURL(blob)
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const handleImportJson = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = (e: any) => {
      const file = e.target?.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        const restored = jsonToConfigs(reader.result as string)
        if (restored) pushConfigs(restored)
        else alert('JSON 格式不正确')
      }
      reader.readAsText(file)
    }
    input.click()
  }

  // ====== Initial editor states ======
  const [ucState] = useState(buildUseCase)
  const [treeState] = useState(buildTree)
  const [entityState] = useState(buildEntity)

  return (
    <div className="h-screen flex flex-col">
      {/* Top Navigation */}
      <header className="flex items-center gap-1 px-4 py-2 border-b border-gray-200 bg-white shrink-0">
        <h1 className="text-base font-bold mr-4">软件工程图生成器</h1>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActive(tab.key)}
            className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
              active === tab.key ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {tab.label}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-1">
          {/* Undo/Redo */}
          <button onClick={undo} disabled={!canUndo} className="px-2 py-1 text-xs border rounded disabled:opacity-30 hover:bg-gray-50" title="Ctrl+Z">↩</button>
          <button onClick={redo} disabled={!canRedo} className="px-2 py-1 text-xs border rounded disabled:opacity-30 hover:bg-gray-50" title="Ctrl+Y">↪</button>

          <span className="w-px h-5 bg-gray-300 mx-1" />

          {/* Import / Export */}
          <button onClick={handleImportJson} className="px-2 py-1 text-xs border rounded hover:bg-gray-50" title="导入 JSON 配置">导入</button>
          <button onClick={handleExportJson} className="px-2 py-1 text-xs border rounded hover:bg-gray-50" title="导出 JSON 配置">导出</button>

          {/* Export PNG */}
          <button onClick={handleExportPng} disabled={exporting} className="px-3 py-1 text-xs bg-black text-white rounded hover:bg-gray-800 disabled:opacity-50">
            {exporting ? '导出中...' : '导出 PNG'}
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {active === 'usecase' && <NodeEditor type="usecase" useCase={ucState} onApply={handleApply} />}
        {active === 'structure' && <NodeEditor type="structure" tree={treeState} onApply={handleApply} />}
        {active === 'entity' && <NodeEditor type="entity" entity={entityState} onApply={handleApply} />}

        <div className="flex-1" ref={flowRef}>
          <ReactFlowProvider>
            {active === 'usecase' && useCaseData.actor && (
              <UseCaseDiagram actor={useCaseData.actor} useCases={useCaseData.useCases} edges={useCaseData.edges} />
            )}
            {active === 'usecase' && !useCaseData.actor && (
              <div className="flex items-center justify-center h-full text-gray-400">请添加 actor 节点</div>
            )}

            {active === 'structure' && (
              <StructureDiagram nodes={configs.structure.nodes} edges={configs.structure.edges} />
            )}

            {active === 'entity' && entityData.entity && (
              <EntityAttributeDiagram entity={entityData.entity} attributes={entityData.attributes} edges={entityData.edges}
                orbitA={entityData.attributes.length >= 10 ? 200 : 165} />
            )}
            {active === 'entity' && !entityData.entity && (
              <div className="flex items-center justify-center h-full text-gray-400">请添加实体节点</div>
            )}
          </ReactFlowProvider>
        </div>
      </div>
    </div>
  )
}

export default App
