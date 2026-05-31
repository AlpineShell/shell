import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, FolderOpen, Lock, ShieldAlert } from 'lucide-react'
import { useStartupApps } from '../../hooks/useStartupApps'
import { useRunningApps } from '../../hooks/useRunningApps'
import { PageHeader, SearchBox, TechToggle, FilterChip, Spinner, Toggle, useTechState, processKey } from './appsShared'

type StartupFilter = 'all' | 'on' | 'off'

export default function AppsStartupPage() {
  const startup = useStartupApps()
  const running = useRunningApps()
  const [tech, toggleTech] = useTechState()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<StartupFilter>('all')
  const [systemOpen, setSystemOpen] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runningByName = useMemo(() => {
    const map = new Map<string, RunningApp>()
    for (const app of running) map.set(app.name.toLowerCase(), app)
    return map
  }, [running])

  const q = query.trim().toLowerCase()
  const matches = (e: StartupEntry) => !q || e.friendlyName.toLowerCase().includes(q) || e.name.toLowerCase().includes(q) || e.command.toLowerCase().includes(q)
  const on = (e: StartupEntry) => (e.pending ? e.pending === 'enable' : e.enabled)
  const passesFilter = (e: StartupEntry) => filter === 'all' || (filter === 'on' ? on(e) : !on(e))

  const visible = startup.filter(matches).filter(passesFilter)
  const appEntries = visible.filter((e) => e.category !== 'system')
  const systemEntries = visible.filter((e) => e.category === 'system')
  const pending = startup.filter((e) => e.pending)
  const matchOf = (e: StartupEntry) => runningByName.get(processKey(e.target) || '')
  const recommend = appEntries.filter((e) => on(e) && matchOf(e)?.band === 'heavy')

  async function applyChanges() {
    setError(null)
    setApplying(true)
    const result = await window.shell.apps.applySystemChanges()
    setApplying(false)
    if (!result.ok) setError(result.error || 'Could not apply changes.')
  }

  return (
    <div className="flex flex-col gap-5 w-full">
      <PageHeader title="Startup" description="Apps that open automatically when you start your PC.">
        <SearchBox value={query} onChange={setQuery} placeholder="Search for an app" />
        <TechToggle tech={tech} onToggle={toggleTech} />
      </PageHeader>

      <div className="flex flex-col gap-3">
        {pending.length > 0 && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-amber-400/10 border border-amber-400/30">
            <ShieldAlert size={18} className="text-amber-300 shrink-0" />
            <div className="flex flex-col flex-1 min-w-0">
              <span className="text-[13px] text-amber-100">{pending.length} system {pending.length === 1 ? 'app change needs' : 'app changes need'} your approval</span>
              {error && <span className="text-xs text-red-300 mt-0.5">{error}</span>}
            </div>
            <button onClick={() => pending.forEach((e) => window.shell.apps.clearPending(e.id))} disabled={applying} className="h-7 px-3 rounded-md text-[12px] text-white/70 hover:text-white hover:bg-white/10 cursor-pointer transition-colors disabled:opacity-40">Cancel</button>
            <button onClick={applyChanges} disabled={applying} className="h-7 px-3 rounded-md text-[12px] bg-amber-400 text-black hover:bg-amber-300 cursor-pointer transition-colors disabled:opacity-40">{applying ? 'Approving…' : 'Approve'}</button>
          </div>
        )}

        {recommend.length > 0 && (
          <div className="flex flex-col gap-2 px-4 py-3 rounded-lg bg-amber-400/5 border border-amber-400/20">
            <span className="text-[13px] text-amber-100/90">We recommend turning these off</span>
            <span className="text-[11px] text-white/50">They start automatically and use a lot of memory. You can still open them yourself anytime.</span>
            <div className="flex flex-col gap-1 mt-1">
              {recommend.slice(0, 3).map((e) => (
                <div key={e.id} className="flex items-center gap-2">
                  {e.icon ? <img src={e.icon} alt="" className="w-5 h-5 shrink-0" draggable={false} /> : <div className="w-5 h-5 rounded bg-white/10 shrink-0" />}
                  <span className="text-[12px] text-white/85 flex-1 min-w-0 truncate">{e.friendlyName}</span>
                  <button onClick={() => window.shell.apps.setStartup(e.id, false)} className="h-6 px-2.5 rounded-md text-[11px] bg-white/10 text-white hover:bg-white/20 cursor-pointer transition-colors">Turn off</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {tech && (
          <div className="flex items-center gap-1">
            <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>All</FilterChip>
            <FilterChip active={filter === 'on'} onClick={() => setFilter('on')}>On</FilterChip>
            <FilterChip active={filter === 'off'} onClick={() => setFilter('off')}>Off</FilterChip>
          </div>
        )}

        {startup.length === 0 && <p className="text-sm text-white/50">Looking for startup apps…</p>}
        {startup.length > 0 && appEntries.length === 0 && systemEntries.length === 0 && <p className="text-sm text-white/50">No apps match your search.</p>}
        {startup.length > 0 && (appEntries.length > 0 || systemEntries.length > 0) && (
          <p className="text-[11px] text-white/35">Changes take effect the next time you restart your PC.</p>
        )}

        <div className="flex flex-col gap-1">
          {appEntries.map((entry) => (
            <StartupRow key={entry.id} entry={entry} running={matchOf(entry)} tech={tech} />
          ))}
        </div>

        {systemEntries.length > 0 && (
          <div className="rounded-lg bg-neutral-900 border border-white/5">
            <button onClick={() => setSystemOpen(!systemOpen)} className="w-full flex items-center gap-3 px-3 h-12 cursor-pointer text-left">
              <Lock size={15} className="text-white/40 shrink-0" />
              <div className="flex flex-col flex-1 min-w-0">
                <span className="text-[13px] text-white/80">Part of Windows ({systemEntries.length})</span>
                <span className="text-[11px] text-white/40">Kept on so your PC works properly. We recommend leaving these on.</span>
              </div>
              {systemOpen ? <ChevronDown size={15} className="text-white/40" /> : <ChevronRight size={15} className="text-white/40" />}
            </button>
            {systemOpen && (
              <div className="flex flex-col gap-1 px-2 pb-2">
                {systemEntries.map((entry) => (
                  <StartupRow key={entry.id} entry={entry} running={matchOf(entry)} tech={tech} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function StartupRow({ entry, running, tech }: { entry: StartupEntry; running?: RunningApp; tech: boolean }) {
  const [locating, setLocating] = useState(false)
  const effectiveOn = entry.pending ? entry.pending === 'enable' : entry.enabled
  const lockedForUser = entry.locked && !tech
  const heavy = running?.band === 'heavy'

  async function openLocation() {
    if (locating) return
    setLocating(true)
    try { await window.shell.apps.openLocation(entry.target!) } finally { setLocating(false) }
  }

  return (
    <div className="flex items-center gap-3 px-3 min-h-14 py-2 rounded-lg bg-neutral-900 border border-white/5">
      {entry.icon ? <img src={entry.icon} alt="" className="w-7 h-7 shrink-0" draggable={false} /> : <div className="w-7 h-7 shrink-0 rounded bg-white/10" />}
      <div className="flex flex-col min-w-0 flex-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[13px] text-white/90 truncate">{entry.friendlyName}</span>
          {running && (
            <span className="flex items-center gap-1 text-[11px] text-emerald-300/90 shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Open now
            </span>
          )}
          {heavy && <span className="text-[11px] text-amber-300/80 shrink-0">· Uses a lot of memory</span>}
        </div>
        <span className="text-[11px] text-white/45 truncate">{entry.blurb || (effectiveOn ? 'Opens when you start your PC' : 'Off')}</span>
        {tech && <span className="text-[10px] text-white/30 font-mono truncate mt-0.5">{entry.sourceLabel} · {entry.command}</span>}
      </div>
      {entry.target && (
        <button
          onClick={openLocation}
          disabled={locating}
          title="Open file location"
          aria-label="Open file location"
          className="w-8 h-8 flex items-center justify-center rounded-md text-white/40 hover:text-white hover:bg-white/10 cursor-pointer transition-colors shrink-0 disabled:hover:bg-transparent"
        >
          {locating ? <Spinner size={15} /> : <FolderOpen size={15} />}
        </button>
      )}
      {lockedForUser ? (
        <Lock size={15} className="text-white/30 shrink-0" />
      ) : (
        <Toggle checked={effectiveOn} pending={!!entry.pending} onChange={() => window.shell.apps.setStartup(entry.id, !effectiveOn)} />
      )}
    </div>
  )
}
