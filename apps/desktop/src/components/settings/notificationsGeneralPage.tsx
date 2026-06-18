import { useNotifications } from '../../hooks/useNotifications'

const POSITION_OPTIONS: { value: NotificationPosition; label: string }[] = [
  { value: 'top-left', label: 'Top left' },
  { value: 'top-center', label: 'Top center' },
  { value: 'top-right', label: 'Top right' },
  { value: 'bottom-left', label: 'Bottom left' },
  { value: 'bottom-right', label: 'Bottom right' },
]

const ACCESS_LABEL: Record<NotificationOsAccess, string> = {
  unknown: 'Not requested yet',
  granted: 'Granted',
  denied: 'Denied — enable it in Windows settings',
  unavailable: 'Unavailable on this system',
}

export default function NotificationsGeneralPage() {
  const { config, setConfig, osAccessStatus } = useNotifications()

  return (
    <div className="flex flex-col gap-8 w-full">
      <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>

      <Section title="General">
        <ToggleRow
          label="Enable notifications"
          description="Show toasts and collect notifications in the center."
          checked={config.enabled}
          onChange={(v) => setConfig({ enabled: v })}
        />
      </Section>

      {config.enabled && (
        <>
          <Section title="Behavior">
            <div className="flex flex-col gap-3">
              <ToggleRow
                label="Do Not Disturb"
                description="Silence toasts. Notifications are still collected in the center."
                checked={config.doNotDisturb}
                onChange={(v) => setConfig({ doNotDisturb: v })}
              />
              <ToggleRow
                label="Group by app"
                description="Collapse notifications from the same app in the center."
                checked={config.groupBySource}
                onChange={(v) => setConfig({ groupBySource: v })}
              />
              <SelectRow
                label="Toast position"
                value={config.position}
                options={POSITION_OPTIONS}
                onChange={(v) => setConfig({ position: v })}
              />
              <SliderRow
                label="Toast duration"
                min={2000}
                max={15000}
                step={1000}
                value={config.defaultDuration}
                display={(v) => `${Math.round(v / 1000)}s`}
                onChange={(v) => setConfig({ defaultDuration: v })}
              />
              <SliderRow
                label="History limit"
                min={10}
                max={200}
                step={10}
                value={config.maxHistory}
                display={(v) => `${v}`}
                onChange={(v) => setConfig({ maxHistory: v })}
              />
            </div>
          </Section>

          <Section title="Windows app notifications" subtitle="Mirror notifications from other Windows apps (Teams, Outlook, Discord…) into Alpine.">
            <div className="flex flex-col gap-3">
              <ToggleRow
                label="Capture Windows app notifications"
                description="Requires a one-time Windows permission. For a single clean toast, turn off native banners in Windows — notifications still reach the Action Center where Alpine reads them."
                checked={config.captureOsToasts}
                onChange={(v) => setConfig({ captureOsToasts: v })}
              />
              {config.captureOsToasts && (
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-sm">Notification access</div>
                    <div className="text-xs text-white/50 mt-0.5">{ACCESS_LABEL[osAccessStatus]}</div>
                  </div>
                  <button
                    onClick={() => window.shell?.notifications?.openOsAccessSettings?.()}
                    className="shrink-0 h-8 px-3 inline-flex items-center rounded-md border border-white/10 bg-white/5 text-white/90 text-xs font-medium hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    Open Windows settings
                  </button>
                </div>
              )}
            </div>
          </Section>
        </>
      )}
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
        <input
          type="range"
          min={min}
          max={max}
          step={step ?? 1}
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value, 10))}
          className="accent-white cursor-pointer"
        />
        <span className="text-xs text-white/50 w-10 text-right tabular-nums">{display(value)}</span>
      </div>
    </div>
  )
}

function SelectRow<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="text-sm">{label}</div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="bg-neutral-900 border border-white/10 rounded text-sm px-2 h-8 cursor-pointer"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}
