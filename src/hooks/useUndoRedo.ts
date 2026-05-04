import { useState, useCallback, useRef, useEffect } from 'react'

export function useUndoRedo<T>(initial: T) {
  const [past, setPast] = useState<T[]>([])
  const [present, setPresent] = useState<T>(initial)
  const [future, setFuture] = useState<T[]>([])
  const skipRef = useRef(false)

  const push = useCallback((val: T) => {
    if (skipRef.current) {
      skipRef.current = false
      setPresent(val)
      return
    }
    setPast((p) => [...p, present])
    setPresent(val)
    setFuture([])
  }, [present])

  const undo = useCallback(() => {
    if (past.length === 0) return
    const prev = past[past.length - 1]
    setPast((p) => p.slice(0, -1))
    setFuture((f) => [present, ...f])
    skipRef.current = true
    setPresent(prev)
  }, [past, present])

  const redo = useCallback(() => {
    if (future.length === 0) return
    const next = future[0]
    setFuture((f) => f.slice(1))
    setPast((p) => [...p, present])
    skipRef.current = true
    setPresent(next)
  }, [future, present])

  // Ctrl+Z / Ctrl+Y
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault()
        undo()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [undo, redo])

  return { present, push, undo, redo, canUndo: past.length > 0, canRedo: future.length > 0 }
}
