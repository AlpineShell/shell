import { useEffect } from 'react'
import { loadTopbarPlugins } from '../plugins/loadPlugins'

export function useRidgeLivePlugins() {
  useEffect(() => {
    loadTopbarPlugins()
    return window.plugins.onReload(() => loadTopbarPlugins())
  }, [])
}
