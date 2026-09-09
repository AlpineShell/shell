import { useMemo, useState } from 'react'
import { AppWindow, Boxes, ExternalLink, FolderOpen, Search, Trash2 } from 'lucide-react'
import { useInstalledApps } from '../../hooks/useInstalledApps'
import { useStartupApps } from '../../hooks/useStartupApps'
import Avatar from '../ui/avatar'
import Button from '../ui/button'
import EmptyState from '../ui/emptyState'
import ListRow from '../ui/listRow'
import PageHeader from '../ui/pageHeader'
import Spinner from '../ui/spinner'
import TextField from '../ui/textField'
import Toggle from '../ui/toggle'

type InstalledAction = 'open' | 'locate' | 'uninstall'

export default function AppsInstalledPage() {
  const installed = useInstalledApps()
  const startup = useStartupApps()
  const [query, setQuery] = useState('')
  const [componentsOpen, setComponentsOpen] = useState(false)

  const startupById = useMemo(() => {
    const map = new Map<string, StartupEntry>()
    for (const e of startup) map.set(e.id, e)
    return map
  }, [startup])

  const q = query.trim().toLowerCase()
  const apps = q
    ? installed.filter((a) => a.name.toLowerCase().includes(q) || (a.publisher || '').toLowerCase().includes(q))
    : installed
  const userApps = apps.filter((a) => !a.isComponent)
  const components = apps.filter((a) => a.isComponent)
  const showComponents = componentsOpen || q.length > 0

  const startupEntryFor = (app: InstalledApp) => (app.startupId ? startupById.get(app.startupId) : undefined)

  return (
    <div className="flex w-full flex-col gap-5">
      <PageHeader title="Installed" subtitle="The apps on your PC. Click one to manage it.">
        <TextField
          label="Search installed apps"
          value={query}
          onChange={setQuery}
          placeholder="Search for an app"
          icon={<Search size={13} />}
          className="w-56"
        />
      </PageHeader>

      <div className="flex flex-col gap-1">
        {installed.length === 0 && <EmptyState icon={<Spinner size={20} />} title="Looking for installed apps…" />}
        {installed.length > 0 && apps.length === 0 && (
          <EmptyState icon={<Search size={20} />} title="No apps match your search." />
        )}

        {userApps.map((app) => (
          <InstalledRow key={app.id} app={app} startupEntry={startupEntryFor(app)} />
        ))}

        {components.length > 0 && (
          <div className="mt-1">
            <ListRow
              icon={<Boxes size={18} className="text-ink-faint" />}
              title={`Components & dependencies (${components.length})`}
              detail="Shared runtime and support files other apps rely on — usually safe to leave alone."
              onActivate={() => setComponentsOpen((v) => !v)}
              expanded={showComponents}
            >
              {showComponents && (
                <div className="flex flex-col gap-1 px-2 pb-2">
                  {components.map((app) => (
                    <InstalledRow key={app.id} app={app} startupEntry={startupEntryFor(app)} />
                  ))}
                </div>
              )}
            </ListRow>
          </div>
        )}
      </div>
    </div>
  )
}

function InstalledRow({ app, startupEntry }: { app: InstalledApp; startupEntry?: StartupEntry }) {
  const [expanded, setExpanded] = useState(false)
  const [pending, setPending] = useState<InstalledAction | null>(null)
  const startOn = startupEntry ? (startupEntry.pending ? startupEntry.pending === 'enable' : startupEntry.enabled) : false

  async function act(kind: InstalledAction, run: () => Promise<unknown>) {
    if (pending) return
    setPending(kind)
    try { await run() } finally { setPending(null) }
  }

  return (
    <ListRow
      icon={<Avatar src={app.icon} alt={app.name} fallback={<AppWindow size={16} strokeWidth={1.75} />} />}
      title={app.name}
      detail={app.publisher || (app.source === 'store' ? 'Microsoft Store app' : 'App')}
      onActivate={() => setExpanded((v) => !v)}
      expanded={expanded}
    >
      {expanded && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-t border-line-hairline bg-surface-0 px-3 py-3">
          {startupEntry ? (
            <label className="flex cursor-pointer items-center gap-2.5 text-xs text-ink-secondary select-none">
              <Toggle label="Starts with your PC" checked={startOn} pending={!!startupEntry.pending} onChange={() => window.shell.apps.setStartup(startupEntry.id, !startOn)} />
              Starts with your PC
            </label>
          ) : (
            <span className="text-xs text-ink-faint">{app.source === 'store' ? 'Microsoft Store app' : 'Desktop app'}</span>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            {app.canOpen && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => act('open', () => window.shell.apps.openApp(app.id))}
                disabled={!!pending}
                busy={pending === 'open'}
                icon={<ExternalLink size={14} />}
              >
                Open
              </Button>
            )}
            {app.canOpenLocation && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => act('locate', () => window.shell.apps.openAppLocation(app.id))}
                disabled={!!pending}
                busy={pending === 'locate'}
                icon={<FolderOpen size={14} />}
              >
                Location
              </Button>
            )}
            {app.canUninstall && (
              <Button
                variant="dangerOutline"
                size="sm"
                onClick={() => act('uninstall', () => window.shell.apps.uninstall(app.id))}
                disabled={!!pending}
                busy={pending === 'uninstall'}
                icon={<Trash2 size={14} />}
              >
                Remove
              </Button>
            )}
          </div>
        </div>
      )}
    </ListRow>
  )
}
