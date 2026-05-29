import { useState, useCallback, useRef, useEffect } from 'react'

export function useUndoRedo<T>(initial: T) {
  const [past, setPast] = useState<T[]>([])
  const [present, setPresent] = useState<T>(initial)
  const [future, setFuture] = useState<T[]>([])
  const skipRef = useRef(false)
  const presentRef = useRef(present)
  const pastRef = useRef(past)
  const futureRef = useRef(future)

  // Keep refs in sync
  useEffect(() => { presentRef.current = present }, [present])
  useEffect(() => { pastRef.current = past }, [past])
  useEffect(() => { futureRef.current = future }, [future])

  const push = useCallback((val: T) => {
    if (skipRef.current) {
      skipRef.current = false
      setPresent(val)
      return
    }
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
    skipRef.current = true
    setPresent(prev)
  }, [])

  const redo = useCallback(() => {
    const f = futureRef.current
    if (f.length === 0) return
    const next = f[0]
    setFuture((ff) => ff.slice(1))
    setPast((p) => [...p, presentRef.current])
    skipRef.current = true
    setPresent(next)
  }, [])

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
