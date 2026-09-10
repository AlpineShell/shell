import { useSyncExternalStore } from 'react'

const HIGHLIGHT_DURATION = 2500

let highlighted: string | null = null
let fade: ReturnType<typeof setTimeout> | null = null
const listeners = new Set<() => void>()

function publish(next: string | null) {
  highlighted = next
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function highlightSetting(id: string) {
  if (fade) clearTimeout(fade)
  publish(id)
  fade = setTimeout(() => {
    fade = null
    publish(null)
  }, HIGHLIGHT_DURATION)
}

export function useHighlightedSetting(id: string): boolean {
  return useSyncExternalStore(subscribe, () => highlighted === id)
}
