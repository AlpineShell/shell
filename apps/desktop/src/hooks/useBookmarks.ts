import { useEffect, useState } from 'react'

export function useBookmarks(enabled: boolean): Bookmark[] {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])

  useEffect(() => {
    if (!enabled) {
      setBookmarks([])
      return
    }
    let alive = true
    const apply = (data: Bookmark[]) => { if (alive) setBookmarks(data) }
    window.shell.bookmarks.list().then(apply).catch(() => {})
    const unsubscribe = window.shell.bookmarks.onChanged(apply)
    return () => {
      alive = false
      unsubscribe?.()
    }
  }, [enabled])

  return bookmarks
}
