import { useMemo, useState } from 'react'
import { AppWindow, Boxes, Search, X } from 'lucide-react'
import { Avatar, Card, ConfirmButton, EmptyState, ListRow, PageHeader, TextField } from '@alpine/ui'
import { settingsPage } from '../../settings/registry'
import { useRunningApps } from '../../hooks/useRunningApps'
import { formatMemory } from './appsShared'
import PageSpinner from './pageSpinner'

export default function AppsRunningPage() {
  const running = useRunningApps()
  const [query, setQuery] = useState('')
  const [backgroundOpen, setBackgroundOpen] = useState(false)
  const q = query.trim().toLowerCase()

  const visible = useMemo(() => {
    return running
      .filter((a) => a.category !== 'system')
      .filter((a) => !q || a.friendlyName.toLowerCase().includes(q) || a.name.toLowerCase().includes(q))
      .sort((a, b) => b.memory - a.memory)
  }, [running, q])

  const foreground = visible.filter((a) => a.hasWindow)
  const background = visible.filter((a) => !a.hasWindow)
  const showBackground = backgroundOpen || q.length > 0

  return (
    <div className="flex w-full flex-col gap-5">
      <PageHeader variant="plain" title={settingsPage('apps-running')?.label ?? ''}>
        <TextField
          label="Search running apps"
          value={query}
          onChange={setQuery}
          placeholder="Search for an app"
          icon={<Search size={13} />}
          className="w-56"
        />
      </PageHeader>

      {running.length === 0 && <PageSpinner label="Looking at what's running" />}
      {running.length > 0 && visible.length === 0 && <EmptyState variant="plain" title="No apps match your search." />}

      <Card variant="list">
        {foreground.map((app) => (
          <RunningRow key={app.name} app={app} />
        ))}
      </Card>

      {background.length > 0 && (
        <Card variant="list">
            <ListRow
              variant="plain"
              icon={<Boxes size={16} className="text-ink-faint" />}
              title={`In the background · ${background.length}`}
              muted
              onActivate={() => setBackgroundOpen((v) => !v)}
              expanded={showBackground}
            />
          {showBackground && background.map((app) => <RunningRow key={app.name} app={app} />)}
        </Card>
      )}
    </div>
  )
}

function runningDetail(app: RunningApp): string {
  const memory = formatMemory(app.memory)
  return app.count > 1 ? `${memory} · ${app.count} processes` : memory
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
    <ListRow
      variant="plain"
      revealActions
      icon={<Avatar src={app.icon} alt={app.friendlyName} fallback={<AppWindow size={16} strokeWidth={1.75} />} />}
      title={app.friendlyName}
      detail={runningDetail(app)}
      actions={
        <ConfirmButton
          variant="ghost"
          label="Close"
          confirmLabel="Force close"
          onConfirm={close}
          busy={busy}
          icon={<X size={14} />}
          iconOnly
          confirmOnly
        />
      }
    />
  )
}
