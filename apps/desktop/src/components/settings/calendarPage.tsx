import { Check, Loader2, LogOut } from 'lucide-react'
import { Button, Card } from '@alpine/ui'
import { useCalendar } from '../../hooks/useCalendar'
import RegistryPage from './registryPage'

const ACCOUNT_GROUP = 'Google account'

export default function CalendarPage() {
  const { state, connect, disconnect } = useCalendar()

  const slots: SettingsPageSlot[] = [
    {
      group: ACCOUNT_GROUP,
      order: 0,
      content: <GoogleAccount state={state} onConnect={connect} onDisconnect={disconnect} />,
    },
  ]

  return (
    <RegistryPage
      page="calendar"
      slots={slots}
      hidden={state.connected ? [] : ['calendar-days', 'calendar-show-tasks']}
      groupSubtitles={{
        [ACCOUNT_GROUP]: "Connect Google Calendar to show today's schedule and tasks when you hover the clock.",
      }}
    />
  )
}

function GoogleAccount({
  state,
  onConnect,
  onDisconnect,
}: {
  state: CalendarConnection
  onConnect: () => void
  onDisconnect: () => void
}) {
  if (state.connected) {
    return (
      <Card className="flex h-16 items-center justify-between gap-4 px-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line-hairline text-success">
            <Check size={16} />
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="text-dense text-ink-primary">Connected</span>
            <span className="truncate text-xs text-ink-quiet">{state.email ?? 'Google account'}</span>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={onDisconnect}>
          <LogOut size={14} /> Disconnect
        </Button>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <Button onClick={onConnect} disabled={state.connecting} className="font-medium">
        {state.connecting ? (<><Loader2 size={15} className="animate-spin" /> Waiting for browser…</>) : 'Connect Google Calendar'}
      </Button>
      {state.error && !state.connecting && <ErrorNote error={state.error} />}
    </div>
  )
}

function ErrorNote({ error }: { error: string }) {
  const message =
    error === 'no-credentials'
      ? 'Google sign-in isn’t configured in this build.'
      : error === 'timeout'
        ? 'Sign-in timed out. Try connecting again.'
        : error === 'access_denied'
          ? 'Access was denied in the browser.'
          : `Couldn’t connect (${error}).`
  return <p className="text-xs text-danger">{message}</p>
}
