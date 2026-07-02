import { Check, Loader2, LogOut } from 'lucide-react'
import { useClockPrefs } from '../../hooks/useClockPrefs'
import { useCalendar } from '../../hooks/useCalendar'

const TIME_FORMAT_OPTIONS: { value: TimeFormat; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: '12h', label: '12-hour' },
  { value: '24h', label: '24-hour' },
]

const DAY_OPTIONS: { value: CalendarDayCount; label: string }[] = [
  { value: 1, label: '1 day' },
  { value: 2, label: '2 days' },
  { value: 3, label: '3 days' },
]

export default function CalendarPage() {
  const { prefs, setPrefs } = useClockPrefs()
  const { state, connect, disconnect } = useCalendar()

  const systemLabel = prefs.systemTimeFormat === '12h' ? '12-hour' : '24-hour'

  return (
    <div className="flex flex-col gap-8 w-full">
      <h1 className="text-2xl font-semibold tracking-tight">Calendar</h1>

      <Section title="Google account" subtitle="Connect Google Calendar to show today's schedule and tasks when you hover the clock.">
        {state.connected ? (
          <div className="flex items-center justify-between gap-4 px-4 h-16 rounded-lg bg-neutral-900 border border-white/5">
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-8 h-8 rounded-full bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0">
                <Check size={16} />
              </span>
              <div className="flex flex-col min-w-0">
                <span className="text-[13px] text-white/90">Connected</span>
                <span className="text-xs text-white/50 truncate">{state.email ?? 'Google account'}</span>
              </div>
            </div>
            <button
              onClick={() => disconnect()}
              className="flex items-center gap-1.5 px-3 h-8 rounded-md text-[13px] text-white/80 bg-white/5 hover:bg-white/10 cursor-pointer transition-colors"
            >
              <LogOut size={14} /> Disconnect
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <button
              onClick={() => connect()}
              disabled={state.connecting}
              className="flex items-center justify-center gap-2 h-10 rounded-lg bg-white text-neutral-900 text-sm font-medium cursor-pointer hover:bg-white/90 disabled:opacity-60 disabled:cursor-default transition-colors"
            >
              {state.connecting ? (<><Loader2 size={15} className="animate-spin" /> Waiting for browser…</>) : 'Connect Google Calendar'}
            </button>
            {state.error && !state.connecting && <ErrorNote error={state.error} />}
          </div>
        )}
      </Section>

      <Section title="Time format" subtitle={prefs.timeFormat === 'auto' ? `Following Windows (${systemLabel}).` : undefined}>
        <Segmented
          options={TIME_FORMAT_OPTIONS}
          value={prefs.timeFormat}
          onChange={(value) => setPrefs({ timeFormat: value })}
        />
      </Section>

      {state.connected && (
        <>
          <Section title="Days shown" subtitle="How many days the hover calendar shows at once.">
            <Segmented
              options={DAY_OPTIONS}
              value={prefs.calendarDays}
              onChange={(value) => setPrefs({ calendarDays: value })}
            />
          </Section>

          <Section title="Tasks">
            <ToggleRow
              label="Show Google Tasks"
              description="Display tasks with a due date alongside your events, like Google Calendar."
              checked={prefs.showTasks}
              onChange={(value) => setPrefs({ showTasks: value })}
            />
          </Section>
        </>
      )}

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
  return <p className="text-xs text-red-400">{message}</p>
}

function Segmented<T extends string | number>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (value: T) => void }) {
  return (
    <div className="inline-flex p-0.5 rounded-lg bg-neutral-900 border border-white/5 self-start">
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={String(option.value)}
            onClick={() => onChange(option.value)}
            className={`px-4 h-8 rounded-md text-[13px] cursor-pointer transition-colors ${active ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white'}`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {subtitle && <p className="text-xs text-white/50 mt-1">{subtitle}</p>}
      </div>
      {children}
    </section>
  )
}

function ToggleRow({ label, description, checked, onChange }: { label: string; description?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="text-sm">{label}</div>
        {description && <div className="text-xs text-white/50 mt-0.5">{description}</div>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`shrink-0 relative rounded-full transition-colors cursor-pointer ${checked ? 'bg-white' : 'bg-white/15'}`}
        style={{ width: 36, height: 20 }}
      >
        <span
          className="absolute top-0.5 rounded-full transition-all"
          style={{ width: 16, height: 16, left: checked ? 18 : 2, backgroundColor: checked ? 'rgb(20,20,20)' : 'rgba(255,255,255,0.7)' }}
        />
      </button>
    </div>
  )
}
