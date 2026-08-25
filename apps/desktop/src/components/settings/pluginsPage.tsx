import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  Download,
  ExternalLink,
  FolderOpen,
  Loader2,
  Puzzle,
  RefreshCw,
  ShieldCheck,
  Store,
  Trash2,
} from 'lucide-react'
import PageTitle from '../ui/pageTitle'
import Toggle from '../ui/toggle'
import Button from '../ui/button'

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
  const enabled = plugin.enabled !== false
  const logo = assetUrl(plugin.id, plugin.marketplace?.logo || plugin.icon)
  const subtitle = plugin.marketplace?.shortDescription || plugin.description

  return (
    <li className="rounded-card border border-line-hairline bg-surface-2 overflow-hidden">
      <div className="flex items-center gap-3 px-3 h-14">
        {logo ? (
          <img src={logo} alt="" className="w-8 h-8 rounded shrink-0 object-cover" />
        ) : (
          <Puzzle size={18} className="text-ink-faint shrink-0" />
        )}
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-dense text-ink-primary truncate flex items-center gap-2">
            {plugin.name}
            <span className="text-[11px] text-ink-faint">
              {plugin.version && plugin.version !== '0.0.0' ? `v${plugin.version}` : ''}
            </span>
            {plugin.preset && (
              <span className="text-eyebrow uppercase text-ink-quiet bg-fill-ghost rounded px-1.5 py-0.5">
                Preset
              </span>
            )}
          </span>
          <span className="text-[11px] text-ink-quiet truncate">{subtitle || plugin.id}</span>
        </div>
        {!plugin.preset && (
          <button
            onClick={() => onUninstall(plugin)}
            disabled={removing}
            aria-label="Uninstall"
            className="focus-ring text-ink-quiet hover:text-danger transition-colors p-1 cursor-pointer disabled:opacity-50 disabled:cursor-default"
          >
            {removing ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
          </button>
        )}
        <Toggle label={`Enable ${plugin.name}`} checked={enabled} onChange={() => onToggle(plugin)} />
      </div>

      {!plugin.loadable && (
        <div className="flex items-center gap-2 px-3 pb-2 -mt-1 text-[11px] text-warning">
          <AlertTriangle size={12} /> {plugin.compat?.reason || (plugin.errors[0] ?? 'Cannot load this plugin.')}
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
  const logo = plugin.iconUrl
  const installed = installedVersion !== null
  const canUpdate = installed && semverGt(plugin.version, installedVersion)

  return (
    <li className="rounded-card border border-line-hairline bg-surface-2 overflow-hidden">
      <div className="flex items-center gap-3 px-3 py-2.5">
        {logo ? (
          <img src={logo} alt="" className="w-9 h-9 rounded-lg shrink-0 object-cover" />
        ) : (
          <div className="w-9 h-9 rounded-field shrink-0 bg-surface-3 flex items-center justify-center">
            <Puzzle size={18} className="text-ink-faint" />
          </div>
        )}
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-dense text-ink-primary truncate flex items-center gap-2">
            {plugin.name}
            <span className="text-[11px] text-ink-faint">v{plugin.version}</span>
          </span>
          <span className="text-[11px] text-ink-quiet truncate">{plugin.shortDescription || plugin.id}</span>
        </div>
        <button
          onClick={() => window.plugins.marketplace.openWeb(plugin.id)}
          className="focus-ring text-ink-quiet hover:text-ink-primary transition-colors p-1 cursor-pointer shrink-0"
          aria-label="View on the web"
          title="View on the web"
        >
          <ExternalLink size={15} />
        </button>
        {installing ? (
          <span className="flex items-center gap-1.5 h-8 px-3 rounded-full bg-fill-subtle text-[12px] text-ink-quiet shrink-0">
            <Loader2 size={13} className="animate-spin" /> Installing…
          </span>
        ) : installed && !canUpdate ? (
          <span className="flex items-center gap-1.5 h-8 px-3 rounded-full bg-fill-subtle text-[12px] text-ink-quiet shrink-0">
            <ShieldCheck size={13} /> Installed
          </span>
        ) : (
          <Button size="sm" onClick={() => onInstall(plugin)} className="font-medium shrink-0">
            <Download size={13} /> {installed ? 'Update' : 'Install'}
          </Button>
        )}
      </div>
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
      setInstallingId(plugin.id)
      const res = await window.plugins.marketplace
        .install({ id: plugin.id, version: plugin.version })
        .catch((e): InstallResult => ({ ok: false, error: 'install-failed', detail: String(e) }))
      setInstallingId(null)
      if (res.ok) await refreshInstalled()
      else console.error(`[plugins] install ${plugin.id} failed:`, res.error, res.detail)
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
    setRemovingId(plugin.id)
    const res = await window.plugins.marketplace
      .uninstall(plugin.id)
      .catch(() => ({ ok: false, error: 'failed' }))
    setRemovingId(null)
    if (res.ok || res.error === 'not-installed') await refreshInstalled()
    else console.error(`[plugins] uninstall ${plugin.id} failed:`, res.error)
  }

  return (
    <div className="w-full">
      <div className="mb-4">
        <PageTitle
          title="Plugins"
          subtitle="Browse the marketplace and install with one click, or drop a plugin folder into your plugins directory."
        />
      </div>

      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-1 rounded-full border border-line-hairline p-1 w-fit">
          <button
            onClick={() => setTab('installed')}
            className={`focus-ring flex items-center gap-1.5 h-8 px-3.5 rounded-full text-dense cursor-pointer transition-colors ${
              tab === 'installed' ? 'bg-fill-solid text-on-solid' : 'text-ink-quiet hover:bg-fill-ghost hover:text-ink-primary'
            }`}
          >
            <Puzzle size={14} /> Installed
            {plugins.length > 0 && <span className="text-[11px] opacity-70">{plugins.length}</span>}
          </button>
          <button
            onClick={() => setTab('browse')}
            className={`focus-ring flex items-center gap-1.5 h-8 px-3.5 rounded-full text-dense cursor-pointer transition-colors ${
              tab === 'browse' ? 'bg-fill-solid text-on-solid' : 'text-ink-quiet hover:bg-fill-ghost hover:text-ink-primary'
            }`}
          >
            <Store size={14} /> Browse
          </button>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {tab === 'installed' ? (
            <>
              <Button variant="outline" size="sm" onClick={() => window.plugins.openFolder()}>
                <FolderOpen size={14} /> Open plugins folder
              </Button>
              <Button variant="ghost" size="sm" onClick={reload}>
                <RefreshCw size={14} className={reloading ? 'animate-spin' : ''} /> Reload
              </Button>
            </>
          ) : (
            <Button variant="ghost" size="sm" onClick={loadBrowse}>
              <RefreshCw size={14} className={browse.status === 'loading' ? 'animate-spin' : ''} /> Refresh
            </Button>
          )}
        </div>
      </div>

      {tab === 'installed' ? (
        plugins.length === 0 ? (
          <div className="flex flex-col items-center gap-2 text-center border border-line-hairline rounded-card py-10 px-6">
            <Puzzle size={22} className="text-ink-faint" />
            <span className="text-dense text-ink-quiet">No plugins installed yet.</span>
            <button
              onClick={() => setTab('browse')}
              className="focus-ring mt-1 cursor-pointer text-[12px] text-ink-primary underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-ink-primary"
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
        <div className="flex items-center justify-center gap-2 py-12 text-dense text-ink-quiet">
          <Loader2 size={16} className="animate-spin" /> Loading marketplace…
        </div>
      ) : browse.status === 'error' ? (
        <div className="flex flex-col items-center gap-2 text-center border border-line-hairline rounded-card py-10 px-6">
          <AlertTriangle size={22} className="text-warning" />
          <span className="text-dense text-ink-secondary">Couldn&apos;t reach the marketplace.</span>
          {browse.base && <span className="text-[11px] text-ink-faint font-mono break-all">{browse.base}</span>}
          <button onClick={loadBrowse} className="focus-ring mt-1 cursor-pointer text-[12px] text-ink-primary underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-ink-primary">
            Try again
          </button>
        </div>
      ) : browse.plugins.length === 0 ? (
        <div className="flex flex-col items-center gap-2 text-center border border-line-hairline rounded-card py-10 px-6">
          <Store size={22} className="text-ink-faint" />
          <span className="text-dense text-ink-quiet">No plugins published yet.</span>
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
