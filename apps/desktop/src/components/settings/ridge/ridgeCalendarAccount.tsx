import { LogOut } from 'lucide-react'
import { Button, IconButton, Row } from '@alpine/ui'
import { useCalendar } from '../../../hooks/useCalendar'

const ACCOUNT_LABEL = 'Google Calendar'

const ACCOUNT_INFO = 'Shows your Google events and tasks in the hover calendar.'

const FALLBACK_ACCOUNT_NAME = 'Google account'

function connectErrorMessage(error: string): string {
  if (error === 'session-expired') return 'Your Google sign-in expired. Connect again.'
  if (error === 'timeout') return 'Sign-in timed out. Try again.'
  if (error === 'access_denied') return 'Access was denied in the browser.'
  return `Couldn’t connect (${error}).`
}

export default function RidgeCalendarAccount() {
  const { state, connect, disconnect } = useCalendar()

  if (state.connected) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-card bg-surface-3 px-3 py-2.5">
        <div className="flex min-w-0 flex-col">
          <span className="text-dense text-ink-primary">{ACCOUNT_LABEL}</span>
          <span className="truncate text-xs text-ink-quiet">{state.email ?? FALLBACK_ACCOUNT_NAME}</span>
        </div>
        <IconButton label="Disconnect" onClick={disconnect}>
          <LogOut size={15} />
        </IconButton>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <Row label={ACCOUNT_LABEL} info={ACCOUNT_INFO}>
        <Button size="sm" busy={state.connecting} disabled={state.connecting} onClick={connect}>
          {state.connecting ? 'Waiting…' : 'Connect'}
        </Button>
      </Row>
      {state.error && !state.connecting && <p className="text-xs text-danger">{connectErrorMessage(state.error)}</p>}
    </div>
  )
}
