import { useState, useCallback, useRef, useEffect } from 'react'

/** 判断事件目标是否为可编辑元素（输入框内应放行浏览器原生撤销/重做） */
function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || !!el.isContentEditable
}

export function useUndoRedo<T>(initial: T) {
  const [past, setPast] = useState<T[]>([])
  const [present, setPresent] = useState<T>(initial)
  const [future, setFuture] = useState<T[]>([])
  const presentRef = useRef(present)
  const pastRef = useRef(past)
  const futureRef = useRef(future)

  // Keep refs in sync
  useEffect(() => { presentRef.current = present }, [present])
  useEffect(() => { pastRef.current = past }, [past])
  useEffect(() => { futureRef.current = future }, [future])

  const push = useCallback((val: T) => {
    // 任何新操作都要：入栈、清空重做栈
    setPast((p) => [...p, presentRef.current])
    setPresent(val)
    setFuture([])
  }, [])

  const undo = useCallback(() => {
    const p = pastRef.current
    if (p.length === 0) return
    const prev = p[p.length - 1]
    setPast((pp) => pp.slice(0, -1))
    setFuture((f) => [presentRef.current, ...f])
    setPresent(prev)
  }, [])

  const redo = useCallback(() => {
    const f = futureRef.current
    if (f.length === 0) return
    const next = f[0]
    setFuture((ff) => ff.slice(1))
    setPast((p) => [...p, presentRef.current])
    setPresent(next)
  }, [])

  // Ctrl+Z / Ctrl+Y（焦点在输入框时交给浏览器原生处理）
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [undo, redo])

  return { present, push, undo, redo, canUndo: past.length > 0, canRedo: future.length > 0 }
}
