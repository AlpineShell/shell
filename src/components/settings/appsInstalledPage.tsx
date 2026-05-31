import { useMemo, useState } from 'react'
import { ExternalLink, FolderOpen } from 'lucide-react'
import { useInstalledApps } from '../../hooks/useInstalledApps'
import { useStartupApps } from '../../hooks/useStartupApps'
import { PageHeader, SearchBox, Spinner, Toggle } from './appsShared'

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
      <PageHeader title="Installed" description="All the apps on your PC. Turn off auto-start, open, or uninstall.">
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
  const [pending, setPending] = useState<InstalledAction | null>(null)
  const startOn = startupEntry ? (startupEntry.pending ? startupEntry.pending === 'enable' : startupEntry.enabled) : false

  async function act(kind: InstalledAction, run: () => Promise<unknown>) {
    if (pending) return
    setPending(kind)
    try { await run() } finally { setPending(null) }
  }

  return (
    <div className="flex items-center gap-3 px-3 min-h-14 py-2 rounded-lg bg-neutral-900 border border-white/5">
      {app.icon ? <img src={app.icon} alt="" className="w-7 h-7 shrink-0" draggable={false} /> : <div className="w-7 h-7 shrink-0 rounded bg-white/10" />}
      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-[13px] text-white/90 truncate">{app.name}</span>
        <span className="text-[11px] text-white/45 truncate">{app.publisher || (app.source === 'store' ? 'Microsoft Store app' : 'App')}</span>
      </div>

      {startupEntry && (
        <div className="flex items-center gap-2 shrink-0 mr-1">
          <span className="text-[11px] text-white/45">Starts with your PC</span>
          <Toggle checked={startOn} pending={!!startupEntry.pending} onChange={() => window.shell.apps.setStartup(startupEntry.id, !startOn)} />
        </div>
      )}

      {app.canOpen && (
        <button onClick={() => act('open', () => window.shell.apps.openApp(app.id))} disabled={!!pending} title="Open" aria-label="Open" className="w-8 h-8 flex items-center justify-center rounded-md text-white/40 hover:text-white hover:bg-white/10 cursor-pointer transition-colors shrink-0 disabled:hover:bg-transparent">
          {pending === 'open' ? <Spinner size={15} /> : <ExternalLink size={15} />}
        </button>
      )}
      {app.canOpenLocation && (
        <button onClick={() => act('locate', () => window.shell.apps.openAppLocation(app.id))} disabled={!!pending} title="Open file location" aria-label="Open file location" className="w-8 h-8 flex items-center justify-center rounded-md text-white/40 hover:text-white hover:bg-white/10 cursor-pointer transition-colors shrink-0 disabled:hover:bg-transparent">
          {pending === 'locate' ? <Spinner size={15} /> : <FolderOpen size={15} />}
        </button>
      )}
      {app.canUninstall && (
        <button onClick={() => act('uninstall', () => window.shell.apps.uninstall(app.id))} disabled={!!pending} className="h-7 w-20 flex items-center justify-center rounded-md text-[12px] text-white/60 hover:text-red-200 hover:bg-red-500/15 cursor-pointer transition-colors shrink-0 disabled:cursor-default disabled:text-white/60 disabled:hover:bg-transparent">
          {pending === 'uninstall' ? <Spinner size={13} /> : 'Uninstall'}
        </button>
      )}
    </div>
  )
}
