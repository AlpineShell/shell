import { useNotifications } from '../../hooks/useNotifications'

const POSITION_OPTIONS: { value: NotificationPosition; label: string }[] = [
  { value: 'top-left', label: 'Top left' },
  { value: 'top-center', label: 'Top center' },
  { value: 'top-right', label: 'Top right' },
]

export default function NotificationsPage() {
  const { config, setConfig } = useNotifications()

  return (
    <div className="flex flex-col gap-8 w-full">
      <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>

      <section className="flex flex-col gap-4">
        <ToggleRow
          label="Enable notifications"
          description="Show toasts and collect notifications — including from other Windows apps — in the bell menu."
          checked={config.enabled}
          onChange={(v) => setConfig({ enabled: v })}
        />
        {config.enabled && (
          <>
            <ToggleRow
              label="Do Not Disturb"
              description="Silence toasts. Notifications are still collected in the bell menu."
              checked={config.doNotDisturb}
              onChange={(v) => setConfig({ doNotDisturb: v })}
            />
            <SelectRow label="Toast position" value={config.position} options={POSITION_OPTIONS} onChange={(v) => setConfig({ position: v })} />
            <SliderRow
              label="Toast duration"
              min={2000}
              max={15000}
              step={1000}
              value={config.defaultDuration}
              display={(v) => `${Math.round(v / 1000)}s`}
              onChange={(v) => setConfig({ defaultDuration: v })}
            />
          </>
        )}
      </section>
    </div>
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
        className={`shrink-0 relative rounded-full cursor-pointer transition-colors ${checked ? 'bg-white' : 'bg-white/15'}`}
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

function SliderRow({ label, min, max, step, value, display, onChange }: { label: string; min: number; max: number; step?: number; value: number; display: (v: number) => string; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0 text-sm">{label}</div>
      <div className="flex items-center gap-3 shrink-0">
        <input type="range" min={min} max={max} step={step ?? 1} value={value} onChange={(e) => onChange(parseInt(e.target.value, 10))} className="accent-white cursor-pointer" />
        <span className="text-xs text-white/50 w-10 text-right tabular-nums">{display(value)}</span>
      </div>
    </div>
  )
}

function SelectRow<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="text-sm">{label}</div>
      <select value={value} onChange={(e) => onChange(e.target.value as T)} className="bg-neutral-900 border border-white/10 rounded text-sm px-2 h-8 cursor-pointer">
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}
