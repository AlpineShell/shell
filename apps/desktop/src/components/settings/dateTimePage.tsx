import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, RefreshCw } from 'lucide-react'
import { Button, Card, Row, SearchPicker, Toggle } from '@alpine/ui'
import { useDateTime } from '../../hooks/useDateTime'
import { useOutsidePointer } from '../../hooks/useOutsidePointer'
import { scoreField } from '../../lib/launcherSearch'
import RegistryPage from './registryPage'

const TIME_ZONE_GROUP = 'Time zone'
const CLOCK_GROUP = 'Clock'
const CLOCK_TICK_MS = 1000

function formatClockTime(now: Date): string {
  return new Intl.DateTimeFormat(undefined, { timeStyle: 'medium' }).format(now)
}

function formatLongDate(now: Date): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'full' }).format(now)
}

export default function DateTimePage() {
  const { state, busy, failure, synced, setTimeZone, setAutoTimeZone, setAutoTime, syncNow } = useDateTime()

  const slots: SettingsPageSlot[] = [
    {
      group: TIME_ZONE_GROUP,
      order: 0,
      replaces: ['time-zone'],
      content: (
        <TimeZoneRow
          state={state}
          busy={busy === 'time-zone'}
          locked={state.autoTimeZone === true}
          onChange={setTimeZone}
        />
      ),
    },
    {
      group: TIME_ZONE_GROUP,
      order: 1,
      replaces: ['time-zone-automatic'],
      content: state.autoTimeZone !== null && (
        <Row label="Set time zone automatically">
          <Toggle
            variant="compact"
            label="Set time zone automatically"
            checked={state.autoTimeZone}
            pending={busy === 'auto-time-zone'}
            disabled={busy !== null}
            onChange={setAutoTimeZone}
          />
        </Row>
      ),
    },
    {
      group: CLOCK_GROUP,
      order: 1,
      replaces: ['time-automatic'],
      content: state.autoTime !== null && (
        <Row label="Set time automatically">
          <Toggle
            variant="compact"
            label="Set time automatically"
            checked={state.autoTime}
            pending={busy === 'auto-time'}
            disabled={busy !== null}
            onChange={setAutoTime}
          />
        </Row>
      ),
    },
    {
      group: CLOCK_GROUP,
      order: 2,
      replaces: ['time-sync'],
      content: (
        <Row label="Sync now" description={synced ? 'The clock matches the time server.' : undefined}>
          <Button shape="square" size="sm" variant="soft" icon={<RefreshCw size={14} />} busy={busy === 'sync'} disabled={busy !== null} onClick={syncNow}>
            Sync
          </Button>
        </Row>
      ),
    },
  ]

  return (
    <RegistryPage
      page="date-time"
      slots={slots}
      lead={
        <>
          {failure && <p role="alert" className="-mt-3 text-xs text-danger">{failure}</p>}
          <CurrentTime timeZoneId={state.timeZoneId} />
        </>
      }
    />
  )
}

function TimeZoneRow({ state, busy, locked, onChange }: { state: DateTimeState; busy: boolean; locked: boolean; onChange: (id: string) => void }) {
  const [picking, setPicking] = useState(false)
  const pickerAnchor = useRef<HTMLDivElement>(null)
  const closePicker = useCallback(() => setPicking(false), [])

  useOutsidePointer(pickerAnchor, picking, closePicker)

  const current = state.timeZones.find((zone) => zone.id === state.timeZoneId)
  const options = state.timeZones.map((zone) => ({ value: zone.id, label: zone.label, detail: zone.id, disabled: zone.id === state.timeZoneId }))

  return (
    <Row
      label="Time zone"
      disabled={locked}
      description={locked ? 'Turn off Set time zone automatically to pick one yourself.' : undefined}
    >
      <div ref={pickerAnchor} className="relative flex">
        <Button
          shape="square"
          size="sm"
          variant="soft"
          aria-expanded={picking}
          busy={busy}
          disabled={locked || options.length === 0}
          onClick={() => setPicking((open) => !open)}
        >
          <span className="max-w-72 truncate">{current?.label ?? state.timeZoneId ?? 'Loading…'}</span>
          <ChevronDown size={14} className="shrink-0" />
        </Button>
        {picking && (
          <div className="absolute top-full right-0 z-40 mt-2 w-96">
            <Card className="p-3">
              <SearchPicker
                label="Time zone"
                placeholder={`Search ${options.length} time zones`}
                options={options}
                emptyMessage="No time zone matches that."
                score={scoreField}
                onSelect={(id) => {
                  setPicking(false)
                  onChange(id)
                }}
                onDismiss={closePicker}
              />
            </Card>
          </div>
        )}
      </div>
    </Row>
  )
}

function CurrentTime({ timeZoneId }: { timeZoneId: string | null }) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), CLOCK_TICK_MS)
    return () => clearInterval(timer)
  }, [timeZoneId])

  return (
    <Card variant="group">
      <div role="timer" aria-label="Current time" className="flex flex-col py-2">
        <span className="text-[34px] leading-10 font-normal tracking-tight tabular-nums text-ink-primary">{formatClockTime(now)}</span>
        <span className="text-dense text-ink-quiet">{formatLongDate(now)}</span>
      </div>
    </Card>
  )
}
