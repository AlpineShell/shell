import { useMemo, useState } from 'react'
import { useRunningApps } from '../../hooks/useRunningApps'
import { PageHeader, SearchBox, TechToggle, FilterChip, Spinner, useTechState, formatMemory, bandLabel, bandClass } from './appsShared'

type RunningSort = 'memory' | 'cpu'

export default function AppsRunningPage() {
  const running = useRunningApps()
  const [tech, toggleTech] = useTechState()
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<RunningSort>('memory')
  const q = query.trim().toLowerCase()

  const apps = useMemo(() => {
    const filtered = running
      .filter((a) => tech || a.category !== 'system')
      .filter((a) => !q || a.friendlyName.toLowerCase().includes(q) || a.name.toLowerCase().includes(q))
    return [...filtered].sort((a, b) => (sort === 'cpu' ? b.cpu - a.cpu || b.memory - a.memory : b.memory - a.memory))
  }, [running, q, sort, tech])

  return (
    <div className="flex flex-col gap-5 w-full">
      <PageHeader title="Running" description="Apps using your computer right now. You can close ones you're not using.">
        <SearchBox value={query} onChange={setQuery} placeholder="Search for an app" />
        <TechToggle tech={tech} onToggle={toggleTech} />
      </PageHeader>

      <div className="flex flex-col gap-3">
        {tech && (
          <div className="flex items-center gap-1">
            <FilterChip active={sort === 'memory'} onClick={() => setSort('memory')}>Most memory</FilterChip>
            <FilterChip active={sort === 'cpu'} onClick={() => setSort('cpu')}>Most processor</FilterChip>
          </div>
        )}

        {running.length === 0 && <p className="text-sm text-white/50">Looking at what's running…</p>}
        {running.length > 0 && apps.length === 0 && <p className="text-sm text-white/50">No apps match your search.</p>}

        <div className="flex flex-col gap-1">
          {apps.map((app) => (
            <RunningRow key={app.name} app={app} tech={tech} />
          ))}
        </div>
      </div>
    </div>
  )
}

function RunningRow({ app, tech }: { app: RunningApp; tech: boolean }) {
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
      {app.icon ? <img src={app.icon} alt="" className="w-6 h-6 shrink-0" draggable={false} /> : <div className="w-6 h-6 shrink-0 rounded bg-white/10" />}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className="text-[13px] text-white/90 truncate">{app.friendlyName}</span>
        {app.count > 1 && <span className="text-[11px] text-white/40 shrink-0">({app.count})</span>}
      </div>
      {tech ? (
        <>
          <span className="text-[12px] text-white/50 tabular-nums shrink-0 w-12 text-right">{app.cpu > 0 ? `${app.cpu}%` : '—'}</span>
          <span className="text-[12px] text-white/60 tabular-nums shrink-0 w-16 text-right">{formatMemory(app.memory)}</span>
        </>
      ) : (
        <span className={`text-[12px] shrink-0 w-20 text-right ${bandClass(app.band)}`}>{bandLabel(app.band)}</span>
      )}
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
