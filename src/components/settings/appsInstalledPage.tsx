import { useMemo, useState } from 'react'
import { ChevronDown, ExternalLink, FolderOpen, Trash2 } from 'lucide-react'
import { useInstalledApps } from '../../hooks/useInstalledApps'
import { useStartupApps } from '../../hooks/useStartupApps'
import { AppIcon, PageHeader, SearchBox, Spinner, Toggle } from './appsShared'

type InstalledAction = 'open' | 'locate' | 'uninstall'

export default function AppsInstalledPage() {
  const installed = useInstalledApps()
  const startup = useStartupApps()
  const [query, setQuery] = useState('')

  const startupById = useMemo(() => {
    const map = new Map<string, StartupEntry>()
    for (const e of startup) map.set(e.id, e)
    return map
  }, [startup])

  const q = query.trim().toLowerCase()
  const apps = q
    ? installed.filter((a) => a.name.toLowerCase().includes(q) || (a.publisher || '').toLowerCase().includes(q))
    : installed

  return (
    <div className="flex flex-col gap-5 w-full">
      <PageHeader title="Installed" description="All the apps on your PC. Click one to manage it.">
        <SearchBox value={query} onChange={setQuery} placeholder="Search for an app" />
      </PageHeader>

      <div className="flex flex-col gap-1">
        {installed.length === 0 && <p className="text-sm text-white/50">Looking for installed apps…</p>}
        {installed.length > 0 && apps.length === 0 && <p className="text-sm text-white/50">No apps match your search.</p>}
        {apps.map((app) => (
          <InstalledRow key={app.id} app={app} startupEntry={app.startupId ? startupById.get(app.startupId) : undefined} />
        ))}
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
    <div className="rounded-lg bg-neutral-900 border border-white/5 overflow-hidden">
      <button onClick={() => setExpanded((v) => !v)} className="w-full flex items-center gap-3 px-3 min-h-14 py-2 text-left cursor-pointer hover:bg-white/3 transition-colors">
        <AppIcon icon={app.icon} name={app.name} />
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-[13px] text-white/90 truncate">{app.name}</span>
          <span className="text-[11px] text-white/45 truncate">{app.publisher || (app.source === 'store' ? 'Microsoft Store app' : 'App')}</span>
        </div>
        <ChevronDown size={16} className={`text-white/40 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <div className="border-t border-white/5 bg-black/15 px-3 py-3 flex items-center justify-between gap-x-4 gap-y-3 flex-wrap">
          {startupEntry ? (
            <label className="flex items-center gap-2.5 text-[12px] text-white/60 cursor-pointer select-none">
              <Toggle checked={startOn} pending={!!startupEntry.pending} onChange={() => window.shell.apps.setStartup(startupEntry.id, !startOn)} />
              Starts with your PC
            </label>
          ) : (
            <span className="text-[12px] text-white/30">{app.source === 'store' ? 'Microsoft Store app' : 'Desktop app'}</span>
          )}
          <div className="flex items-center gap-1.5 ml-auto">
            {app.canOpen && (
              <button onClick={() => act('open', () => window.shell.apps.openApp(app.id))} disabled={!!pending} className="h-8 px-3 flex items-center gap-1.5 rounded-md text-[12px] text-white/70 bg-white/5 hover:bg-white/10 hover:text-white cursor-pointer transition-colors disabled:opacity-60">
                {pending === 'open' ? <Spinner size={14} /> : <ExternalLink size={14} />} Open
              </button>
            )}
            {app.canOpenLocation && (
              <button onClick={() => act('locate', () => window.shell.apps.openAppLocation(app.id))} disabled={!!pending} className="h-8 px-3 flex items-center gap-1.5 rounded-md text-[12px] text-white/70 bg-white/5 hover:bg-white/10 hover:text-white cursor-pointer transition-colors disabled:opacity-60">
                {pending === 'locate' ? <Spinner size={14} /> : <FolderOpen size={14} />} Location
              </button>
            )}
            {app.canUninstall && (
              <button onClick={() => act('uninstall', () => window.shell.apps.uninstall(app.id))} disabled={!!pending} className="h-8 w-22 flex items-center justify-center gap-1.5 rounded-md text-[12px] text-red-300/90 bg-red-500/10 hover:bg-red-500/20 hover:text-red-200 cursor-pointer transition-colors disabled:opacity-60">
                {pending === 'uninstall' ? <Spinner size={14} /> : <><Trash2 size={14} /> Remove</>}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
