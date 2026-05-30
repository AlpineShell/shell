import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, FolderOpen, Search, ShieldAlert, Undo2, X } from 'lucide-react'
import { useStartupApps } from '../../hooks/useStartupApps'
import { useRunningApps } from '../../hooks/useRunningApps'
import { useStartupHistory } from '../../hooks/useStartupHistory'

type Tab = 'startup' | 'running'
type StartupFilter = 'all' | 'enabled' | 'disabled'
type RunningSort = 'memory' | 'cpu'

const HEAVY_BYTES = 150 * 1024 * 1024

function formatMemory(bytes: number): string {
  if (!bytes) return '—'
  const mb = bytes / (1024 * 1024)
  if (mb >= 1024) return (mb / 1024).toFixed(1) + ' GB'
  return Math.round(mb) + ' MB'
}

function processKey(target: string | null): string | null {
  if (!target) return null
  const base = target.split(/[\\/]/).pop() || ''
  return base.replace(/\.[^.]+$/, '').toLowerCase()
}

export default function AppsPage() {
  const [tab, setTab] = useState<Tab>('startup')
  const [query, setQuery] = useState('')
  const running = useRunningApps()

  const runningByName = useMemo(() => {
    const map = new Map<string, RunningApp>()
    for (const app of running) map.set(app.name.toLowerCase(), app)
    return map
  }, [running])

  return (
    <div className="flex flex-col gap-6 w-full">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Apps</h1>
        <p className="text-xs text-white/50">Manage what starts with Windows and what's running right now.</p>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1 bg-neutral-900 rounded-lg p-1 border border-white/5">
          <TabButton active={tab === 'startup'} onClick={() => setTab('startup')}>Startup</TabButton>
          <TabButton active={tab === 'running'} onClick={() => setTab('running')}>Running</TabButton>
        </div>
        <div className="flex items-center gap-2 bg-neutral-900 border border-white/5 focus-within:border-white/20 transition-colors rounded-lg h-8 px-3 w-56">
          <Search size={13} className="text-white/50 shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tab === 'startup' ? 'Filter startup apps' : 'Filter running apps'}
            className="bg-transparent outline-none text-[13px] placeholder:text-white/40 w-full"
          />
        </div>
      </div>

      {tab === 'startup'
        ? <StartupTab query={query} runningByName={runningByName} />
        : <RunningTab query={query} running={running} />}
    </div>
  )
}

function StartupTab({ query, runningByName }: { query: string; runningByName: Map<string, RunningApp> }) {
  const startup = useStartupApps()
  const recent = useStartupHistory()
  const [filter, setFilter] = useState<StartupFilter>('all')
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const q = query.trim().toLowerCase()
  const entries = startup.filter((e) => {
    if (q && !(e.name.toLowerCase().includes(q) || e.command.toLowerCase().includes(q) || e.sourceLabel.toLowerCase().includes(q))) return false
    const on = e.pending ? e.pending === 'enable' : e.enabled
    if (filter === 'enabled') return on
    if (filter === 'disabled') return !on
    return true
  })
  const pending = startup.filter((e) => e.pending)

  async function applyChanges() {
    setError(null)
    setApplying(true)
    const result = await window.shell.apps.applySystemChanges()
    setApplying(false)
    if (!result.ok) setError(result.error || 'Could not apply changes.')
  }

  return (
    <div className="flex flex-col gap-3">
      {recent.length > 0 && (
        <div className="flex flex-col gap-1.5 px-3 py-2.5 rounded-lg bg-neutral-900 border border-white/5">
          <span className="text-[11px] uppercase tracking-wide text-white/40">Recently changed</span>
          {recent.map((h) => (
            <div key={h.seq} className="flex items-center gap-2 text-[12px]">
              <span className="text-white/80 truncate flex-1 min-w-0">{h.name}</span>
              <span className={h.to ? 'text-emerald-300/80' : 'text-white/40'}>{h.to ? 'Enabled' : 'Disabled'}</span>
              <button
                onClick={() => window.shell.apps.undo(h.seq)}
                className="flex items-center gap-1 text-white/50 hover:text-white cursor-pointer transition-colors"
              >
                <Undo2 size={12} /> Undo
              </button>
            </div>
          ))}
        </div>
      )}

      {pending.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-amber-400/10 border border-amber-400/30">
          <ShieldAlert size={18} className="text-amber-300 shrink-0" />
          <div className="flex flex-col flex-1 min-w-0">
            <span className="text-[13px] text-amber-100">{pending.length} system {pending.length === 1 ? 'change' : 'changes'} need administrator approval</span>
            {error && <span className="text-xs text-red-300 mt-0.5">{error}</span>}
          </div>
          <button
            onClick={() => pending.forEach((e) => window.shell.apps.clearPending(e.id))}
            disabled={applying}
            className="h-7 px-3 rounded-md text-[12px] text-white/70 hover:text-white hover:bg-white/10 cursor-pointer transition-colors disabled:opacity-40"
          >
            Discard
          </button>
          <button
            onClick={applyChanges}
            disabled={applying}
            className="h-7 px-3 rounded-md text-[12px] bg-amber-400 text-black hover:bg-amber-300 cursor-pointer transition-colors disabled:opacity-40"
          >
            {applying ? 'Applying…' : 'Apply'}
          </button>
        </div>
      )}

      <div className="flex items-center gap-1">
        <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>All</FilterChip>
        <FilterChip active={filter === 'enabled'} onClick={() => setFilter('enabled')}>Enabled</FilterChip>
        <FilterChip active={filter === 'disabled'} onClick={() => setFilter('disabled')}>Disabled</FilterChip>
      </div>

      {startup.length === 0 && <p className="text-sm text-white/50">Scanning startup apps…</p>}
      {startup.length > 0 && entries.length === 0 && <p className="text-sm text-white/50">No startup apps match.</p>}

      <div className="flex flex-col gap-1">
        {entries.map((entry) => (
          <StartupRow key={entry.id} entry={entry} running={runningByName.get(processKey(entry.target) || '')} />
        ))}
      </div>
    </div>
  )
}

function StartupRow({ entry, running }: { entry: StartupEntry; running?: RunningApp }) {
  const [open, setOpen] = useState(false)
  const effectiveEnabled = entry.pending ? entry.pending === 'enable' : entry.enabled
  const isHeavy = effectiveEnabled && running && running.memory > HEAVY_BYTES

  return (
    <div className="rounded-lg bg-neutral-900 border border-white/5">
      <div className="flex items-center gap-3 px-3 h-14">
        <button onClick={() => setOpen(!open)} className="shrink-0 text-white/40 hover:text-white/80 cursor-pointer transition-colors">
          {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </button>
        {entry.icon ? (
          <img src={entry.icon} alt="" className="w-7 h-7 shrink-0" draggable={false} />
        ) : (
          <div className="w-7 h-7 shrink-0 rounded bg-white/10" />
        )}
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-[13px] text-white/90 truncate">{entry.name}</span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Badge>{entry.sourceLabel}</Badge>
            {entry.scope === 'system' && <Badge tone="amber">Admin</Badge>}
            {running ? (
              <span className="flex items-center gap-1 text-[11px] text-emerald-300/90">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Running · {formatMemory(running.memory)}
              </span>
            ) : (
              <span className="text-[11px] text-white/35">{effectiveEnabled ? 'Starts with Windows' : 'Off'}</span>
            )}
            {isHeavy && <span className="text-[11px] text-amber-300/80">· Heavy</span>}
          </div>
        </div>
        <Toggle checked={effectiveEnabled} pending={!!entry.pending} onChange={() => window.shell.apps.setStartup(entry.id, !effectiveEnabled)} />
      </div>

      {open && (
        <div className="px-3 pb-3 pt-1 flex flex-col gap-2 border-t border-white/5">
          {isHeavy && running && (
            <p className="text-[11px] text-amber-200/80">Uses ~{formatMemory(running.memory)} while running. Consider disabling if you don't need it at startup.</p>
          )}
          <DetailRow label="Command" value={entry.command} mono />
          <DetailRow label="Source" value={entry.location} mono />
          {entry.scope === 'system' && (
            <p className="text-[11px] text-amber-200/70">Changing this affects all users and is applied with administrator approval.</p>
          )}
          <p className="text-[11px] text-white/40">Changes take effect the next time you sign in.</p>
          {entry.target && (
            <button
              onClick={() => window.shell.apps.openLocation(entry.target!)}
              className="self-start flex items-center gap-2 h-7 px-2.5 rounded-md text-[12px] text-white/70 hover:text-white hover:bg-white/10 cursor-pointer transition-colors"
            >
              <FolderOpen size={13} /> Open file location
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function RunningTab({ query, running }: { query: string; running: RunningApp[] }) {
  const [sort, setSort] = useState<RunningSort>('memory')
  const q = query.trim().toLowerCase()
  const apps = useMemo(() => {
    const filtered = q ? running.filter((a) => a.name.toLowerCase().includes(q)) : running
    return [...filtered].sort((a, b) => (sort === 'cpu' ? b.cpu - a.cpu || b.memory - a.memory : b.memory - a.memory))
  }, [running, q, sort])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1">
        <FilterChip active={sort === 'memory'} onClick={() => setSort('memory')}>Memory</FilterChip>
        <FilterChip active={sort === 'cpu'} onClick={() => setSort('cpu')}>CPU</FilterChip>
      </div>

      {running.length === 0 && <p className="text-sm text-white/50">Reading running apps…</p>}
      {running.length > 0 && apps.length === 0 && <p className="text-sm text-white/50">No running apps match.</p>}

      <div className="flex flex-col gap-1">
        {apps.map((app) => (
          <RunningRow key={app.name} app={app} />
        ))}
      </div>
    </div>
  )
}

function RunningRow({ app }: { app: RunningApp }) {
  const [confirming, setConfirming] = useState(false)

  return (
    <div className="flex items-center gap-3 px-3 h-12 rounded-lg bg-neutral-900 border border-white/5">
      {app.icon ? (
        <img src={app.icon} alt="" className="w-6 h-6 shrink-0" draggable={false} />
      ) : (
        <div className="w-6 h-6 shrink-0 rounded bg-white/10" />
      )}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className="text-[13px] text-white/90 truncate">{app.name}</span>
        {app.count > 1 && <span className="text-[11px] text-white/40 shrink-0">×{app.count}</span>}
      </div>
      <span className="text-[12px] text-white/50 tabular-nums shrink-0 w-12 text-right">{app.cpu > 0 ? `${app.cpu}%` : '—'}</span>
      <span className="text-[12px] text-white/60 tabular-nums shrink-0 w-16 text-right">{formatMemory(app.memory)}</span>
      {confirming ? (
        <button
          onClick={() => { window.shell.apps.endTask(app.pids); setConfirming(false) }}
          onMouseLeave={() => setConfirming(false)}
          className="flex items-center gap-1 h-7 px-2.5 rounded-md text-[12px] bg-red-500/90 text-white hover:bg-red-500 cursor-pointer transition-colors shrink-0"
        >
          <X size={12} /> End {app.count > 1 ? `${app.count}` : 'now'}
        </button>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          className="h-7 px-2.5 rounded-md text-[12px] text-white/60 hover:text-white hover:bg-white/10 cursor-pointer transition-colors shrink-0"
        >
          End task
        </button>
      )}
    </div>
  )
}

function Toggle({ checked, pending, onChange }: { checked: boolean; pending?: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className={`shrink-0 relative rounded-full transition-colors cursor-pointer ${checked ? 'bg-white' : 'bg-white/15'} ${pending ? 'ring-2 ring-amber-400/60' : ''}`}
      style={{ width: 36, height: 20 }}
    >
      <span
        className="absolute top-0.5 rounded-full transition-all"
        style={{ width: 16, height: 16, left: checked ? 18 : 2, backgroundColor: checked ? 'rgb(20,20,20)' : 'rgba(255,255,255,0.7)' }}
      />
    </button>
  )
}

function Badge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'amber' }) {
  const cls = tone === 'amber' ? 'bg-amber-400/15 text-amber-200/90' : 'bg-white/8 text-white/50'
  return <span className={`text-[10px] px-1.5 py-0.5 rounded ${cls}`}>{children}</span>
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wide text-white/40">{label}</span>
      <span className={`text-[12px] text-white/70 break-all ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  )
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`h-7 px-3 rounded-md text-[12px] cursor-pointer transition-colors ${active ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white hover:bg-white/5'}`}
    >
      {children}
    </button>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`h-7 px-4 rounded-md text-[12px] cursor-pointer transition-colors ${active ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white'}`}
    >
      {children}
    </button>
  )
}
