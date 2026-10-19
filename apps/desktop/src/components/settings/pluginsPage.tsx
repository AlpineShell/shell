import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  Download,
  ExternalLink,
  FolderOpen,
  Puzzle,
  RefreshCw,
  RotateCw,
  Settings2,
  ShieldCheck,
  Store,
  Trash2,
} from 'lucide-react'
import { Avatar, Badge, Button, ConfirmButton, EmptyState, IconButton, ListRow, PageHeader, Segmented, Spinner, Toggle, type SegmentedOption } from '@alpine/ui'
import { pluginLogoUrl } from '../../plugins/pluginAssets'
import { pluginSettingsPage } from '../../plugins/pluginSettingsPages'

type PluginTab = 'installed' | 'browse'

const UNVERIFIED_MESSAGE = 'Not installed: its signature could not be verified.'
const INSTALL_FAILED_MESSAGE = "Couldn't install. Try again."
const UNINSTALL_FAILED_MESSAGE = "Couldn't uninstall. Try again."

function installFailureMessage(error: string): string {
  return error === 'unverified' ? UNVERIFIED_MESSAGE : INSTALL_FAILED_MESSAGE
}

function semverGt(a: string, b: string): boolean {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0)
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return true
    if ((pa[i] || 0) < (pb[i] || 0)) return false
  }
  return false
}

function versionLabel(version?: string | null): string | null {
  return version && version !== '0.0.0' ? `v${version}` : null
}

function RowNotice({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 border-t border-line-hairline bg-warning/10 px-3 py-2 text-xs text-warning">
      <AlertTriangle size={12} className="shrink-0" />
      {message}
    </div>
  )
}

function InstalledCard({ plugin, settingsRoute, removing, failure, onToggle, onUninstall, onNavigate }: InstalledPluginCardProps) {
  const enabled = plugin.enabled !== false
  const logo = pluginLogoUrl(plugin)
  const subtitle = plugin.marketplace?.shortDescription || plugin.description
  const version = versionLabel(plugin.version)

  return (
    <li>
      <ListRow
        icon={<Avatar src={logo} alt={plugin.name} fallback={<Puzzle size={16} />} />}
        title={plugin.name}
        badges={
          <>
            {version && <Badge>{version}</Badge>}
            {plugin.preset && <Badge>Preset</Badge>}
          </>
        }
        detail={subtitle || plugin.id}
        actions={
          <>
            {settingsRoute && (
              <IconButton label={`${plugin.name} settings`} onClick={() => onNavigate(settingsRoute)}>
                <Settings2 size={16} />
              </IconButton>
            )}
            {!plugin.preset && (
              <ConfirmButton
                iconOnly
                confirmOnly
                label="Uninstall"
                confirmLabel={`Uninstall ${plugin.name}`}
                icon={<Trash2 size={16} />}
                onConfirm={() => onUninstall(plugin)}
                busy={removing}
              />
            )}
            <Toggle label={`Enable ${plugin.name}`} checked={enabled} onChange={() => onToggle(plugin)} />
          </>
        }
      >
        {!plugin.loadable && <RowNotice message={plugin.compat?.reason || (plugin.errors[0] ?? 'Cannot load this plugin.')} />}
        {failure && <RowNotice message={failure} />}
      </ListRow>
    </li>
  )
}

type BrowseState =
  | { status: 'loading' }
  | { status: 'error'; message: string; base: string }
  | { status: 'ready'; plugins: MarketplacePlugin[]; base: string }

function BrowseCard({ plugin, installedVersion, installing, requested, failure, onInstall }: BrowsePluginCardProps) {
  const installed = installedVersion !== null
  const canUpdate = installed && semverGt(plugin.version, installedVersion)
  const anchor = useRef<HTMLLIElement>(null)

  useEffect(() => {
    if (requested) anchor.current?.scrollIntoView({ block: 'center' })
  }, [requested])

  return (
    <li ref={anchor} className={requested ? 'rounded-card ring-1 ring-line-strong' : undefined}>
      <ListRow
        icon={<Avatar src={plugin.iconUrl} alt={plugin.name} fallback={<Puzzle size={16} />} />}
        title={plugin.name}
        badges={<Badge>v{plugin.version}</Badge>}
        detail={plugin.shortDescription || plugin.id}
        actions={
          <>
            <IconButton label="View on the web" onClick={() => window.plugins.marketplace.openWeb(plugin.id)}>
              <ExternalLink size={15} />
            </IconButton>
            {installing ? (
              <Badge>
                <Spinner size={13} /> Installing…
              </Badge>
            ) : installed && !canUpdate ? (
              <Badge tone="success">
                <ShieldCheck size={13} /> Installed
              </Badge>
            ) : (
              <Button size="sm" onClick={() => onInstall(plugin)} icon={<Download size={13} />}>
                {installed ? 'Update' : 'Install'}
              </Button>
            )}
          </>
        }
      >
        {failure && <RowNotice message={failure} />}
      </ListRow>
    </li>
  )
}

export default function PluginsPage({ onNavigate }: PluginsPageProps) {
  const [tab, setTab] = useState<PluginTab>('installed')
  const [plugins, setPlugins] = useState<PluginRecord[]>([])
  const [reloading, setReloading] = useState(false)
  const [browse, setBrowse] = useState<BrowseState>({ status: 'loading' })
  const [installingId, setInstallingId] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [requested, setRequested] = useState<MarketplacePlugin | null>(null)
  const [failures, setFailures] = useState<Record<string, string>>({})

  const installedById = new Map(plugins.map((p) => [p.id, p]))

  const recordFailure = useCallback((id: string, message: string | null) => {
    setFailures((prev) => {
      const next = { ...prev }
      if (message) next[id] = message
      else delete next[id]
      return next
    })
  }, [])

  const refreshInstalled = useCallback(async () => {
    const list = await window.plugins.list().catch(() => null)
    if (list) setPlugins(list)
  }, [])

  const loadBrowse = useCallback(async () => {
    setBrowse({ status: 'loading' })
    try {
      const index = await window.plugins.marketplace.list()
      setBrowse({ status: 'ready', plugins: index.plugins, base: index.base })
    } catch (e) {
      const base = await window.plugins.marketplace.base().catch(() => '')
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
      recordFailure(plugin.id, null)
      const res = await window.plugins.marketplace
        .install({ id: plugin.id, version: plugin.version })
        .catch((e): InstallResult => ({ ok: false, error: 'install-failed', detail: String(e) }))
      setInstallingId(null)
      if (res.ok) {
        await refreshInstalled()
        return
      }
      console.error(`[plugins] install ${plugin.id} failed:`, res.error, res.detail)
      recordFailure(plugin.id, installFailureMessage(res.error))
    },
    [installingId, recordFailure, refreshInstalled],
  )

  const browseRef = useRef(browse)
  browseRef.current = browse
  useEffect(() => {
    return window.plugins.onDeepInstall(async ({ id }) => {
      setTab('browse')
      const b = browseRef.current
      const found = b.status === 'ready' ? b.plugins.find((p) => p.id === id) : undefined
      setRequested(found ?? (await window.plugins.marketplace.detail(id).catch(() => null)))
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
    recordFailure(plugin.id, null)
    const res = await window.plugins.marketplace
      .uninstall(plugin.id)
      .catch(() => ({ ok: false, error: 'failed' }))
    setRemovingId(null)
    if (res.ok || res.error === 'not-installed') {
      await refreshInstalled()
      return
    }
    console.error(`[plugins] uninstall ${plugin.id} failed:`, res.error)
    recordFailure(plugin.id, UNINSTALL_FAILED_MESSAGE)
  }

  const listedPlugins = browse.status === 'ready' ? browse.plugins : []
  const browsePlugins =
    requested && !listedPlugins.some((p) => p.id === requested.id) ? [requested, ...listedPlugins] : listedPlugins

  const tabs: SegmentedOption<PluginTab>[] = [
    {
      value: 'installed',
      label: (
        <span className="flex items-center gap-1.5">
          <Puzzle size={14} /> Installed
          {plugins.length > 0 && <span className="opacity-70">{plugins.length}</span>}
        </span>
      ),
    },
    {
      value: 'browse',
      label: (
        <span className="flex items-center gap-1.5">
          <Store size={14} /> Browse
        </span>
      ),
    },
  ]

  return (
    <div className="flex w-full flex-col gap-5">
      <PageHeader variant="plain" title="Plugins" />

      <div className="flex items-center justify-between gap-3">
        <Segmented label="Plugin view" options={tabs} value={tab} onChange={setTab} />
        <div className="flex shrink-0 items-center gap-1">
          {tab === 'installed' ? (
            <>
              <IconButton label="Open plugins folder" onClick={() => window.plugins.openFolder()}>
                <FolderOpen size={16} />
              </IconButton>
              <IconButton label="Reload" onClick={reload} busy={reloading}>
                <RotateCw size={16} />
              </IconButton>
            </>
          ) : (
            <IconButton label="Refresh" onClick={loadBrowse} busy={browse.status === 'loading'}>
              <RefreshCw size={16} />
            </IconButton>
          )}
        </div>
      </div>

      {tab === 'installed' ? (
        plugins.length === 0 ? (
          <EmptyState variant="plain" title="No plugins installed yet." />
        ) : (
          <ul className="flex flex-col gap-1.5">
            {plugins.map((plugin) => (
              <InstalledCard
                key={plugin.id}
                plugin={plugin}
                settingsRoute={pluginSettingsPage(plugin)?.route ?? null}
                removing={removingId === plugin.id}
                failure={failures[plugin.id] ?? null}
                onToggle={toggle}
                onUninstall={uninstall}
                onNavigate={onNavigate}
              />
            ))}
          </ul>
        )
      ) : browse.status === 'loading' ? (
        <EmptyState variant="plain" icon={<Spinner size={14} />} title="Loading marketplace…" />
      ) : browse.status === 'error' ? (
        <EmptyState
          variant="plain"
          icon={<AlertTriangle size={14} className="text-warning" />}
          title="Couldn't reach the marketplace."
          detail={browse.base && <span className="font-mono break-all">{browse.base}</span>}
        />
      ) : browsePlugins.length === 0 ? (
        <EmptyState variant="plain" title="No plugins published yet." />
      ) : (
        <ul className="flex flex-col gap-1.5">
          {browsePlugins.map((plugin) => (
            <BrowseCard
              key={plugin.id}
              plugin={plugin}
              installedVersion={installedById.get(plugin.id)?.version ?? null}
              installing={installingId === plugin.id}
              requested={requested?.id === plugin.id}
              failure={failures[plugin.id] ?? null}
              onInstall={install}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
