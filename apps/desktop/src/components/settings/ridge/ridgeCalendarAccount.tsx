import { LogOut } from 'lucide-react'
import { Button, Row } from '@alpine/ui'
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
      <Row label={ACCOUNT_LABEL} description={state.email ?? FALLBACK_ACCOUNT_NAME}>
        <Button shape="square" variant="ghost" size="sm" icon={<LogOut size={14} />} onClick={disconnect}>
          Disconnect
        </Button>
      </Row>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <Row label={ACCOUNT_LABEL} description={ACCOUNT_INFO}>
        <Button shape="square" size="sm" busy={state.connecting} disabled={state.connecting} onClick={connect}>
          {state.connecting ? 'Waiting…' : 'Connect'}
        </Button>
      </Row>
      {state.error && !state.connecting && <p className="text-xs text-danger">{connectErrorMessage(state.error)}</p>}
    </div>
  )
}
