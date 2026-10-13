import { useEffect, useState } from 'react'
import { createSemanticIndex, parseSemanticModel } from '../lib/semantic/semanticModel'

let loadedIndex: SemanticIndex | null = null
let pendingIndex: Promise<SemanticIndex | null> | null = null

export function loadSemanticIndex(): Promise<SemanticIndex | null> {
  if (!pendingIndex) {
    pendingIndex = window.launcher
      .semanticModel()
      .then((bytes) => {
        loadedIndex = bytes ? createSemanticIndex(parseSemanticModel(bytes)) : null
        return loadedIndex
      })
      .catch((error: unknown) => {
        console.error('[launcher] semantic search model failed to load:', error)
        return null
      })
  }
  return pendingIndex
}

export function useSemanticIndex(): SemanticIndex | null {
  const [index, setIndex] = useState<SemanticIndex | null>(() => loadedIndex)

  useEffect(() => {
    if (index) return
    let alive = true
    loadSemanticIndex().then((loaded) => {
      if (alive) setIndex(loaded)
    })
    return () => {
      alive = false
    }
  }, [index])

  return index
}
