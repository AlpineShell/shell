import { useEffect, useState } from 'react'
import { AlertTriangle, ChevronDown, FolderOpen, Puzzle, RefreshCw, ShieldCheck } from 'lucide-react'
import { PERMISSION_META, type PermissionTier } from '@alpine/plugin-sdk'

const TIER_BADGE: Record<PermissionTier, { label: string; className: string }> = {
  auto: { label: 'auto', className: 'bg-white/10 text-white/50' },
  read: { label: 'read', className: 'bg-sky-500/20 text-sky-200' },
  control: { label: 'control', className: 'bg-amber-500/20 text-amber-200' },
  sensitive: { label: 'sensitive', className: 'bg-orange-500/25 text-orange-200' },
  node: { label: 'backend', className: 'bg-red-500/25 text-red-200' },
}

function assetUrl(id: string, rel?: string | null): string | null {
  if (!rel || rel.startsWith('lucide:')) return null
  return `alpine-plugin://${id}/${rel}`
}

function PermissionList({ plugin }: { plugin: PluginRecord }) {
  const perms = [...plugin.permissions, ...plugin.optionalPermissions]
  if (perms.length === 0) {
    return <div className="text-[12px] text-white/40">Requests no special permissions.</div>
  }
  const rationale = plugin.marketplace?.permissionRationale ?? {}
  return (
    <ul className="flex flex-col gap-2">
      {perms.map((perm) => {
        const meta = PERMISSION_META[perm as keyof typeof PERMISSION_META]
        const tier = meta?.tier ?? 'read'
        const badge = TIER_BADGE[tier]
        const optional = plugin.optionalPermissions.includes(perm)
        return (
          <li key={perm} className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-white/85">{meta?.label ?? perm}</span>
              <span className={`text-[9px] uppercase tracking-wide rounded px-1.5 py-0.5 ${meta ? badge.className : 'bg-red-500/30 text-red-200'}`}>
                {meta ? badge.label : 'unknown'}
              </span>
              {optional && <span className="text-[9px] uppercase tracking-wide rounded px-1.5 py-0.5 bg-white/10 text-white/40">optional</span>}
            </div>
            <span className="text-[11px] text-white/45">{rationale[perm] || meta?.description || perm}</span>
          </li>
        )
      })}
    </ul>
  )
}

function PluginCard({ plugin, onToggle }: { plugin: PluginRecord; onToggle: (p: PluginRecord) => void }) {
  const [open, setOpen] = useState(false)
  const [readme, setReadme] = useState<string | null>(null)
  const enabled = plugin.enabled !== false
  const logo = assetUrl(plugin.id, plugin.marketplace?.logo || plugin.icon)
  const subtitle = plugin.marketplace?.shortDescription || plugin.description

  useEffect(() => {
    if (open && readme === null && plugin.marketplace?.readme) {
      window.plugins.readme(plugin.id).then((text) => setReadme(text ?? '')).catch(() => setReadme(''))
    }
  }, [open, readme, plugin.id, plugin.marketplace?.readme])

  return (
    <li className="rounded-lg bg-white/5 overflow-hidden">
      <div className="flex items-center gap-3 px-3 h-14">
        {logo ? (
          <img src={logo} alt="" className="w-8 h-8 rounded shrink-0 object-cover" />
        ) : (
          <Puzzle size={18} className="text-white/40 shrink-0" />
        )}
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-[13px] text-white truncate flex items-center gap-2">
            {plugin.name}
            <span className="text-[11px] text-white/30">{plugin.version && plugin.version !== '0.0.0' ? `v${plugin.version}` : ''}</span>
            {plugin.preset && <span className="text-[9px] uppercase tracking-wide text-white/40 bg-white/10 rounded px-1.5 py-0.5">Preset</span>}
            {plugin.verified ? (
              <span className="inline-flex items-center gap-0.5 text-[9px] uppercase tracking-wide text-emerald-200 bg-emerald-500/20 rounded px-1.5 py-0.5"><ShieldCheck size={9} /> Verified</span>
            ) : !plugin.preset ? (
              <span className="text-[9px] uppercase tracking-wide text-white/40 bg-white/10 rounded px-1.5 py-0.5">Unverified</span>
            ) : null}
          </span>
          <span className="text-[11px] text-white/40 truncate">{subtitle || plugin.id}</span>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="text-white/40 hover:text-white/70 transition-colors p-1 cursor-pointer"
          aria-label="Details"
        >
          <ChevronDown size={16} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        <button
          onClick={() => onToggle(plugin)}
          role="switch"
          aria-checked={enabled}
          className="relative shrink-0 cursor-pointer rounded-full transition-colors"
          style={{ width: 26, height: 14, backgroundColor: enabled ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.18)' }}
        >
          <span
            className="absolute top-0.5 rounded-full transition-all"
            style={{ width: 10, height: 10, left: enabled ? 14 : 2, backgroundColor: enabled ? 'rgb(20,20,20)' : 'rgba(255,255,255,0.7)' }}
          />
        </button>
      </div>

      {!plugin.loadable && (
        <div className="flex items-center gap-2 px-3 pb-2 -mt-1 text-[11px] text-amber-300/90">
          <AlertTriangle size={12} /> {plugin.compat?.reason || (plugin.errors[0] ?? 'Cannot load this plugin.')}
        </div>
      )}

      {open && (
        <div className="px-3 pb-3 pt-1 border-t border-white/5 flex flex-col gap-3">
          {plugin.description && <p className="text-[12px] text-white/60 leading-relaxed">{plugin.description}</p>}
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] uppercase tracking-wide text-white/40">Permissions</span>
            <PermissionList plugin={plugin} />
          </div>
          {plugin.marketplace?.readme && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] uppercase tracking-wide text-white/40">Readme</span>
              <pre className="text-[11px] text-white/55 whitespace-pre-wrap font-sans max-h-56 overflow-y-auto bg-black/20 rounded p-2">
                {readme === null ? 'Loading…' : readme || 'No readme.'}
              </pre>
            </div>
          )}
          {plugin.errors.length > 0 && (
            <div className="text-[11px] text-amber-300/80">
              {plugin.errors.map((e, i) => (
                <div key={i}>• {e}</div>
              ))}
            </div>
          )}
          <div className="text-[10px] text-white/25 font-mono break-all">{plugin.id}</div>
        </div>
      )}
    </li>
  )
}

export default function PluginsPage() {
  const [plugins, setPlugins] = useState<PluginRecord[]>([])
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

  async function toggle(plugin: PluginRecord) {
    const next = plugin.enabled === false
    setPlugins((prev) => prev.map((p) => (p.id === plugin.id ? { ...p, enabled: next } : p)))
    try {
      await window.plugins.setEnabled(plugin.id, next)
    } catch {
      /* ignore */
    } finally {
      refresh()
    }
  }

  return (
    <div className="w-full">
      <h1 className="text-lg font-semibold mb-1">Plugins</h1>
      <p className="text-[13px] text-white/50 mb-5 leading-relaxed">
        Presets ship with Alpine. Drop a plugin folder into your plugins directory, then reload. Expand a plugin to
        review the exact permissions it requests. Plugins run with full shell access — only add ones you trust.
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
          {plugins.map((plugin) => (
            <PluginCard key={plugin.id} plugin={plugin} onToggle={toggle} />
          ))}
        </ul>
      )}
    </div>
  )
}
