import { useEffect, useState } from 'react'
import { loadPluginComponent, renewPluginModules } from '../plugins/loadPlugins'

const LOADING: PluginComponentLoad = { status: 'loading' }

export function usePluginComponent(pluginId: string, entry: string, exportName: string): PluginComponentLoad {
  const [load, setLoad] = useState<PluginComponentLoad>(LOADING)

  useEffect(() => {
    let alive = true
    function show() {
      loadPluginComponent(pluginId, entry, exportName).then((component) => {
        if (alive) setLoad(component ? { status: 'ready', component } : { status: 'missing' })
      })
    }
    show()
    const stopListening = window.plugins.onReload(() => {
      renewPluginModules()
      show()
    })
    return () => {
      alive = false
      stopListening()
    }
  }, [pluginId, entry, exportName])

  return load
}
