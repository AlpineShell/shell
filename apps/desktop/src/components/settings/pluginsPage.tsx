import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  ChevronDown,
  Download,
  FolderOpen,
  Loader2,
  Puzzle,
  RefreshCw,
  ShieldCheck,
  Store,
  Trash2,
} from 'lucide-react'

const ERROR_LABEL: Record<string, string> = {
  'not-found': 'no longer in the marketplace',
  'catalog-unreachable': "couldn't reach the marketplace",
  'download-failed': 'download failed',
  'digest-mismatch': 'failed an integrity check',
  'bad-digest': 'missing a valid checksum',
  'bad-bundle-url': 'invalid bundle location',
  'too-large': 'bundle too large',
  'empty-bundle': 'empty bundle',
  'no-manifest': 'no plugin.json in the bundle',
  'bad-manifest': 'invalid plugin.json',
  'id-mismatch': "bundle id doesn't match the listing",
  'install-failed': 'could not be unpacked',
}

function assetUrl(id: string, rel?: string | null): string | null {
  if (!rel || rel.startsWith('lucide:')) return null
  if (/^https?:\/\//i.test(rel)) return rel
  return `alpine-plugin://${id}/${rel}`
}

// Only report an update when the catalog version is strictly newer, so a
// rolled-back / mis-published catalog can't advertise a downgrade as an "Update".
function semverGt(a: string, b: string): boolean {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0)
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return true
    if ((pa[i] || 0) < (pb[i] || 0)) return false
  }
  return false
}

/* ─────────────────────────── Installed tab ─────────────────────────── */

function InstalledCard({
  plugin,
  onToggle,
  onUninstall,
  removing,
}: {
  plugin: PluginRecord
  onToggle: (p: PluginRecord) => void
  onUninstall: (p: PluginRecord) => void
  removing: boolean
}) {
  const [open, setOpen] = useState(false)
  const enabled = plugin.enabled !== false
  const logo = assetUrl(plugin.id, plugin.marketplace?.logo || plugin.icon)
  const subtitle = plugin.marketplace?.shortDescription || plugin.description

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
            <span className="text-[11px] text-white/30">
              {plugin.version && plugin.version !== '0.0.0' ? `v${plugin.version}` : ''}
            </span>
            {plugin.preset && (
              <span className="text-[9px] uppercase tracking-wide text-white/40 bg-white/10 rounded px-1.5 py-0.5">
                Preset
              </span>
            )}
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
          {plugin.errors.length > 0 && (
            <div className="text-[11px] text-amber-300/80">
              {plugin.errors.map((e, i) => (
                <div key={i}>• {e}</div>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between">
            <div className="text-[10px] text-white/25 font-mono break-all">{plugin.id}</div>
            {!plugin.preset && (
              <button
                onClick={() => onUninstall(plugin)}
                disabled={removing}
                className="flex items-center gap-1.5 h-7 px-2.5 rounded-md bg-red-500/10 hover:bg-red-500/20 text-[12px] text-red-200 cursor-pointer transition-colors shrink-0 disabled:opacity-50 disabled:cursor-default"
              >
                {removing ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />} Uninstall
              </button>
            )}
          </div>
        </div>
      )}
    </li>
  )
}

/* ─────────────────────────── Browse tab ─────────────────────────── */

type BrowseState =
  | { status: 'loading' }
  | { status: 'error'; message: string; base: string }
  | { status: 'ready'; plugins: MarketplacePlugin[]; base: string }

function BrowseCard({
  plugin,
  installedVersion,
  installing,
  onInstall,
}: {
  plugin: MarketplacePlugin
  installedVersion: string | null
  installing: boolean
  onInstall: (p: MarketplacePlugin) => void
}) {
  const [open, setOpen] = useState(false)
  const logo = plugin.iconUrl
  const installed = installedVersion !== null
  const canUpdate = installed && semverGt(plugin.version, installedVersion)

  return (
    <li className="rounded-lg bg-white/5 overflow-hidden">
      <div className="flex items-center gap-3 px-3 py-2.5">
        {logo ? (
          <img src={logo} alt="" className="w-9 h-9 rounded-lg shrink-0 object-cover" />
        ) : (
          <div className="w-9 h-9 rounded-lg shrink-0 bg-white/5 flex items-center justify-center">
            <Puzzle size={18} className="text-white/40" />
          </div>
        )}
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-[13px] text-white truncate flex items-center gap-2">
            {plugin.name}
            <span className="text-[11px] text-white/30">v{plugin.version}</span>
          </span>
          <span className="text-[11px] text-white/40 truncate">{plugin.shortDescription || plugin.id}</span>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="text-white/40 hover:text-white/70 transition-colors p-1 cursor-pointer shrink-0"
          aria-label="Details"
        >
          <ChevronDown size={16} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {installing ? (
          <span className="flex items-center gap-1.5 h-8 px-3 rounded-md bg-white/5 text-[12px] text-white/45 shrink-0">
            <Loader2 size={13} className="animate-spin" /> Installing…
          </span>
        ) : installed && !canUpdate ? (
          <span className="flex items-center gap-1.5 h-8 px-3 rounded-md bg-white/5 text-[12px] text-white/45 shrink-0">
            <ShieldCheck size={13} /> Installed
          </span>
        ) : (
          <button
            onClick={() => onInstall(plugin)}
            className="flex items-center gap-1.5 h-8 px-3 rounded-md bg-white/90 hover:bg-white text-[12px] font-medium text-black cursor-pointer transition-colors shrink-0"
          >
            <Download size={13} /> {installed ? 'Update' : 'Install'}
          </button>
        )}
      </div>

      {open && (
        <div className="px-3 pb-3 pt-1 border-t border-white/5 flex flex-col gap-3">
          {plugin.description && <p className="text-[12px] text-white/60 leading-relaxed">{plugin.description}</p>}
          <div className="flex items-center justify-between text-[10px] text-white/25">
            <span className="font-mono break-all">{plugin.id}</span>
            {plugin.author && <span>by {plugin.author}</span>}
          </div>
        </div>
      )}
    </li>
  )
}

/* ─────────────────────────── Page ─────────────────────────── */

export default function PluginsPage() {
  const [tab, setTab] = useState<'installed' | 'browse'>('installed')
  const [plugins, setPlugins] = useState<PluginRecord[]>([])
  const [reloading, setReloading] = useState(false)
  const [browse, setBrowse] = useState<BrowseState>({ status: 'loading' })
  const [installingId, setInstallingId] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const installedById = new Map(plugins.map((p) => [p.id, p]))

  const refreshInstalled = useCallback(async () => {
    try {
      setPlugins(await window.plugins.list())
    } catch {
      /* ignore */
    }
  }, [])

  const loadBrowse = useCallback(async () => {
    setBrowse({ status: 'loading' })
    try {
      const index = await window.plugins.marketplace.list()
      setBrowse({ status: 'ready', plugins: index.plugins, base: index.base })
    } catch (e) {
      let base = ''
      try {
        base = await window.plugins.marketplace.base()
      } catch {
        /* ignore */
      }
      setBrowse({ status: 'error', message: e instanceof Error ? e.message : 'Unknown error', base })
    }
  }, [])

  useEffect(() => {
    refreshInstalled()
    loadBrowse()
  }, [refreshInstalled, loadBrowse])

  const install = useCallback(
    async (plugin: MarketplacePlugin) => {
      if (installingId) return
      setNotice(null)
      setInstallingId(plugin.id)
      const res = await window.plugins.marketplace
        .install({ id: plugin.id, version: plugin.version })
        .catch((e): InstallResult => ({ ok: false, error: 'install-failed', detail: String(e) }))
      setInstallingId(null)
      if (res.ok) {
        await refreshInstalled()
      } else {
        setNotice(`Couldn't install ${plugin.name} — ${ERROR_LABEL[res.error] || res.error}.`)
      }
    },
    [installingId, refreshInstalled],
  )

  // Forward-compat seam for the website "Install in Alpine Shell" deep link.
  const installRef = useRef(install)
  installRef.current = install
  const browseRef = useRef(browse)
  browseRef.current = browse
  useEffect(() => {
    return window.plugins.onDeepInstall(async ({ id }) => {
      setTab('browse')
      const b = browseRef.current
      const found = b.status === 'ready' ? b.plugins.find((p) => p.id === id) : undefined
      const target = found ?? (await window.plugins.marketplace.detail(id).catch(() => null))
      if (target) installRef.current(target)
    })
  }, [])

  async function reload() {
    setReloading(true)
    try {
      await window.plugins.reload()
      await refreshInstalled()
    } finally {
      setReloading(false)
    }
  }

  async function toggle(plugin: PluginRecord) {
    const next = plugin.enabled === false
    setPlugins((prev) => prev.map((p) => (p.id === plugin.id ? { ...p, enabled: next } : p)))
    try {
      await window.plugins.setEnabled(plugin.id, next)
    } finally {
      refreshInstalled()
    }
  }

  async function uninstall(plugin: PluginRecord) {
    if (removingId) return
    setNotice(null)
    setRemovingId(plugin.id)
    const res = await window.plugins.marketplace
      .uninstall(plugin.id)
      .catch(() => ({ ok: false, error: 'failed' }))
    setRemovingId(null)
    if (res.ok || res.error === 'not-installed') {
      setNotice(`Removed ${plugin.name}.`)
      await refreshInstalled()
    } else {
      setNotice(`Couldn't remove ${plugin.name}.`)
    }
  }

  return (
    <div className="w-full">
      <h1 className="text-lg font-semibold mb-1">Plugins</h1>
      <p className="text-[13px] text-white/50 mb-4 leading-relaxed">
        Browse the marketplace and install with one click, or drop a plugin folder into your plugins directory.
      </p>

      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-1 bg-white/5 rounded-lg p-1 w-fit">
          <button
            onClick={() => setTab('installed')}
            className={`flex items-center gap-1.5 h-8 px-3.5 rounded-md text-[13px] cursor-pointer transition-colors ${
              tab === 'installed' ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white/80'
            }`}
          >
            <Puzzle size={14} /> Installed
            {plugins.length > 0 && <span className="text-[11px] text-white/40">{plugins.length}</span>}
          </button>
          <button
            onClick={() => setTab('browse')}
            className={`flex items-center gap-1.5 h-8 px-3.5 rounded-md text-[13px] cursor-pointer transition-colors ${
              tab === 'browse' ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white/80'
            }`}
          >
            <Store size={14} /> Browse
          </button>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {tab === 'installed' ? (
            <>
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
                <RefreshCw size={14} className={reloading ? 'animate-spin' : ''} /> Reload
              </button>
            </>
          ) : (
            <button
              onClick={loadBrowse}
              className="flex items-center gap-2 h-8 px-3 rounded-md bg-white/5 hover:bg-white/10 text-[13px] text-white/80 cursor-pointer transition-colors"
            >
              <RefreshCw size={14} className={browse.status === 'loading' ? 'animate-spin' : ''} /> Refresh
            </button>
          )}
        </div>
      </div>

      {notice && <div className="mb-4 text-[12px] text-white/70 bg-white/5 rounded-md px-3 py-2">{notice}</div>}

      {tab === 'installed' ? (
        plugins.length === 0 ? (
          <div className="flex flex-col items-center gap-2 text-center border border-white/10 rounded-lg py-10 px-6">
            <Puzzle size={22} className="text-white/30" />
            <span className="text-[13px] text-white/50">No plugins installed yet.</span>
            <button
              onClick={() => setTab('browse')}
              className="mt-1 text-[12px] text-sky-300 hover:text-sky-200 cursor-pointer"
            >
              Browse the marketplace →
            </button>
          </div>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {plugins.map((plugin) => (
              <InstalledCard
                key={plugin.id}
                plugin={plugin}
                onToggle={toggle}
                onUninstall={uninstall}
                removing={removingId === plugin.id}
              />
            ))}
          </ul>
        )
      ) : browse.status === 'loading' ? (
        <div className="flex items-center justify-center gap-2 py-12 text-[13px] text-white/40">
          <Loader2 size={16} className="animate-spin" /> Loading marketplace…
        </div>
      ) : browse.status === 'error' ? (
        <div className="flex flex-col items-center gap-2 text-center border border-white/10 rounded-lg py-10 px-6">
          <AlertTriangle size={22} className="text-amber-300/70" />
          <span className="text-[13px] text-white/60">Couldn&apos;t reach the marketplace.</span>
          {browse.base && <span className="text-[11px] text-white/30 font-mono break-all">{browse.base}</span>}
          <button onClick={loadBrowse} className="mt-1 text-[12px] text-sky-300 hover:text-sky-200 cursor-pointer">
            Try again
          </button>
        </div>
      ) : browse.plugins.length === 0 ? (
        <div className="flex flex-col items-center gap-2 text-center border border-white/10 rounded-lg py-10 px-6">
          <Store size={22} className="text-white/30" />
          <span className="text-[13px] text-white/50">No plugins published yet.</span>
        </div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {browse.plugins.map((plugin) => (
            <BrowseCard
              key={plugin.id}
              plugin={plugin}
              installedVersion={installedById.get(plugin.id)?.version ?? null}
              installing={installingId === plugin.id}
              onInstall={install}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
