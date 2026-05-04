import { useState, useRef, useEffect } from 'react'

// ====== Types ======

export interface UseCaseState {
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
}

export interface EntityState {
  entities: {
    id: string
    label: string
    attributes: { id: string; label: string }[]
  }[]
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
function uid(): string { return 'n' + _id++ }

// ====== JSON generators ======

function useCaseToJson(state: UseCaseState): string {
  const nodes: any[] = []
  const edges: any[] = []
  state.actors.forEach((actor) => {
    nodes.push({ id: actor.id, type: 'actor', label: actor.label })
    actor.useCases.forEach((uc, i) => {
      nodes.push({ id: uc.id, type: 'usecase', label: uc.label, rx: 60, ry: 15 })
      edges.push({ id: `e_${actor.id}_${i}`, source: actor.id, target: uc.id })
    })
  })
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
  const nodes: any[] = []
  const edges: any[] = []
  state.entities.forEach((ent) => {
    nodes.push({ id: ent.id, type: 'rectangle', label: ent.label })
    ent.attributes.forEach((a, i) => {
      nodes.push({ id: a.id, type: 'ellipse', label: a.label, rx: 45, ry: 18 })
      edges.push({ id: `e_${ent.id}_${i}`, source: ent.id, target: a.id })
    })
  })
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
      <div className="px-3 py-2 border-t border-gray-200 bg-white text-[10px] text-gray-400 text-center">
        &copy; 2026 软件工程图生成器 v1.0 &nbsp;|&nbsp;
        <a href="https://beian.miit.gov.cn" target="_blank" rel="noopener noreferrer" className="hover:text-gray-600">陕ICP备20011108号-2</a>
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
  const [state, setState] = useState<UseCaseState>(initial)
  const [editingId, setEditingId] = useState<string | null>(null)

  const addActor = () => {
    setState((s) => ({ actors: [...s.actors, { id: uid(), label: '新角色', useCases: [] }] }))
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
      {state.actors.map((actor) => (
        <ActorSection key={actor.id} actor={actor} editingId={editingId} setEditingId={setEditingId}
          onRename={(l) => renameActor(actor.id, l)} onRemove={() => removeActor(actor.id)}
          onAddUc={(id, l) => addUseCase(actor.id, id, l)} onRemoveUc={(id) => removeUseCase(actor.id, id)}
          onRenameUc={(id, l) => renameUseCase(actor.id, id, l)}
          onMoveUc={(from, to) => moveUseCase(actor.id, from, to)} />
      ))}

      <div className="flex gap-2">
        <button onClick={addActor} className="flex-1 py-2 text-sm border-2 border-dashed border-gray-300 rounded hover:border-gray-500 hover:bg-gray-100 text-gray-500">
          + 添加角色
        </button>
        <button onClick={() => setShowImport(true)} className="px-3 py-2 text-sm border border-gray-300 rounded hover:bg-gray-100 text-gray-500">
          快速导入
        </button>
      </div>

      <button onClick={() => onApply(useCaseToJson(state))}
        className="w-full py-2 bg-black text-white text-sm font-medium rounded hover:bg-gray-800">
        应用修改
      </button>

      {showImport && (
        <QuickImport title="快速导入用例" example="管理员 业主管理 维修人员管理 公寓设施管理\n业主 个人中心 报修服务 维修评价"
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
        <span className="text-xs text-gray-400 mr-1">角色</span>
        <input className="flex-1 text-sm bg-transparent focus:outline-none font-medium"
          value={actor.label} onChange={(e) => onRename(e.target.value)} />
        <span className="text-xs text-gray-400">({actor.useCases.length})</span>
        <button onClick={onRemove} className="text-gray-400 hover:text-red-500 text-sm ml-1" title="删除角色">×</button>
      </div>
      <div className="px-3 py-2">
        <div className="flex gap-1 mb-2">
          <input className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-black"
            placeholder="添加用例..." value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add() }} />
          <button onClick={add} className="px-2 py-1 text-xs bg-black text-white rounded hover:bg-gray-800">添加</button>
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
              <button onClick={() => onRemoveUc(uc.id)} className="text-gray-400 hover:text-red-500 text-sm ml-1 shrink-0" title="删除">×</button>
            </div>
          ))}
          {actor.useCases.length === 0 && (
            <div className="text-xs text-gray-400 text-center py-2">尚无用例，在上方输入添加</div>
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
  const [root, setRoot] = useState<TreeNode>(initialRoot)
  const [editingId, setEditingId] = useState<string | null>(null)

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
      <TreeNodeRow node={root} depth={0} editingId={editingId} onStartEdit={setEditingId}
        onAddChild={handleAddChild} onDelete={handleDelete} onRename={handleRename} onTab={handleTabFrom} />
      <button onClick={() => onApply(treeToJson(root))}
        className="w-full py-2 bg-black text-white text-sm font-medium rounded hover:bg-gray-800 mt-4">
        应用修改
      </button>
    </div>
  )
}

const typeColors: Record<number, string> = {
  0: 'text-blue-700 bg-blue-50 border-blue-200',
  1: 'text-emerald-700 bg-emerald-50 border-emerald-200',
}
const typeLabels: Record<number, string> = { 0: '根', 1: '模块', 2: '功能' }

function TreeNodeRow({ node, depth, editingId, onStartEdit, onAddChild, onDelete, onRename, onTab }: {
  node: TreeNode; depth: number; editingId: string | null
  onStartEdit: (id: string) => void; onAddChild: (pid: string, label: string) => void
  onDelete: (id: string) => void; onRename: (id: string, label: string) => void; onTab: (id: string) => void
}) {
  const [adding, setAdding] = useState(false)
  const [childLabel, setChildLabel] = useState('')
  const isEditing = editingId === node.id
  const wrap = depth === 1
  const tc = typeColors[depth] || 'text-gray-500 bg-gray-100 border-gray-200'

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
          {typeLabels[depth] || '功能'}
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
        <button onClick={() => setAdding(!adding)} className="text-gray-400 hover:text-black text-sm px-1 opacity-0 group-hover:opacity-100 transition-opacity" title="添加子节点">+</button>
        {depth > 0 && (
          <button onClick={() => onDelete(node.id)} className="text-gray-400 hover:text-red-500 text-sm px-1 opacity-0 group-hover:opacity-100 transition-opacity" title="删除">×</button>
        )}
      </div>
      {adding && (
        <div className="flex gap-1 my-1" style={{ marginLeft: depth >= 2 ? 16 : (depth + 1) * 16 }}>
          <input autoFocus className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-black"
            placeholder={depth < 1 ? '模块名称...' : '功能名称...'} value={childLabel}
            onChange={(e) => setChildLabel(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') confirmAdd(); if (e.key === 'Escape') { setAdding(false); setChildLabel('') } }} />
          <button onClick={confirmAdd} className="px-2 py-1 text-xs bg-black text-white rounded hover:bg-gray-800">确定</button>
          <button onClick={() => { setAdding(false); setChildLabel('') }} className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-100">取消</button>
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
  const [state, setState] = useState<EntityState>(initial)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showImport, setShowImport] = useState(false)

  const addEntity = () => {
    setState((s) => ({ entities: [...s.entities, { id: uid(), label: '新实体', attributes: [] }] }))
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
      {state.entities.map((ent) => (
        <div key={ent.id} className="border border-gray-200 rounded-lg bg-white">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100">
            <span className="text-xs text-gray-400 mr-1">实体</span>
            <input className="flex-1 text-sm bg-transparent focus:outline-none font-medium"
              value={ent.label} onChange={(e) => renameEntity(ent.id, e.target.value)} />
            <span className="text-xs text-gray-400">({ent.attributes.length})</span>
            <button onClick={() => removeEntity(ent.id)} className="text-gray-400 hover:text-red-500 text-sm ml-1" title="删除实体">×</button>
          </div>
          <div className="px-3 py-2">
            <AttrList entId={ent.id} attributes={ent.attributes} editingId={editingId} setEditingId={setEditingId}
              onAdd={(id, l) => addAttr(ent.id, id, l)} onRemove={(id) => removeAttr(ent.id, id)}
              onRename={(id, l) => renameAttr(ent.id, id, l)} onMove={(f, t) => moveAttr(ent.id, f, t)} />
          </div>
        </div>
      ))}

      <div className="flex gap-2">
        <button onClick={addEntity} className="flex-1 py-2 text-sm border-2 border-dashed border-gray-300 rounded hover:border-gray-500 hover:bg-gray-100 text-gray-500">
          + 添加实体
        </button>
        <button onClick={() => setShowImport(true)} className="px-3 py-2 text-sm border border-gray-300 rounded hover:bg-gray-100 text-gray-500">
          快速导入
        </button>
      </div>

      <button onClick={() => onApply(entityToJson(state))}
        className="w-full py-2 bg-black text-white text-sm font-medium rounded hover:bg-gray-800">
        应用修改
      </button>

      {showImport && (
        <QuickImport title="快速导入实体" example="用户 用户ID 用户名 密码 手机号 角色\n维修人员 员工ID 姓名 技能类型 联系电话 当前状态"
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
        <p className="text-xs text-gray-500 mb-2">每行一个角色/实体，空格分隔：第一个词为名称，后续为元素</p>
        <textarea className="w-full h-28 text-xs font-mono border border-gray-300 rounded p-2 mb-2 focus:outline-none focus:ring-1 focus:ring-black"
          placeholder={`示例:\n${example}`} value={text}
          onChange={(e) => setText(e.target.value)} />
        <div className="text-[10px] text-gray-400 mb-3 bg-gray-50 rounded p-2">
          示例格式：{example.split('\n').map((line, i) => <span key={i}>{i > 0 && <br />}{line}</span>)}
        </div>
        <div className="flex gap-2">
          <button onClick={handleImport} className="flex-1 py-2 bg-black text-white text-sm font-medium rounded hover:bg-gray-800">导入</button>
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-100">取消</button>
        </div>
      </div>
    </div>
  )
}

function AttrList({ entId, attributes, editingId, setEditingId, onAdd, onRemove, onRename, onMove }: {
  entId: string; attributes: { id: string; label: string }[]
  editingId: string | null; setEditingId: (id: string | null) => void
  onAdd: (id: string, label: string) => void; onRemove: (id: string) => void
  onRename: (id: string, label: string) => void; onMove: (from: number, to: number) => void
}) {
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
          placeholder="添加属性..." value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add() }} />
        <button onClick={add} className="px-2 py-1 text-xs bg-black text-white rounded hover:bg-gray-800">添加</button>
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
            <button onClick={() => onRemove(a.id)} className="text-gray-400 hover:text-red-500 text-sm ml-1 shrink-0" title="删除">×</button>
          </div>
        ))}
        {attributes.length === 0 && (
          <div className="text-xs text-gray-400 text-center py-2">尚无属性，在上方输入添加</div>
        )}
      </div>
    </div>
  )
}
