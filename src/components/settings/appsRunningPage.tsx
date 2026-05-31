import { useMemo, useState } from 'react'
import { useRunningApps } from '../../hooks/useRunningApps'
import { AppIcon, PageHeader, SearchBox, Spinner, bandLabel, bandClass } from './appsShared'

export default function AppsRunningPage() {
  const running = useRunningApps()
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()

  const apps = useMemo(() => {
    return running
      .filter((a) => a.category !== 'system')
      .filter((a) => !q || a.friendlyName.toLowerCase().includes(q) || a.name.toLowerCase().includes(q))
      .sort((a, b) => b.memory - a.memory)
  }, [running, q])

  return (
    <div className="flex flex-col gap-5 w-full">
      <PageHeader title="Running" description="Apps using your computer right now. You can close ones you're not using.">
        <SearchBox value={query} onChange={setQuery} placeholder="Search for an app" />
      </PageHeader>

      <div className="flex flex-col gap-3">
        {running.length === 0 && <p className="text-sm text-white/50">Looking at what's running…</p>}
        {running.length > 0 && apps.length === 0 && <p className="text-sm text-white/50">No apps match your search.</p>}

        <div className="flex flex-col gap-1">
          {apps.map((app) => (
            <RunningRow key={app.name} app={app} />
          ))}
        </div>
      </div>
    </div>
  )
}

function RunningRow({ app }: { app: RunningApp }) {
  const [busy, setBusy] = useState(false)
  const [closed, setClosed] = useState(false)

  async function close() {
    setBusy(true)
    await window.shell.apps.endTask(app.pids)
    setClosed(true)
  }

  if (closed) return null

  return (
    <div className="flex items-center gap-3 px-3 h-12 rounded-lg bg-neutral-900 border border-white/5">
      <AppIcon icon={app.icon} name={app.friendlyName} size={24} />
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className="text-[13px] text-white/90 truncate">{app.friendlyName}</span>
        {app.count > 1 && <span className="text-[11px] text-white/40 shrink-0">({app.count})</span>}
      </div>
      <span className={`text-[12px] shrink-0 w-20 text-right ${bandClass(app.band)}`}>{bandLabel(app.band)}</span>
      <button
        onClick={close}
        disabled={busy}
        className="h-7 w-16 flex items-center justify-center rounded-md text-[12px] text-white/60 hover:text-red-200 hover:bg-red-500/15 cursor-pointer transition-colors shrink-0 disabled:cursor-default disabled:text-white/60 disabled:hover:bg-transparent"
      >
        {busy ? <Spinner size={13} /> : 'Close'}
      </button>
    </div>
  )
}
