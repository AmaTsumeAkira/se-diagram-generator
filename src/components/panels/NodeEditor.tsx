import { useState, useCallback } from 'react'

// ====== Types ======

export interface UseCaseState {
  actorId: string
  actorLabel: string
  useCases: { id: string; label: string }[]
}

export interface TreeNode {
  id: string
  label: string
  vertical: boolean
  children: TreeNode[]
}

export interface EntityState {
  entityId: string
  entityLabel: string
  attributes: { id: string; label: string }[]
}

export type DiagramType = 'usecase' | 'structure' | 'entity'

interface Props {
  type: DiagramType
  useCase?: UseCaseState
  tree?: TreeNode
  entity?: EntityState
  onApply: (json: string) => void
}

// ====== ID generator ======
let _id = 100
function uid(): string {
  return 'n' + _id++
}

// ====== JSON generators ======

function useCaseToJson(state: UseCaseState): string {
  const nodes = [
    { id: state.actorId, type: 'actor', label: state.actorLabel },
    ...state.useCases.map((uc) => ({
      id: uc.id,
      type: 'usecase',
      label: uc.label,
      rx: 60,
      ry: 15,
    })),
  ]
  const edges = state.useCases.map((uc, i) => ({
    id: `e${i}`,
    source: state.actorId,
    target: uc.id,
  }))
  return JSON.stringify({ nodes, edges }, null, 2)
}

function treeToJson(root: TreeNode): string {
  const nodes: any[] = []
  const edges: any[] = []

  function walk(node: TreeNode) {
    nodes.push({
      id: node.id,
      type: 'rectangle',
      label: node.label,
      vertical: node.vertical,
    })
    node.children.forEach((child) => {
      edges.push({ id: `e_${node.id}_${child.id}`, source: node.id, target: child.id })
      walk(child)
    })
  }

  walk(root)
  return JSON.stringify({ nodes, edges }, null, 2)
}

function entityToJson(state: EntityState): string {
  const nodes = [
    { id: state.entityId, type: 'rectangle', label: state.entityLabel },
    ...state.attributes.map((a) => ({
      id: a.id,
      type: 'ellipse',
      label: a.label,
      rx: 45,
      ry: 18,
    })),
  ]
  const edges = state.attributes.map((a, i) => ({
    id: `e${i}`,
    source: state.entityId,
    target: a.id,
  }))
  return JSON.stringify({ nodes, edges }, null, 2)
}

// ====== Component ======

export default function NodeEditor({ type, useCase, tree, entity, onApply }: Props) {
  return (
    <div className="w-[420px] shrink-0 border-r border-gray-200 bg-gray-50 flex flex-col h-full">
      <div className="px-4 py-3 border-b border-gray-200 bg-white">
        <h2 className="text-sm font-semibold">
          {type === 'usecase' && '用例图 - 节点编辑'}
          {type === 'structure' && '功能结构图 - 节点编辑'}
          {type === 'entity' && '实体属性图 - 节点编辑'}
        </h2>
        <p className="text-xs text-gray-500 mt-0.5">输入文字后点击"应用修改"生成图表</p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {type === 'usecase' && useCase && (
          <UseCaseEditor state={useCase} onApply={onApply} />
        )}
        {type === 'structure' && tree && (
          <TreeEditor root={tree} onApply={onApply} />
        )}
        {type === 'entity' && entity && (
          <EntityEditor state={entity} onApply={onApply} />
        )}
      </div>
    </div>
  )
}

// ====== Use Case Editor ======

function UseCaseEditor({
  state: initial,
  onApply,
}: {
  state: UseCaseState
  onApply: (json: string) => void
}) {
  const [state, setState] = useState<UseCaseState>(initial)
  const [newLabel, setNewLabel] = useState('')

  const addUseCase = () => {
    const label = newLabel.trim()
    if (!label) return
    setState((s) => ({
      ...s,
      useCases: [...s.useCases, { id: uid(), label }],
    }))
    setNewLabel('')
  }

  const removeUseCase = (id: string) => {
    setState((s) => ({
      ...s,
      useCases: s.useCases.filter((uc) => uc.id !== id),
    }))
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') addUseCase()
  }

  return (
    <div className="space-y-4">
      {/* Actor */}
      <div>
        <div className="text-xs font-medium text-gray-500 mb-1">角色 (Actor)</div>
        <div className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 rounded">
          <span className="text-sm">🧑 {state.actorLabel}</span>
        </div>
      </div>

      {/* Use Cases */}
      <div>
        <div className="text-xs font-medium text-gray-500 mb-1">
          用例 ({state.useCases.length})
        </div>
        <div className="flex gap-1 mb-2">
          <input
            className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-black"
            placeholder="输入用例名称..."
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            onClick={addUseCase}
            className="px-3 py-1.5 text-sm bg-black text-white rounded hover:bg-gray-800"
          >
            添加
          </button>
        </div>
        <div className="space-y-1">
          {state.useCases.map((uc) => (
            <div
              key={uc.id}
              className="flex items-center justify-between px-3 py-1.5 bg-white border border-gray-200 rounded text-sm"
            >
              <span>⭕ {uc.label}</span>
              <button
                onClick={() => removeUseCase(uc.id)}
                className="text-gray-400 hover:text-red-500 text-lg leading-none"
                title="删除"
              >
                ×
              </button>
            </div>
          ))}
          {state.useCases.length === 0 && (
            <div className="text-xs text-gray-400 text-center py-2">暂无用例，请添加</div>
          )}
        </div>
      </div>

      <button
        onClick={() => onApply(useCaseToJson(state))}
        className="w-full py-2 bg-black text-white text-sm font-medium rounded hover:bg-gray-800"
      >
        应用修改
      </button>
    </div>
  )
}

// ====== Tree Editor (Structure Diagram) ======

function updateTreeNode(
  node: TreeNode,
  targetId: string,
  fn: (n: TreeNode) => TreeNode
): TreeNode {
  if (node.id === targetId) return fn(node)
  return {
    ...node,
    children: node.children.map((c) => updateTreeNode(c, targetId, fn)),
  }
}

function deleteTreeNode(node: TreeNode, targetId: string): TreeNode | null {
  if (node.id === targetId) return null
  return {
    ...node,
    children: node.children
      .map((c) => deleteTreeNode(c, targetId))
      .filter((c): c is TreeNode => c !== null),
  }
}

function TreeEditor({
  root: initialRoot,
  onApply,
}: {
  root: TreeNode
  onApply: (json: string) => void
}) {
  const [root, setRoot] = useState<TreeNode>(initialRoot)

  const handleAddChild = (parentId: string, label: string) => {
    const child: TreeNode = {
      id: uid(),
      label,
      vertical: false,
      children: [],
    }
    setRoot((prev) =>
      updateTreeNode(prev, parentId, (node) => ({
        ...node,
        children: [...node.children, child],
      }))
    )
  }

  const handleDelete = (nodeId: string) => {
    setRoot((prev) => deleteTreeNode(prev, nodeId) ?? prev)
  }

  return (
    <div className="space-y-3">
      <TreeNodeRow
        node={root}
        depth={0}
        onAddChild={handleAddChild}
        onDelete={handleDelete}
      />
      <button
        onClick={() => onApply(treeToJson(root))}
        className="w-full py-2 bg-black text-white text-sm font-medium rounded hover:bg-gray-800"
      >
        应用修改
      </button>
    </div>
  )
}

function TreeNodeRow({
  node,
  depth,
  onAddChild,
  onDelete,
}: {
  node: TreeNode
  depth: number
  onAddChild: (parentId: string, label: string) => void
  onDelete: (nodeId: string) => void
}) {
  const [adding, setAdding] = useState(false)
  const [childLabel, setChildLabel] = useState('')

  const confirmAdd = () => {
    const label = childLabel.trim()
    if (!label) return
    onAddChild(node.id, label)
    setChildLabel('')
    setAdding(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') confirmAdd()
    if (e.key === 'Escape') {
      setAdding(false)
      setChildLabel('')
    }
  }

  return (
    <div>
      {/* This node */}
      <div
        className="flex items-center gap-1 py-1 px-2 rounded hover:bg-gray-100 group"
        style={{ marginLeft: depth * 16 }}
      >
        <span className="text-xs text-gray-400">
          {depth === 0 ? '📁' : depth === 1 ? '📂' : '📄'}
        </span>
        <span className="flex-1 text-sm truncate">{node.label}</span>
        <button
          onClick={() => setAdding(!adding)}
          className="text-gray-400 hover:text-black text-sm px-1 opacity-0 group-hover:opacity-100 transition-opacity"
          title="添加子节点"
        >
          +
        </button>
        {depth > 0 && (
          <button
            onClick={() => onDelete(node.id)}
            className="text-gray-400 hover:text-red-500 text-sm px-1 opacity-0 group-hover:opacity-100 transition-opacity"
            title="删除"
          >
            ×
          </button>
        )}
      </div>

      {/* Inline add-child input */}
      {adding && (
        <div className="flex gap-1 my-1" style={{ marginLeft: (depth + 1) * 16 }}>
          <input
            autoFocus
            className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-black"
            placeholder={depth < 1 ? '模块名称...' : '功能名称...'}
            value={childLabel}
            onChange={(e) => setChildLabel(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            onClick={confirmAdd}
            className="px-2 py-1 text-xs bg-black text-white rounded hover:bg-gray-800"
          >
            确定
          </button>
          <button
            onClick={() => {
              setAdding(false)
              setChildLabel('')
            }}
            className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-100"
          >
            取消
          </button>
        </div>
      )}

      {/* Children */}
      {node.children.map((child) => (
        <TreeNodeRow
          key={child.id}
          node={child}
          depth={depth + 1}
          onAddChild={onAddChild}
          onDelete={onDelete}
        />
      ))}
    </div>
  )
}

// ====== Entity Editor ======

function EntityEditor({
  state: initial,
  onApply,
}: {
  state: EntityState
  onApply: (json: string) => void
}) {
  const [state, setState] = useState<EntityState>(initial)
  const [newAttrLabel, setNewAttrLabel] = useState('')

  const addAttr = () => {
    const label = newAttrLabel.trim()
    if (!label) return
    setState((s) => ({
      ...s,
      attributes: [...s.attributes, { id: uid(), label }],
    }))
    setNewAttrLabel('')
  }

  const removeAttr = (id: string) => {
    setState((s) => ({
      ...s,
      attributes: s.attributes.filter((a) => a.id !== id),
    }))
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') addAttr()
  }

  return (
    <div className="space-y-4">
      {/* Entity */}
      <div>
        <div className="text-xs font-medium text-gray-500 mb-1">实体 (Entity)</div>
        <input
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-black"
          value={state.entityLabel}
          onChange={(e) =>
            setState((s) => ({ ...s, entityLabel: e.target.value }))
          }
        />
      </div>

      {/* Attributes */}
      <div>
        <div className="text-xs font-medium text-gray-500 mb-1">
          属性 ({state.attributes.length})
        </div>
        <div className="flex gap-1 mb-2">
          <input
            className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-black"
            placeholder="输入属性名称..."
            value={newAttrLabel}
            onChange={(e) => setNewAttrLabel(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            onClick={addAttr}
            className="px-3 py-1.5 text-sm bg-black text-white rounded hover:bg-gray-800"
          >
            添加
          </button>
        </div>
        <div className="space-y-1">
          {state.attributes.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between px-3 py-1.5 bg-white border border-gray-200 rounded text-sm"
            >
              <span>⭕ {a.label}</span>
              <button
                onClick={() => removeAttr(a.id)}
                className="text-gray-400 hover:text-red-500 text-lg leading-none"
                title="删除"
              >
                ×
              </button>
            </div>
          ))}
          {state.attributes.length === 0 && (
            <div className="text-xs text-gray-400 text-center py-2">暂无属性，请添加</div>
          )}
        </div>
      </div>

      <button
        onClick={() => onApply(entityToJson(state))}
        className="w-full py-2 bg-black text-white text-sm font-medium rounded hover:bg-gray-800"
      >
        应用修改
      </button>
    </div>
  )
}
