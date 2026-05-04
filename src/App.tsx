import { useState, useCallback, useMemo } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import type { Edge, Node } from '@xyflow/react'
import UseCaseDiagram from './components/diagrams/UseCaseDiagram'
import StructureDiagram from './components/diagrams/StructureDiagram'
import EntityAttributeDiagram from './components/diagrams/EntityAttributeDiagram'
import NodeEditor from './components/panels/NodeEditor'
import type { DiagramNodeData } from './types/diagram'
import type { UseCaseState, TreeNode, EntityState } from './components/panels/NodeEditor'
import {
  useCasePresets,
  structureNodes,
  structureEdges,
  userEntityPreset,
} from './data/mockData'

type DiagramType = 'usecase' | 'structure' | 'entity'

const tabs: { key: DiagramType; label: string }[] = [
  { key: 'usecase', label: '用例图' },
  { key: 'structure', label: '功能结构图' },
  { key: 'entity', label: '实体属性图' },
]

// ====== JSON → React Flow config ======

function parseConfigJson(text: string): { nodes: Node<DiagramNodeData>[]; edges: Edge[] } | { error: string } {
  try {
    const data = JSON.parse(text)
    if (!data.nodes || !Array.isArray(data.nodes)) return { error: '缺少 nodes 数组' }
    if (!data.edges || !Array.isArray(data.edges)) return { error: '缺少 edges 数组' }

    const nodes: Node<DiagramNodeData>[] = data.nodes.map((n: any) => ({
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

    const edges: Edge[] = data.edges.map((e: any, i: number) => ({
      id: e.id ?? `edge_${i}`,
      source: String(e.source),
      target: String(e.target),
    }))

    return { nodes, edges }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

// ====== Initial data builders ======

function buildInitialUseCase(): UseCaseState {
  const p = useCasePresets.admin
  return {
    actorId: p.actor.id,
    actorLabel: p.actor.data.label as string,
    useCases: p.useCases.map((uc) => ({
      id: uc.id,
      label: uc.data.label as string,
    })),
  }
}

function buildInitialTree(): TreeNode {
  // Build tree from structure data
  const childrenMap = new Map<string, string[]>()
  structureEdges.forEach((e) => {
    const list = childrenMap.get(e.source) || []
    list.push(e.target)
    childrenMap.set(e.source, list)
  })

  const nodeMap = new Map(structureNodes.map((n) => [n.id, n]))

  function build(id: string, depth: number): TreeNode {
    const node = nodeMap.get(id)
    const kids = childrenMap.get(id) || []
    return {
      id,
      label: (node?.data.label as string) ?? id,
      vertical: depth >= 2,
      children: kids.map((k) => build(k, depth + 1)),
    }
  }

  const rootId = structureNodes.find((n) => !structureEdges.some((e) => e.target === n.id))?.id
  return build(rootId ?? 'root', 0)
}

function buildInitialEntity(): EntityState {
  return {
    entityId: userEntityPreset.entity.id,
    entityLabel: userEntityPreset.entity.data.label as string,
    attributes: userEntityPreset.attributes.map((a) => ({
      id: a.id,
      label: a.data.label as string,
    })),
  }
}

// ====== App ======

function App() {
  const [active, setActive] = useState<DiagramType>('usecase')
  const [applyCount, setApplyCount] = useState(0)

  // Parsed configs — updated by NodeEditor via onApply
  const [configs, setConfigs] = useState<Record<DiagramType, { nodes: Node<DiagramNodeData>[]; edges: Edge[] }>>(() => ({
    usecase: parseConfigJson(useCasePresets.admin.json) as { nodes: Node<DiagramNodeData>[]; edges: Edge[] },
    structure: parseConfigJson(
      JSON.stringify({
        nodes: structureNodes.map((n) => ({
          id: n.id, type: n.type, label: n.data.label,
          vertical: n.data.vertical,
        })),
        edges: structureEdges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
      })
    ) as { nodes: Node<DiagramNodeData>[]; edges: Edge[] },
    entity: parseConfigJson(
      JSON.stringify({
        nodes: [
          { id: userEntityPreset.entity.id, type: 'rectangle', label: userEntityPreset.entity.data.label },
          ...userEntityPreset.attributes.map((a) => ({
            id: a.id, type: 'ellipse', label: a.data.label, rx: 45, ry: 18,
          })),
        ],
        edges: userEntityPreset.edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
      })
    ) as { nodes: Node<DiagramNodeData>[]; edges: Edge[] },
  }))

  // NodeEditor → JSON → parse → configs
  const handleApply = useCallback(
    (json: string) => {
      const result = parseConfigJson(json)
      if ('error' in result) return
      setConfigs((prev) => ({ ...prev, [active]: result }))
      setApplyCount((c) => c + 1)
    },
    [active]
  )

  // ====== Derive diagram data from configs ======

  const useCaseData = useMemo(() => {
    const cfg = configs.usecase
    const actors = cfg.nodes.filter((n) => n.type === 'actor')
    const useCases = cfg.nodes.filter((n) => n.type === 'usecase')
    const actor = actors[0]
    const actorEdges = actor ? cfg.edges.filter((e) => e.source === actor.id) : cfg.edges
    const connectedUcIds = new Set(actorEdges.map((e) => e.target))
    const filteredUseCases = useCases.filter((uc) => connectedUcIds.has(uc.id))
    return { actor: actor ?? null, useCases: filteredUseCases, edges: actorEdges }
  }, [configs.usecase])

  const entityData = useMemo(() => {
    const cfg = configs.entity
    const entity = cfg.nodes.find((n) => n.type === 'rectangle')
    const attributes = cfg.nodes.filter((n) => n.type === 'ellipse')
    const entityEdges = entity
      ? cfg.edges.filter((e) => e.source === entity.id || e.target === entity.id)
      : cfg.edges
    return { entity: entity ?? null, attributes, edges: entityEdges }
  }, [configs.entity])

  // ====== Initial editor states ======
  const [ucState] = useState(buildInitialUseCase)
  const [treeState] = useState(buildInitialTree)
  const [entityState] = useState(buildInitialEntity)

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
              active === tab.key
                ? 'bg-black text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </header>

      {/* Body: Editor + Preview */}
      <div className="flex flex-1 overflow-hidden">
        {/* Node Editor Panel */}
        {active === 'usecase' && (
          <NodeEditor type="usecase" useCase={ucState} onApply={handleApply} />
        )}
        {active === 'structure' && (
          <NodeEditor type="structure" tree={treeState} onApply={handleApply} />
        )}
        {active === 'entity' && (
          <NodeEditor type="entity" entity={entityState} onApply={handleApply} />
        )}

        {/* Diagram Preview */}
        <div className="flex-1" key={`${active}-${applyCount}`}>
          <ReactFlowProvider>
            {active === 'usecase' && useCaseData.actor && (
              <UseCaseDiagram
                actor={useCaseData.actor}
                useCases={useCaseData.useCases}
                edges={useCaseData.edges}
              />
            )}
            {active === 'usecase' && !useCaseData.actor && (
              <div className="flex items-center justify-center h-full text-gray-400">
                请添加一个 type: "actor" 的节点
              </div>
            )}

            {active === 'structure' && (
              <StructureDiagram
                nodes={configs.structure.nodes}
                edges={configs.structure.edges}
              />
            )}

            {active === 'entity' && entityData.entity && (
              <EntityAttributeDiagram
                entity={entityData.entity}
                attributes={entityData.attributes}
                edges={entityData.edges}
                orbitA={entityData.attributes.length >= 10 ? 200 : 165}
              />
            )}
            {active === 'entity' && !entityData.entity && (
              <div className="flex items-center justify-center h-full text-gray-400">
                请添加一个 type: "rectangle" 的实体节点
              </div>
            )}
          </ReactFlowProvider>
        </div>
      </div>
    </div>
  )
}

export default App
