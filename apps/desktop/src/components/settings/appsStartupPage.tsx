import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, FolderOpen, Lock, ShieldAlert } from 'lucide-react'
import { useStartupApps } from '../../hooks/useStartupApps'
import { useRunningApps } from '../../hooks/useRunningApps'
import { AppIcon, PageHeader, SearchBox, Spinner, processKey } from './appsShared'
import Toggle from '../ui/toggle'

export default function AppsStartupPage() {
  const startup = useStartupApps()
  const running = useRunningApps()
  const [query, setQuery] = useState('')
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

  const visible = startup.filter(matches)
  const appEntries = visible.filter((e) => e.category !== 'system')
  const systemEntries = visible.filter((e) => e.category === 'system')
  const pending = startup.filter((e) => e.pending)
  const matchOf = (e: StartupEntry) => runningByName.get(processKey(e.target) || '')

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
      </PageHeader>

      <div className="flex flex-col gap-3">
        {pending.length > 0 && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-card bg-warning/10 border border-warning/30">
            <ShieldAlert size={18} className="text-warning shrink-0" />
            <div className="flex flex-col flex-1 min-w-0">
              <span className="text-dense text-ink-primary">{pending.length} system {pending.length === 1 ? 'app change needs' : 'app changes need'} your approval</span>
              {error && <span className="text-xs text-danger mt-0.5">{error}</span>}
            </div>
            <button onClick={() => pending.forEach((e) => window.shell.apps.clearPending(e.id))} disabled={applying} className="h-7 px-3 rounded-field text-[12px] text-ink-secondary hover:text-ink-primary hover:bg-fill-ghost cursor-pointer transition-colors disabled:opacity-40">Cancel</button>
            <button onClick={applyChanges} disabled={applying} className="h-7 px-3 rounded-field text-[12px] bg-fill-solid text-on-solid hover:bg-fill-solid-hover cursor-pointer transition-colors disabled:opacity-40">{applying ? 'Approving…' : 'Approve'}</button>
          </div>
        )}

        {startup.length === 0 && <p className="text-sm text-ink-quiet">Looking for startup apps…</p>}
        {startup.length > 0 && appEntries.length === 0 && systemEntries.length === 0 && <p className="text-sm text-ink-quiet">No apps match your search.</p>}

        <div className="flex flex-col gap-1">
          {appEntries.map((entry) => (
            <StartupRow key={entry.id} entry={entry} running={matchOf(entry)} />
          ))}
        </div>

        {systemEntries.length > 0 && (
          <div className="rounded-card bg-surface-2 border border-line-hairline">
            <button onClick={() => setSystemOpen(!systemOpen)} className="w-full flex items-center gap-3 px-3 h-12 cursor-pointer text-left">
              <Lock size={15} className="text-ink-faint shrink-0" />
              <div className="flex flex-col flex-1 min-w-0">
                <span className="text-dense text-ink-secondary">Part of Windows ({systemEntries.length})</span>
                <span className="text-[11px] text-ink-faint">Kept on so your PC works properly. We recommend leaving these on.</span>
              </div>
              {systemOpen ? <ChevronDown size={15} className="text-ink-faint" /> : <ChevronRight size={15} className="text-ink-faint" />}
            </button>
            {systemOpen && (
              <div className="flex flex-col gap-1 px-2 pb-2">
                {systemEntries.map((entry) => (
                  <StartupRow key={entry.id} entry={entry} running={matchOf(entry)} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function StartupRow({ entry, running }: { entry: StartupEntry; running?: RunningApp }) {
  const [locating, setLocating] = useState(false)
  const [removing, setRemoving] = useState(false)
  const effectiveOn = entry.pending ? entry.pending === 'enable' : entry.enabled
  const heavy = running?.band === 'heavy'

  async function openLocation() {
    if (locating) return
    setLocating(true)
    try { await window.shell.apps.openLocation(entry.target!) } finally { setLocating(false) }
  }

  async function remove() {
    if (removing) return
    setRemoving(true)
    const result = await window.shell.apps.removeStartup(entry.id)
    if (!result.ok) setRemoving(false)
  }

  return (
    <div className="flex items-center gap-3 px-3 min-h-14 py-2 rounded-card bg-surface-2 border border-line-hairline">
      <AppIcon icon={entry.icon} name={entry.friendlyName} />
      <div className="flex flex-col min-w-0 flex-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`text-[13px] truncate ${entry.missing ? 'text-ink-quiet' : 'text-ink-primary'}`}>{entry.friendlyName}</span>
          {!entry.missing && running && (
            <span className="flex items-center gap-1 text-[11px] text-success shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-success" /> Open now
            </span>
          )}
          {!entry.missing && heavy && <span className="text-[11px] text-warning shrink-0">· Uses a lot of memory</span>}
        </div>
        <span className="text-[11px] text-ink-quiet truncate">{entry.missing ? 'This app is no longer on your PC' : (entry.blurb || (effectiveOn ? 'Opens when you start your PC' : 'Off'))}</span>
      </div>
      {entry.missing ? (
        <button
          onClick={remove}
          disabled={removing}
          className="h-7 w-20 flex items-center justify-center rounded-field text-[12px] text-ink-secondary hover:text-danger hover:bg-danger/10 cursor-pointer transition-colors shrink-0 disabled:cursor-default disabled:text-ink-secondary disabled:hover:bg-transparent"
        >
          {removing ? <Spinner size={13} /> : 'Remove'}
        </button>
      ) : (
        <>
          {entry.target && (
            <button
              onClick={openLocation}
              disabled={locating}
              title="Open file location"
              aria-label="Open file location"
              className="w-8 h-8 flex items-center justify-center rounded-field text-ink-faint hover:text-ink-primary hover:bg-fill-ghost cursor-pointer transition-colors shrink-0 disabled:hover:bg-transparent"
            >
              {locating ? <Spinner size={15} /> : <FolderOpen size={15} />}
            </button>
          )}
          {entry.locked ? (
            <Lock size={15} className="text-ink-faint shrink-0" />
          ) : (
            <Toggle label="Opens when you start your PC" checked={effectiveOn} pending={!!entry.pending} onChange={() => window.shell.apps.setStartup(entry.id, !effectiveOn)} />
          )}
        </>
      )}
    </div>
  )
}
