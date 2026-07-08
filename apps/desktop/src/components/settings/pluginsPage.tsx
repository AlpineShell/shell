import { useEffect, useState } from 'react'
import { FolderOpen, Puzzle, RefreshCw } from 'lucide-react'

export default function PluginsPage() {
  const [plugins, setPlugins] = useState<PluginListItem[]>([])
  const [dir, setDir] = useState('')
  const [reloading, setReloading] = useState(false)

  async function refresh() {
    try {
      const [list, folder] = await Promise.all([window.plugins.list(), window.plugins.dir()])
      setPlugins(list)
      setDir(folder)
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  async function reload() {
    setReloading(true)
    try {
      await window.plugins.reload()
      await refresh()
    } finally {
      setReloading(false)
    }
  }

  async function toggle(plugin: PluginListItem) {
    await window.plugins.setEnabled(plugin.id, plugin.enabled === false)
    await refresh()
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-lg font-semibold mb-1">Plugins</h1>
      <p className="text-[13px] text-white/50 mb-5 leading-relaxed">
        Presets ship with Alpine. Drop a plugin folder into your plugins directory, then reload. Plugins run with
        full shell access — only add ones you trust.
      </p>

      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => window.plugins.openFolder()}
          className="flex items-center gap-2 h-8 px-3 rounded-md bg-white/10 hover:bg-white/15 text-[13px] text-white cursor-pointer transition-colors"
        >
          <FolderOpen size={14} /> Open plugins folder
        </button>
        <button
          onClick={reload}
          className="flex items-center gap-2 h-8 px-3 rounded-md bg-white/5 hover:bg-white/10 text-[13px] text-white/80 cursor-pointer transition-colors"
        >
          <RefreshCw size={14} className={reloading ? 'animate-spin' : ''} /> Reload plugins
        </button>
      </div>

      {dir && <div className="text-[11px] text-white/30 mb-5 font-mono break-all">{dir}</div>}

      {plugins.length === 0 ? (
        <div className="flex flex-col items-center gap-2 text-center border border-white/10 rounded-lg py-10 px-6">
          <Puzzle size={22} className="text-white/30" />
          <span className="text-[13px] text-white/50">No plugins installed yet.</span>
          <span className="text-[12px] text-white/30">Open the plugins folder, drop a plugin in, then reload.</span>
        </div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {plugins.map((plugin) => {
            const enabled = plugin.enabled !== false
            return (
              <li key={plugin.id} className="flex items-center gap-3 px-3 h-12 rounded-lg bg-white/5">
                <Puzzle size={16} className="text-white/40 shrink-0" />
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-[13px] text-white truncate">
                    {plugin.name}
                    {plugin.preset && (
                      <span className="ml-2 align-middle text-[10px] uppercase tracking-wide text-white/40 bg-white/10 rounded px-1.5 py-0.5">
                        Preset
                      </span>
                    )}
                  </span>
                  <span className="text-[11px] text-white/40 truncate">{plugin.id}</span>
                </div>
                <button
                  onClick={() => toggle(plugin)}
                  role="switch"
                  aria-checked={enabled}
                  className={`relative w-9 h-5 rounded-full shrink-0 cursor-pointer transition-colors ${
                    enabled ? 'bg-white/70' : 'bg-white/15'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-4 w-4 rounded-full bg-black/80 transition-transform ${
                      enabled ? 'translate-x-4' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
