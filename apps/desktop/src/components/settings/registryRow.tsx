import type { ReactNode } from 'react'
import { useSettingsValue } from '../../hooks/useSettingsValue'
import Row from '../ui/row'
import Toggle from '../ui/toggle'
import Slider from '../ui/slider'
import Select from '../ui/select'
import Segmented from '../ui/segmented'
import Button from '../ui/button'
import HotkeyRecorder from './hotkeyRecorder'

export function ActionRow({
  entry,
  description,
  actionLabel,
  run,
}: {
  entry: SettingsEntry
  description: string
  actionLabel: string
  run: () => Promise<unknown>
}) {
  return (
    <Row label={entry.label} description={description}>
      <Button variant="outline" size="sm" onClick={() => { run().catch(() => {}) }}>
        {actionLabel}
      </Button>
    </Row>
  )
}

export function ValueRow({ entry, description }: { entry: SettingsValueEntry; description: string }) {
  const { value, staged, restartRequired, error, write, confirm, cancel } = useSettingsValue(entry)
  const proposed = staged !== undefined

  return (
    <div className="flex flex-col gap-2">
      <Row label={entry.label} description={description}>
        <EntryControl entry={entry} value={staged ?? value} pending={proposed} onChange={write} />
      </Row>
      {proposed && <ConfirmBar label={entry.label} onConfirm={confirm} onCancel={cancel} />}
      {restartRequired && <Note>Restart Alpine Shell to finish applying this.</Note>}
      {error && <Note danger>{error}</Note>}
    </div>
  )
}

function ConfirmBar({ label, onConfirm, onCancel }: { label: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-field border border-warning/40 bg-warning/10 px-3 py-2">
      <span className="text-xs text-ink-secondary">Not applied yet.</span>
      <span className="flex shrink-0 items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" size="sm" onClick={onConfirm}>
          {`Apply ${label.toLowerCase()}`}
        </Button>
      </span>
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
    return <Toggle label={entry.label} checked={value === true} pending={pending} onChange={onChange} />
  }

  if (control.kind === 'slider') {
    return (
      <Slider
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
