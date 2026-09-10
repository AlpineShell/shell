import { useMemo, useState } from 'react'
import { AppWindow, Boxes, Search } from 'lucide-react'
import { useRunningApps } from '../../hooks/useRunningApps'
import { bandLabel, bandTone } from './appsShared'
import Avatar from '../ui/avatar'
import Badge from '../ui/badge'
import ConfirmButton from '../ui/confirmButton'
import EmptyState from '../ui/emptyState'
import ListRow from '../ui/listRow'
import PageHeader from '../ui/pageHeader'
import Spinner from '../ui/spinner'
import TextField from '../ui/textField'

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
      <PageHeader title="Running" subtitle="Apps using your computer right now. You can close ones you're not using.">
        <TextField
          label="Search running apps"
          value={query}
          onChange={setQuery}
          placeholder="Search for an app"
          icon={<Search size={13} />}
          className="w-56"
        />
      </PageHeader>

      <div className="flex flex-col gap-1">
        {running.length === 0 && <EmptyState icon={<Spinner size={20} />} title="Looking at what's running…" />}
        {running.length > 0 && visible.length === 0 && (
          <EmptyState icon={<Search size={20} />} title="No apps match your search." />
        )}

        {foreground.map((app) => (
          <RunningRow key={app.name} app={app} />
        ))}

        {background.length > 0 && (
          <div className="mt-1">
            <ListRow
              icon={<Boxes size={18} className="text-ink-faint" />}
              title={`Running in the background (${background.length})`}
              detail="Helpers and services running without a window — usually started by your apps."
              onActivate={() => setBackgroundOpen((v) => !v)}
              expanded={showBackground}
            >
              {showBackground && (
                <div className="flex flex-col gap-1 px-2 pb-2">
                  {background.map((app) => (
                    <RunningRow key={app.name} app={app} />
                  ))}
                </div>
              )}
            </ListRow>
          </div>
        )}
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
    <ListRow
      icon={<Avatar src={app.icon} alt={app.friendlyName} size="sm" fallback={<AppWindow size={14} strokeWidth={1.75} />} />}
      title={app.friendlyName}
      badges={
        <>
          {app.count > 1 && <Badge>{app.count}</Badge>}
          <Badge tone={bandTone(app.band)}>{bandLabel(app.band)}</Badge>
        </>
      }
      actions={
        <ConfirmButton
          variant="ghost"
          label="Close"
          confirmLabel="Force close"
          onConfirm={close}
          busy={busy}
          className="min-w-20"
        />
      }
    />
  )
}
