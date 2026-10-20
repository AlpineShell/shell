import { useMemo, useState } from 'react'
import { AppWindow, FolderOpen, Lock, Search, ShieldAlert } from 'lucide-react'
import { Avatar, Badge, Button, Card, ConfirmButton, EmptyState, IconButton, ListRow, PageHeader, TextField, Toggle } from '@alpine/ui'
import { settingsPage } from '../../settings/registry'
import { useStartupApps } from '../../hooks/useStartupApps'
import { useRunningApps } from '../../hooks/useRunningApps'
import { processKey, startsWithPc } from './appsShared'
import PageSpinner from './pageSpinner'

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
    <div className="flex w-full flex-col gap-5">
      <PageHeader variant="plain" title={settingsPage('apps-startup')?.label ?? ''}>
        <TextField
          label="Search startup apps"
          value={query}
          onChange={setQuery}
          placeholder="Search for an app"
          icon={<Search size={13} />}
          className="w-56"
        />
      </PageHeader>

      {pending.length > 0 && (
        <div role="status" className="flex items-center gap-3 rounded-card bg-fill-subtle py-2.5 pr-2.5 pl-4">
          <ShieldAlert size={16} className="shrink-0 text-warning" />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-dense text-ink-primary">{pending.length} system {pending.length === 1 ? 'app change needs' : 'app changes need'} your approval</span>
            {error && <span className="mt-0.5 text-xs text-danger">{error}</span>}
          </div>
          <Button
            shape="square"
            variant="ghost"
            size="sm"
            disabled={applying}
            onClick={() => pending.forEach((e) => window.shell.apps.clearPending(e.id))}
          >
            Cancel
          </Button>
          <Button shape="square" size="sm" onClick={applyChanges} busy={applying}>
            {applying ? 'Approving…' : 'Approve'}
          </Button>
        </div>
      )}

      {startup.length === 0 && <PageSpinner label="Looking for startup apps" />}
      {startup.length > 0 && appEntries.length === 0 && systemEntries.length === 0 && (
        <EmptyState variant="plain" title="No apps match your search." />
      )}

      <Card variant="list">
        {appEntries.map((entry) => (
          <StartupRow key={entry.id} entry={entry} running={matchOf(entry)} />
        ))}
      </Card>

      {systemEntries.length > 0 && (
        <Card variant="list">
          <ListRow
            variant="plain"
            icon={<Lock size={15} className="text-ink-faint" />}
            title={`Part of Windows · ${systemEntries.length}`}
            muted
            onActivate={() => setSystemOpen(!systemOpen)}
            expanded={systemOpen}
          />
          {systemOpen && systemEntries.map((entry) => <StartupRow key={entry.id} entry={entry} running={matchOf(entry)} />)}
        </Card>
      )}
    </div>
  )
}

function startupDetail(entry: StartupEntry): string | undefined {
  if (entry.missing) return 'No longer on your PC'
  return entry.blurb || undefined
}

function StartupRow({ entry, running }: { entry: StartupEntry; running?: RunningApp }) {
  const [locating, setLocating] = useState(false)
  const [removing, setRemoving] = useState(false)
  const effectiveOn = startsWithPc(entry)

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
    <ListRow
      variant="plain"
      icon={<Avatar src={entry.icon} alt={entry.friendlyName} fallback={<AppWindow size={16} strokeWidth={1.75} />} />}
      title={entry.friendlyName}
      badges={running?.band === 'heavy' && !entry.missing ? <Badge>Heavy</Badge> : undefined}
      muted={entry.missing}
      detail={startupDetail(entry)}
      actions={
        entry.missing ? (
          <ConfirmButton
            shape="square"
            variant="dangerSoft"
            confirmVariant="danger"
            label="Remove"
            confirmLabel="Remove"
            onConfirm={remove}
            busy={removing}
            confirmOnly
          />
        ) : (
          <>
            {entry.target && (
              <IconButton label="Open file location" tooltip="top" onClick={openLocation} busy={locating}>
                <FolderOpen size={15} />
              </IconButton>
            )}
            {entry.locked ? (
              <Lock size={15} className="shrink-0 text-ink-faint" />
            ) : (
              <Toggle variant="compact" label="Opens when you start your PC" checked={effectiveOn} pending={!!entry.pending} onChange={() => window.shell.apps.setStartup(entry.id, !effectiveOn)} />
            )}
          </>
        )
      }
    />
  )
}
