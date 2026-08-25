import { useState } from 'react'
import { Boxes, ChevronDown, ChevronRight, ExternalLink, FolderOpen, Trash2 } from 'lucide-react'
import { useInstalledApps } from '../../hooks/useInstalledApps'
import { AppIcon, SearchBox, Spinner } from './appsShared'

type InstalledAction = 'open' | 'locate' | 'uninstall'

export default function AppsInstalledPage() {
  const installed = useInstalledApps()
  const [query, setQuery] = useState('')
  const [componentsOpen, setComponentsOpen] = useState(false)

  const q = query.trim().toLowerCase()
  const apps = q
    ? installed.filter((a) => a.name.toLowerCase().includes(q) || (a.publisher || '').toLowerCase().includes(q))
    : installed
  const userApps = apps.filter((a) => !a.isComponent)
  const components = apps.filter((a) => a.isComponent)
  const showComponents = componentsOpen || q.length > 0

  return (
    <div className="flex flex-col gap-5 w-full">
      <div className="flex justify-end">
        <SearchBox value={query} onChange={setQuery} placeholder="Search for an app" />
      </div>

      <div className="flex flex-col gap-1">
        {installed.length === 0 && <p className="text-sm text-ink-quiet">Looking for installed apps…</p>}
        {installed.length > 0 && apps.length === 0 && <p className="text-sm text-ink-quiet">No apps match your search.</p>}

        {userApps.map((app) => (
          <InstalledRow key={app.id} app={app} />
        ))}

        {components.length > 0 && (
          <div className="rounded-card bg-surface-2 border border-line-hairline mt-1 overflow-hidden">
            <button onClick={() => setComponentsOpen((v) => !v)} className="w-full flex items-center gap-3 px-3 min-h-14 py-2 cursor-pointer text-left hover:bg-fill-ghost transition-colors">
              <Boxes size={18} className="text-ink-faint shrink-0" />
              <div className="flex flex-col flex-1 min-w-0">
                <span className="text-dense text-ink-secondary">Components &amp; dependencies ({components.length})</span>
                <span className="text-[11px] text-ink-faint">Shared runtime and support files other apps rely on — usually safe to leave alone.</span>
              </div>
              {showComponents ? <ChevronDown size={16} className="text-ink-faint shrink-0" /> : <ChevronRight size={16} className="text-ink-faint shrink-0" />}
            </button>
            {showComponents && (
              <div className="flex flex-col gap-1 px-2 pb-2">
                {components.map((app) => (
                  <InstalledRow key={app.id} app={app} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function InstalledRow({ app }: { app: InstalledApp }) {
  const [expanded, setExpanded] = useState(false)
  const [pending, setPending] = useState<InstalledAction | null>(null)

  async function act(kind: InstalledAction, run: () => Promise<unknown>) {
    if (pending) return
    setPending(kind)
    try { await run() } finally { setPending(null) }
  }

  return (
    <div className="rounded-card bg-surface-2 border border-line-hairline overflow-hidden">
      <button onClick={() => setExpanded((v) => !v)} className="w-full flex items-center gap-3 px-3 min-h-14 py-2 text-left cursor-pointer hover:bg-fill-ghost transition-colors">
        <AppIcon icon={app.icon} name={app.name} />
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-dense text-ink-primary truncate">{app.name}</span>
          <span className="text-[11px] text-ink-quiet truncate">{app.publisher || (app.source === 'store' ? 'Microsoft Store app' : 'App')}</span>
        </div>
        <ChevronDown size={16} className={`text-ink-faint shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <div className="border-t border-line-hairline bg-surface-0 px-3 py-3 flex items-center justify-between gap-x-4 gap-y-3 flex-wrap">
          <span className="text-[12px] text-ink-faint">{app.source === 'store' ? 'Microsoft Store app' : 'Desktop app'}</span>
          <div className="flex items-center gap-1.5 ml-auto">
            {app.canOpen && (
              <button onClick={() => act('open', () => window.shell.apps.openApp(app.id))} disabled={!!pending} className="h-8 px-3 flex items-center gap-1.5 rounded-field text-[12px] text-ink-secondary bg-fill-ghost hover:bg-surface-3 hover:text-ink-primary cursor-pointer transition-colors disabled:opacity-60">
                {pending === 'open' ? <Spinner size={14} /> : <ExternalLink size={14} />} Open
              </button>
            )}
            {app.canOpenLocation && (
              <button onClick={() => act('locate', () => window.shell.apps.openAppLocation(app.id))} disabled={!!pending} className="h-8 px-3 flex items-center gap-1.5 rounded-field text-[12px] text-ink-secondary bg-fill-ghost hover:bg-surface-3 hover:text-ink-primary cursor-pointer transition-colors disabled:opacity-60">
                {pending === 'locate' ? <Spinner size={14} /> : <FolderOpen size={14} />} Location
              </button>
            )}
            {app.canUninstall && (
              <button onClick={() => act('uninstall', () => window.shell.apps.uninstall(app.id))} disabled={!!pending} className="h-8 w-22 flex items-center justify-center gap-1.5 rounded-field text-[12px] text-danger bg-danger/10 hover:bg-danger/20 cursor-pointer transition-colors disabled:opacity-60">
                {pending === 'uninstall' ? <Spinner size={14} /> : <><Trash2 size={14} /> Remove</>}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
