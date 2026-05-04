import { useState, useRef, useEffect } from 'react'

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
      id: uc.id, type: 'usecase', label: uc.label, rx: 60, ry: 15,
    })),
  ]
  const edges = state.useCases.map((uc, i) => ({
    id: `e${i}`, source: state.actorId, target: uc.id,
  }))
  return JSON.stringify({ nodes, edges }, null, 2)
}

function treeToJson(root: TreeNode): string {
  const nodes: any[] = []
  const edges: any[] = []
  function walk(node: TreeNode) {
    nodes.push({ id: node.id, type: 'rectangle', label: node.label, vertical: node.vertical })
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
      id: a.id, type: 'ellipse', label: a.label, rx: 45, ry: 18,
    })),
  ]
  const edges = state.attributes.map((a, i) => ({
    id: `e${i}`, source: state.entityId, target: a.id,
  }))
  return JSON.stringify({ nodes, edges }, null, 2)
}

// ====== Main ======

export default function NodeEditor({ type, useCase, tree, entity, onApply }: Props) {
  return (
    <div className="w-[420px] shrink-0 border-r border-gray-200 bg-gray-50 flex flex-col h-full">
      <div className="px-4 py-3 border-b border-gray-200 bg-white">
        <h2 className="text-sm font-semibold">
          {type === 'usecase' && '用例图 - 节点编辑'}
          {type === 'structure' && '功能结构图 - 节点编辑'}
          {type === 'entity' && '实体属性图 - 节点编辑'}
        </h2>
        <p className="text-xs text-gray-500 mt-0.5">双击编辑 · Enter 保存 · Tab 下一个 · 末尾 Tab 新建</p>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {type === 'usecase' && useCase && <UseCaseEditor state={useCase} onApply={onApply} />}
        {type === 'structure' && tree && <TreeEditor root={tree} onApply={onApply} />}
        {type === 'entity' && entity && <EntityEditor state={entity} onApply={onApply} />}
      </div>
      <div className="px-3 py-2 border-t border-gray-200 bg-white text-[10px] text-gray-400 leading-relaxed">
        <div>软件工程图生成器 v1.0</div>
        <div>© 2026 版权所有</div>
        <div>ICP 备 2026000001 号</div>
      </div>
    </div>
  )
}

// ====== InlineEdit helper ======

function InlineEdit({
  value,
  onSave,
  onDelete,
  onTab,
  className = '',
}: {
  value: string
  onSave: (val: string) => void
  onDelete?: () => void
  onTab?: () => void
  className?: string
}) {
  const [text, setText] = useState(value)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    ref.current?.select()
  }, [])

  const commit = () => {
    const v = text.trim()
    if (v) onSave(v)
    else onDelete?.()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      commit()
    }
    if (e.key === 'Tab') {
      e.preventDefault()
      commit()
      onTab?.()
    }
    if (e.key === 'Escape') {
      onSave(value)
    }
  }

  return (
    <input
      ref={ref}
      className={`text-sm border border-black rounded px-1 py-0.5 bg-white focus:outline-none ${className}`}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={commit}
    />
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
  const [editingId, setEditingId] = useState<string | null>(null)
  const [focusedIdx, setFocusedIdx] = useState<number | null>(null)
  const [dragIdx, setDragIdx] = useState<number | null>(null)

  const addUseCase = () => {
    const label = newLabel.trim()
    if (!label) return
    setState((s) => ({ ...s, useCases: [...s.useCases, { id: uid(), label }] }))
    setNewLabel('')
  }

  const removeUseCase = (id: string) => {
    setState((s) => ({ ...s, useCases: s.useCases.filter((uc) => uc.id !== id) }))
    if (editingId === id) setEditingId(null)
  }

  const renameUseCase = (id: string, label: string) => {
    setState((s) => ({
      ...s,
      useCases: s.useCases.map((uc) => (uc.id === id ? { ...uc, label } : uc)),
    }))
  }

  const moveUseCase = (from: number, to: number) => {
    setState((s) => {
      const arr = [...s.useCases]
      const [item] = arr.splice(from, 1)
      arr.splice(to, 0, item)
      return { ...s, useCases: arr }
    })
    setDragIdx(null)
  }

  const handleNewKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') addUseCase()
  }

  return (
    <div className="space-y-4">
      {/* Actor */}
      <div>
        <div className="text-xs font-medium text-gray-500 mb-1">角色 (Actor)</div>
        <div className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 rounded">
          <span className="text-xs text-gray-400 mr-1">角色</span>
          <input
            className="flex-1 text-sm bg-transparent focus:outline-none"
            value={state.actorLabel}
            onChange={(e) => setState((s) => ({ ...s, actorLabel: e.target.value }))}
          />
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
            onKeyDown={handleNewKeyDown}
          />
          <button
            onClick={addUseCase}
            className="px-3 py-1.5 text-sm bg-black text-white rounded hover:bg-gray-800"
          >
            添加
          </button>
        </div>
        <div className="space-y-1">
          {state.useCases.map((uc, i) => (
            <div
              key={uc.id}
              draggable
              tabIndex={0}
              className={`flex items-center justify-between px-3 py-1.5 bg-white border rounded text-sm cursor-default transition-colors ${
                focusedIdx === i ? 'border-black ring-1 ring-black' : 'border-gray-200'
              } ${dragIdx === i ? 'opacity-40' : ''}`}
              onDoubleClick={() => setEditingId(uc.id)}
              onFocus={() => setFocusedIdx(i)}
              onBlur={() => setFocusedIdx(null)}
              onKeyDown={(e) => {
                if (e.key === 'Delete' || e.key === 'Backspace') {
                  if (editingId !== uc.id) removeUseCase(uc.id)
                }
                if (e.key === 'Enter') setEditingId(uc.id)
              }}
              onDragStart={() => setDragIdx(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragIdx !== null && dragIdx !== i) moveUseCase(dragIdx, i)
              }}
              onDragEnd={() => setDragIdx(null)}
            >
              <span className="text-xs text-gray-300 mr-1 cursor-grab select-none">⋮⋮</span>
              {editingId === uc.id ? (
                <InlineEdit
                  value={uc.label}
                  onSave={(v) => { renameUseCase(uc.id, v); setEditingId(null) }}
                  onDelete={() => { removeUseCase(uc.id); setEditingId(null) }}
                  onTab={() => {
                    if (i + 1 < state.useCases.length) {
                      setEditingId(state.useCases[i + 1].id)
                    } else {
                      const newId = uid()
                      setState((s) => ({ ...s, useCases: [...s.useCases, { id: newId, label: '' }] }))
                      setTimeout(() => setEditingId(newId), 0)
                    }
                  }}
                  className="flex-1"
                />
              ) : (
                <span className="flex-1">{uc.label}</span>
              )}
              <button
                onClick={() => removeUseCase(uc.id)}
                className="text-gray-400 hover:text-red-500 text-lg leading-none ml-2 shrink-0"
                title="删除"
              >
                ×
              </button>
            </div>
          ))}
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

// ====== Tree Editor ======

function updateTreeNode(node: TreeNode, targetId: string, fn: (n: TreeNode) => TreeNode): TreeNode {
  if (node.id === targetId) return fn(node)
  return { ...node, children: node.children.map((c) => updateTreeNode(c, targetId, fn)) }
}

function deleteTreeNode(node: TreeNode, targetId: string): TreeNode | null {
  if (node.id === targetId) return null
  return {
    ...node,
    children: node.children.map((c) => deleteTreeNode(c, targetId)).filter((c): c is TreeNode => c !== null),
  }
}

/** 收集树中所有兄弟 ID 组（按父节点分组） */
function getSiblingGroups(node: TreeNode, groups: Map<string, string[]>) {
  if (node.children.length > 0) {
    groups.set(node.id, node.children.map((c) => c.id))
  }
  node.children.forEach((c) => getSiblingGroups(c, groups))
}

function TreeEditor({
  root: initialRoot,
  onApply,
}: {
  root: TreeNode
  onApply: (json: string) => void
}) {
  const [root, setRoot] = useState<TreeNode>(initialRoot)
  const [editingId, setEditingId] = useState<string | null>(null)

  const handleAddChild = (parentId: string, label: string) => {
    setRoot((prev) =>
      updateTreeNode(prev, parentId, (node) => ({
        ...node,
        children: [...node.children, { id: uid(), label, vertical: false, children: [] }],
      }))
    )
  }

  const handleDelete = (nodeId: string) => {
    setRoot((prev) => deleteTreeNode(prev, nodeId) ?? prev)
    if (editingId === nodeId) setEditingId(null)
  }

  const handleRename = (nodeId: string, label: string) => {
    setRoot((prev) => updateTreeNode(prev, nodeId, (node) => ({ ...node, label })))
  }

  // Find next sibling for Tab navigation
  const siblingGroups = new Map<string, string[]>()
  getSiblingGroups(root, siblingGroups)

  const handleTabFrom = (nodeId: string) => {
    for (const [parentId, siblings] of siblingGroups) {
      const idx = siblings.indexOf(nodeId)
      if (idx !== -1) {
        if (idx + 1 < siblings.length) {
          setEditingId(siblings[idx + 1])
        } else {
          // 末尾 Tab → 在父节点下新建空白兄弟节点
          const newId = uid()
          setRoot((prev) =>
            updateTreeNode(prev, parentId, (node) => ({
              ...node,
              children: [...node.children, { id: newId, label: '', vertical: false, children: [] }],
            }))
          )
          setTimeout(() => setEditingId(newId), 0)
        }
        return
      }
    }
    setEditingId(null)
  }

  return (
    <div className="space-y-3">
      <TreeNodeRow
        node={root}
        depth={0}
        editingId={editingId}
        onStartEdit={setEditingId}
        onAddChild={handleAddChild}
        onDelete={handleDelete}
        onRename={handleRename}
        onTab={handleTabFrom}
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
  editingId,
  onStartEdit,
  onAddChild,
  onDelete,
  onRename,
  onTab,
}: {
  node: TreeNode
  depth: number
  editingId: string | null
  onStartEdit: (id: string) => void
  onAddChild: (parentId: string, label: string) => void
  onDelete: (nodeId: string) => void
  onRename: (nodeId: string, label: string) => void
  onTab: (nodeId: string) => void
}) {
  const [adding, setAdding] = useState(false)
  const [childLabel, setChildLabel] = useState('')
  const isEditing = editingId === node.id

  const confirmAdd = () => {
    const label = childLabel.trim()
    if (!label) return
    onAddChild(node.id, label)
    setChildLabel('')
    setAdding(false)
  }

  const handleAddKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') confirmAdd()
    if (e.key === 'Escape') { setAdding(false); setChildLabel('') }
  }

  return (
    <div>
      <div
        className="flex items-center gap-1 py-1 px-2 rounded hover:bg-gray-100 group"
        style={{ marginLeft: depth * 16 }}
      >
        <span className="text-xs text-gray-400">
          {depth === 0 ? '根' : depth === 1 ? '模块' : '功能'}
        </span>

        {isEditing ? (
          <InlineEdit
            value={node.label}
            onSave={(v) => { onRename(node.id, v); onStartEdit('') }}
            onDelete={() => { onDelete(node.id); onStartEdit('') }}
            onTab={() => onTab(node.id)}
            className="flex-1"
          />
        ) : (
          <span
            className="flex-1 text-sm truncate cursor-default"
            onDoubleClick={() => onStartEdit(node.id)}
          >
            {node.label}
          </span>
        )}

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

      {adding && (
        <div className="flex gap-1 my-1" style={{ marginLeft: (depth + 1) * 16 }}>
          <input
            autoFocus
            className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-black"
            placeholder={depth < 1 ? '模块名称...' : '功能名称...'}
            value={childLabel}
            onChange={(e) => setChildLabel(e.target.value)}
            onKeyDown={handleAddKeyDown}
          />
          <button onClick={confirmAdd} className="px-2 py-1 text-xs bg-black text-white rounded hover:bg-gray-800">确定</button>
          <button onClick={() => { setAdding(false); setChildLabel('') }} className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-100">取消</button>
        </div>
      )}

      {node.children.map((child) => (
        <TreeNodeRow
          key={child.id}
          node={child}
          depth={depth + 1}
          editingId={editingId}
          onStartEdit={onStartEdit}
          onAddChild={onAddChild}
          onDelete={onDelete}
          onRename={onRename}
          onTab={onTab}
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
  const [editingId, setEditingId] = useState<string | null>(null)
  const [focusedIdx, setFocusedIdx] = useState<number | null>(null)
  const [dragIdx, setDragIdx] = useState<number | null>(null)

  const addAttr = () => {
    const label = newAttrLabel.trim()
    if (!label) return
    setState((s) => ({ ...s, attributes: [...s.attributes, { id: uid(), label }] }))
    setNewAttrLabel('')
  }

  const removeAttr = (id: string) => {
    setState((s) => ({ ...s, attributes: s.attributes.filter((a) => a.id !== id) }))
    if (editingId === id) setEditingId(null)
  }

  const renameAttr = (id: string, label: string) => {
    setState((s) => ({
      ...s,
      attributes: s.attributes.map((a) => (a.id === id ? { ...a, label } : a)),
    }))
  }

  const moveAttr = (from: number, to: number) => {
    setState((s) => {
      const arr = [...s.attributes]
      const [item] = arr.splice(from, 1)
      arr.splice(to, 0, item)
      return { ...s, attributes: arr }
    })
    setDragIdx(null)
  }

  const handleNewKeyDown = (e: React.KeyboardEvent) => {
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
          onChange={(e) => setState((s) => ({ ...s, entityLabel: e.target.value }))}
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
            onKeyDown={handleNewKeyDown}
          />
          <button onClick={addAttr} className="px-3 py-1.5 text-sm bg-black text-white rounded hover:bg-gray-800">
            添加
          </button>
        </div>
        <div className="space-y-1">
          {state.attributes.map((a, i) => (
            <div
              key={a.id}
              draggable
              tabIndex={0}
              className={`flex items-center justify-between px-3 py-1.5 bg-white border rounded text-sm cursor-default transition-colors ${
                focusedIdx === i ? 'border-black ring-1 ring-black' : 'border-gray-200'
              } ${dragIdx === i ? 'opacity-40' : ''}`}
              onDoubleClick={() => setEditingId(a.id)}
              onFocus={() => setFocusedIdx(i)}
              onBlur={() => setFocusedIdx(null)}
              onKeyDown={(e) => {
                if (e.key === 'Delete' || e.key === 'Backspace') {
                  if (editingId !== a.id) removeAttr(a.id)
                }
                if (e.key === 'Enter') setEditingId(a.id)
              }}
              onDragStart={() => setDragIdx(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragIdx !== null && dragIdx !== i) moveAttr(dragIdx, i)
              }}
              onDragEnd={() => setDragIdx(null)}
            >
              <span className="text-xs text-gray-300 mr-1 cursor-grab select-none">⋮⋮</span>
              {editingId === a.id ? (
                <InlineEdit
                  value={a.label}
                  onSave={(v) => { renameAttr(a.id, v); setEditingId(null) }}
                  onDelete={() => { removeAttr(a.id); setEditingId(null) }}
                  onTab={() => {
                    if (i + 1 < state.attributes.length) {
                      setEditingId(state.attributes[i + 1].id)
                    } else {
                      const newId = uid()
                      setState((s) => ({ ...s, attributes: [...s.attributes, { id: newId, label: '' }] }))
                      setTimeout(() => setEditingId(newId), 0)
                    }
                  }}
                  className="flex-1"
                />
              ) : (
                <span className="flex-1">{a.label}</span>
              )}
              <button
                onClick={() => removeAttr(a.id)}
                className="text-gray-400 hover:text-red-500 text-lg leading-none ml-2 shrink-0"
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
