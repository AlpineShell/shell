import { useCallback, useEffect, useRef, useState } from 'react'

export function useFileHandlers() {
  const [handlers, setHandlers] = useState<FileHandlerState[]>([])
  const [loading, setLoading] = useState(true)
  const mounted = useRef(true)

  const refresh = useCallback(async () => {
    const next = await window.fileHandlers.state().catch(() => [] as FileHandlerState[])
    if (!mounted.current) return
    setHandlers(next)
    setLoading(false)
  }, [])

  useEffect(() => {
    mounted.current = true
    refresh()
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      mounted.current = false
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [refresh])

  return { handlers, loading, refresh }
}
