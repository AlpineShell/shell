import { Check, Loader2, LogOut } from 'lucide-react'
import { useClockPrefs } from '../../hooks/useClockPrefs'
import { useCalendar } from '../../hooks/useCalendar'
import Section from '../ui/section'
import Row from '../ui/row'
import Toggle from '../ui/toggle'
import Segmented from '../ui/segmented'
import Button from '../ui/button'
import Card from '../ui/card'

const TIME_FORMAT_OPTIONS: SegmentedOption<TimeFormat>[] = [
  { value: 'auto', label: 'Auto' },
  { value: '12h', label: '12-hour' },
  { value: '24h', label: '24-hour' },
]

const DAY_OPTIONS: SegmentedOption<CalendarDayCount>[] = [
  { value: 1, label: '1 day' },
  { value: 2, label: '2 days' },
  { value: 3, label: '3 days' },
]

export default function TopBarClockSection() {
  const { prefs, setPrefs } = useClockPrefs()
  const { state, connect, disconnect } = useCalendar()

  const systemLabel = prefs.systemTimeFormat === '12h' ? '12-hour' : '24-hour'

  return (
    <Section title="Clock">
      <div className="flex flex-col gap-3">
        <Row
          label="Time format"
          description={prefs.timeFormat === 'auto' ? `Following Windows (${systemLabel}).` : undefined}
        >
          <Segmented
            label="Time format"
            options={TIME_FORMAT_OPTIONS}
            value={prefs.timeFormat}
            onChange={(value) => setPrefs({ timeFormat: value })}
          />
        </Row>

        {state.connected ? (
          <Card className="flex h-16 items-center justify-between gap-4 px-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line-hairline text-success">
                <Check size={16} />
              </span>
              <div className="flex min-w-0 flex-col">
                <span className="text-dense text-ink-primary">Google Calendar</span>
                <span className="truncate text-xs text-ink-quiet">{state.email ?? 'Connected'}</span>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => disconnect()}>
              <LogOut size={14} /> Disconnect
            </Button>
          </Card>
        ) : (
          <Row label="Google Calendar" description="Show today's schedule when you hover the clock.">
            <div className="flex flex-col items-end gap-1">
              <Button variant="outline" size="sm" onClick={() => connect()} disabled={state.connecting}>
                {state.connecting ? (<><Loader2 size={14} className="animate-spin" /> Waiting…</>) : 'Connect'}
              </Button>
              {state.error && !state.connecting && <ErrorNote error={state.error} />}
            </div>
          </Row>
        )}

        {state.connected && (
          <>
            <Row label="Days shown">
              <Segmented
                label="Days shown"
                options={DAY_OPTIONS}
                value={prefs.calendarDays}
                onChange={(value) => setPrefs({ calendarDays: value })}
              />
            </Row>
            <Row label="Google Tasks" description="Show tasks with a due date alongside events.">
              <Toggle
                label="Google Tasks"
                checked={prefs.showTasks}
                onChange={(value) => setPrefs({ showTasks: value })}
              />
            </Row>
          </>
        )}
      </div>
    </Section>
  )
}

function ErrorNote({ error }: { error: string }) {
  const message =
    error === 'no-credentials'
      ? 'Google sign-in isn’t configured in this build.'
      : error === 'timeout'
        ? 'Sign-in timed out. Try again.'
        : error === 'access_denied'
          ? 'Access was denied in the browser.'
          : `Couldn’t connect (${error}).`
  return <p className="text-xs text-danger">{message}</p>
}
