import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import { Button, IconButton, Row, Segmented, Select, Slider, Toggle } from '@alpine/ui'
import { useSettingsValue } from '../../hooks/useSettingsValue'
import { useOutsidePointer } from '../../hooks/useOutsidePointer'
import HotkeyRecorder from './hotkeyRecorder'

const ACTION_ICON_SIZE = 16

export function ActionRow({
  entry,
  description,
  actionLabel,
  actionIcon: ActionIcon,
  run,
}: {
  entry: SettingsEntry
  description: string
  actionLabel: string
  actionIcon: SettingsIcon
  run: () => Promise<unknown>
}) {
  return (
    <Row label={entry.label} description={description}>
      <IconButton label={actionLabel} onClick={() => { run().catch(() => {}) }}>
        <ActionIcon size={ACTION_ICON_SIZE} />
      </IconButton>
    </Row>
  )
}

const WIDE_CONTROLS = new Set<SettingsValueControl['kind']>(['slider', 'select', 'segmented', 'hotkey'])

function controlTakesItsOwnLine(entry: SettingsValueEntry): boolean {
  return WIDE_CONTROLS.has(entry.control.kind)
}

export function ValueRow({ entry, description, wideControlStacked = false }: ValueRowProps) {
  const { value, staged, restartRequired, error, write, confirm, cancel } = useSettingsValue(entry)
  const proposed = staged !== undefined
  const stacked = wideControlStacked && controlTakesItsOwnLine(entry)
  const holder = useRef<HTMLDivElement>(null)

  useOutsidePointer(holder, proposed, cancel)

  function cancelOnEscape(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Escape' || !proposed) return
    event.preventDefault()
    cancel()
  }

  return (
    <div ref={holder} className="flex flex-col gap-2" onKeyDown={cancelOnEscape}>
      <Row label={entry.label} description={description} stacked={stacked}>
        <div className="flex items-center gap-2">
          {proposed && (
            <Button shape="square" variant="primary" size="sm" aria-label={`Apply ${entry.label.toLowerCase()}`} onClick={confirm}>
              Apply
            </Button>
          )}
          <div className={stacked ? 'min-w-0 flex-1' : 'flex'}>
            <EntryControl entry={entry} value={staged ?? value} pending={proposed} onChange={write} />
          </div>
        </div>
      </Row>
      {restartRequired && <Note>Restart Alpine Shell to finish applying this.</Note>}
      {error && <Note danger>{error}</Note>}
    </div>
  )
}

function Note({ children, danger }: { children: ReactNode; danger?: boolean }) {
  return <p className={`text-xs ${danger ? 'text-danger' : 'text-warning'}`}>{children}</p>
}

function EntryControl({
  entry,
  value,
  pending,
  onChange,
}: {
  entry: SettingsValueEntry
  value: SettingsValue
  pending: boolean
  onChange: (next: SettingsValue) => void
}) {
  const control = entry.control

  if (control.kind === 'toggle') {
    return <Toggle variant="compact" label={entry.label} checked={value === true} pending={pending} onChange={onChange} />
  }

  if (control.kind === 'slider') {
    return (
      <Slider
        variant="wide"
        label={entry.label}
        min={control.min}
        max={control.max}
        step={control.step}
        value={typeof value === 'number' ? value : control.min}
        suffix={control.unit}
        onChange={onChange}
      />
    )
  }

  if (control.kind === 'select') {
    return (
      <Select
        variant="filled"
        label={entry.label}
        options={[...control.options]}
        value={typeof value === 'string' ? value : String(entry.defaultValue)}
        onChange={onChange}
      />
    )
  }

  if (control.kind === 'segmented') {
    return (
      <Segmented
        variant="filled"
        label={entry.label}
        options={[...control.options]}
        value={typeof value === 'string' || typeof value === 'number' ? value : (entry.defaultValue as string | number)}
        onChange={onChange}
      />
    )
  }

  if (control.kind === 'hotkey') {
    return <HotkeyRecorder value={typeof value === 'string' ? value : control.fallback} fallback={control.fallback} onChange={onChange} />
  }

  return null
}
