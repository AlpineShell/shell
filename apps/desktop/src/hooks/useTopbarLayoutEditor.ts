import { useCallback, useEffect, useRef, useState } from 'react'
import { EMPTY_TOPBAR_LAYOUT, resolveTopbarLayout, storeTopbarLayout } from '../components/topbar/layout/topbarLayout'

export const REFUSED_WRITE_MESSAGE = 'Ridge could not save that change.'

let lastKnownItems: TopbarLayoutItem[] | null = null

function rememberItems(items: TopbarLayoutItem[]) {
  lastKnownItems = items
}

function startingItems(): TopbarLayoutItem[] {
  return lastKnownItems ?? resolveTopbarLayout(window.topbar?.initialLayout ?? EMPTY_TOPBAR_LAYOUT)
}

async function readLayout(): Promise<StoredTopbarLayout | null> {
  try {
    return await window.topbar.layout()
  } catch {
    return null
  }
}

async function sendLayout(stored: StoredTopbarLayout): Promise<StoredTopbarLayout | null> {
  try {
    return await window.topbar.setLayout(stored)
  } catch {
    return null
  }
}

export function useTopbarLayoutEditor(): TopbarLayoutEditor {
  const [items, setItems] = useState(startingItems)
  const [error, setError] = useState<string | null>(null)
  const pendingWrites = useRef(0)
  const writesStarted = useRef(0)

  const adopt = useCallback((stored: StoredTopbarLayout) => {
    const next = resolveTopbarLayout(stored)
    rememberItems(next)
    setItems(next)
  }, [])

  const adoptWhenSettled = useCallback(
    (stored: StoredTopbarLayout) => {
      if (pendingWrites.current === 0) adopt(stored)
    },
    [adopt]
  )

  useEffect(() => {
    const writesBeforeRead = writesStarted.current
    readLayout().then((stored) => {
      if (stored && writesStarted.current === writesBeforeRead) adoptWhenSettled(stored)
    })
    return window.topbar.onLayoutChanged(adoptWhenSettled)
  }, [adoptWhenSettled])

  const recoverFromRefusal = useCallback(async () => {
    setError(REFUSED_WRITE_MESSAGE)
    const current = await readLayout()
    if (current) adoptWhenSettled(current)
  }, [adoptWhenSettled])

  const write = useCallback(
    async (stored: StoredTopbarLayout): Promise<boolean> => {
      writesStarted.current += 1
      pendingWrites.current += 1
      adopt(stored)
      setError(null)
      const saved = await sendLayout(stored)
      pendingWrites.current -= 1
      if (!saved) {
        await recoverFromRefusal()
        return false
      }
      adoptWhenSettled(saved)
      return true
    },
    [adopt, adoptWhenSettled, recoverFromRefusal]
  )

  const commit = useCallback((next: TopbarLayoutItem[]) => write(storeTopbarLayout(next)), [write])
  const reset = useCallback(() => write(EMPTY_TOPBAR_LAYOUT), [write])

  return { items, error, commit, reset }
}
