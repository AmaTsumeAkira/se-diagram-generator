import { useState, useCallback, useMemo } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import type { Edge, Node } from '@xyflow/react'
import UseCaseDiagram from './components/diagrams/UseCaseDiagram'
import StructureDiagram from './components/diagrams/StructureDiagram'
import EntityAttributeDiagram from './components/diagrams/EntityAttributeDiagram'
import ConfigPanel from './components/panels/ConfigPanel'
import type { DiagramNodeData } from './types/diagram'
import {
  useCasePresets,
  makeStructureJson,
  userEntityPreset,
  makeEntityJson,
} from './data/mockData'

type DiagramType = 'usecase' | 'structure' | 'entity'

const tabs: { key: DiagramType; label: string }[] = [
  { key: 'usecase', label: '用例图' },
  { key: 'structure', label: '功能结构图' },
  { key: 'entity', label: '实体属性图' },
]

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

function App() {
  const [active, setActive] = useState<DiagramType>('usecase')
  const [applyCount, setApplyCount] = useState(0)

  // JSON texts per tab
  const [jsonTexts, setJsonTexts] = useState<Record<DiagramType, string>>({
    usecase: useCasePresets.admin.json,
    structure: makeStructureJson(),
    entity: makeEntityJson(userEntityPreset),
  })
  // Parse errors per tab
  const [errors, setErrors] = useState<Record<DiagramType, string | null>>({
    usecase: null,
    structure: null,
    entity: null,
  })

  // Parsed configs (updated on Apply)
  const [configs, setConfigs] = useState<Record<DiagramType, { nodes: Node<DiagramNodeData>[]; edges: Edge[] }>>(() => {
    const ucResult = parseConfigJson(useCasePresets.admin.json)
    const stResult = parseConfigJson(makeStructureJson())
    const enResult = parseConfigJson(makeEntityJson(userEntityPreset))
    return {
      usecase: 'error' in ucResult ? { nodes: [], edges: [] } : ucResult,
      structure: 'error' in stResult ? { nodes: [], edges: [] } : stResult,
      entity: 'error' in enResult ? { nodes: [], edges: [] } : enResult,
    }
  })

  // Actor selector for use case diagram
  const [selectedActor, setSelectedActor] = useState('admin')

  const handleApply = useCallback(() => {
    const text = jsonTexts[active]
    const result = parseConfigJson(text)
    if ('error' in result) {
      setErrors((prev) => ({ ...prev, [active]: result.error }))
      return
    }
    setErrors((prev) => ({ ...prev, [active]: null }))
    setConfigs((prev) => ({ ...prev, [active]: result }))
    setApplyCount((c) => c + 1)
  }, [jsonTexts, active])

  const handleActorSelect = useCallback(
    (key: string) => {
      setSelectedActor(key)
      const preset = useCasePresets[key]
      if (preset) {
        setJsonTexts((prev) => ({ ...prev, usecase: preset.json }))
      }
    },
    []
  )

  // For use case: extract actor(s) and use cases from parsed config
  const useCaseData = useMemo(() => {
    const cfg = configs.usecase
    const actors = cfg.nodes.filter((n) => n.type === 'actor')
    const useCases = cfg.nodes.filter((n) => n.type === 'usecase')

    // Try to use the selected actor; fall back to first actor found
    const actor =
      actors.find((a) => a.id === selectedActor) ||
      actors.find((a) => a.id === 'a1') ||
      actors[0]

    // Filter edges connected to this actor
    const actorEdges = actor
      ? cfg.edges.filter((e) => e.source === actor.id)
      : cfg.edges

    // Filter use cases that are connected to this actor
    const connectedUcIds = new Set(actorEdges.map((e) => e.target))
    const filteredUseCases = useCases.filter((uc) => connectedUcIds.has(uc.id))

    return { actor: actor ?? null, useCases: filteredUseCases, edges: actorEdges }
  }, [configs.usecase, selectedActor])

  // Available actors for the selector
  const availableActors = useMemo(() => {
    return configs.usecase.nodes
      .filter((n) => n.type === 'actor')
      .map((a) => ({ key: a.id, label: a.data.label as string }))
  }, [configs.usecase])

  // For entity: find entity (rectangle) and attributes (ellipses)
  const entityData = useMemo(() => {
    const cfg = configs.entity
    const entity = cfg.nodes.find((n) => n.type === 'rectangle')
    const attributes = cfg.nodes.filter((n) => n.type === 'ellipse')
    const entityEdges = entity
      ? cfg.edges.filter((e) => e.source === entity.id || e.target === entity.id)
      : cfg.edges

    return { entity: entity ?? null, attributes, edges: entityEdges }
  }, [configs.entity])

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
        {/* Config Panel */}
        {active === 'usecase' && (
          <ConfigPanel
            title="用例图"
            jsonText={jsonTexts.usecase}
            onChange={(text) =>
              setJsonTexts((prev) => ({ ...prev, usecase: text }))
            }
            onApply={handleApply}
            error={errors.usecase}
            actorSelector={{
              actors:
                availableActors.length > 0
                  ? availableActors
                  : [
                      { key: 'admin', label: '管理员' },
                      { key: 'owner', label: '业主' },
                      { key: 'repairer', label: '维修人员' },
                    ],
              selected: selectedActor,
              onSelect: handleActorSelect,
            }}
          />
        )}

        {active === 'structure' && (
          <ConfigPanel
            title="功能结构图"
            jsonText={jsonTexts.structure}
            onChange={(text) =>
              setJsonTexts((prev) => ({ ...prev, structure: text }))
            }
            onApply={handleApply}
            error={errors.structure}
          />
        )}

        {active === 'entity' && (
          <ConfigPanel
            title="实体属性图"
            jsonText={jsonTexts.entity}
            onChange={(text) =>
              setJsonTexts((prev) => ({ ...prev, entity: text }))
            }
            onApply={handleApply}
            error={errors.entity}
          />
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
                JSON 中未找到 actor 节点，请添加 type: "actor" 的节点
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
                JSON 中未找到实体节点，请添加 type: "rectangle" 的节点
              </div>
            )}
          </ReactFlowProvider>
        </div>
      </div>
    </div>
  )
}

export default App
