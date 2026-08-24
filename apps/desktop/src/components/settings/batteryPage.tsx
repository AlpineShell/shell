import { BatteryCharging, BatteryLow, Leaf } from 'lucide-react'
import { useBatterySaver } from '../../hooks/useBatterySaver'

const OVERRIDE_CHOICES: { value: BatterySaverOverride; label: string }[] = [
  { value: 'auto', label: 'Automatic' },
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off' },
]

export default function BatteryPage() {
  const { config, setConfig, state, setOverride } = useBatterySaver()

  return (
    <div className="flex flex-col gap-8 w-full">
      <h1 className="text-2xl font-semibold tracking-tight">Battery</h1>

      <StatusCard state={state} thresholdPercent={config.thresholdPercent} automaticEnabled={config.automaticEnabled} />

      <Section title="Battery saver">
        <ChoiceRow
          label="Battery saver right now"
          description="On and Off both hold whatever the charge is, and go back to Automatic the next time you plug in."
          value={state.override}
          choices={OVERRIDE_CHOICES}
          onChange={setOverride}
        />
      </Section>

      <Section title="Automatic">
        <div className="flex flex-col gap-3">
          <ToggleRow
            label="Turn on battery saver automatically"
            description="Enter battery saver on its own once the charge runs low."
            checked={config.automaticEnabled}
            onChange={(v) => setConfig({ automaticEnabled: v })}
          />
          {config.automaticEnabled && (
            <SliderRow
              label="Turn on at or below"
              min={5}
              max={90}
              step={5}
              value={config.thresholdPercent}
              suffix="%"
              onChange={(v) => setConfig({ thresholdPercent: v })}
            />
          )}
        </div>
        {!state.hasBattery && (
          <p className="text-xs text-white/50">
            No battery was detected on this PC, so battery saver will never turn on by itself. You can still switch it on manually.
          </p>
        )}
      </Section>

      <Section title="What battery saver does" subtitle="Each of these applies only while battery saver is active.">
        <div className="flex flex-col gap-3">
          <ToggleRow
            label="Dim the displays"
            description="Lower the brightness of every display Alpine can control, and put it back when battery saver ends."
            checked={config.dimDisplays}
            onChange={(v) => setConfig({ dimDisplays: v })}
          />
          {config.dimDisplays && (
            <SliderRow
              label="Dim by"
              min={5}
              max={60}
              step={5}
              value={config.brightnessReductionPercent}
              suffix="%"
              onChange={(v) => setConfig({ brightnessReductionPercent: v })}
            />
          )}
          <ToggleRow
            label="Slow down background checks"
            description="Poll Bluetooth, Wi-Fi and window colours far less often. The top bar updates more slowly but wakes the CPU and the radios much less."
            checked={config.reduceBackgroundPolling}
            onChange={(v) => setConfig({ reduceBackgroundPolling: v })}
          />
          <ToggleRow
            label="Throttle Alpine's own processes"
            description="Ask Windows to run Alpine at efficiency speed (EcoQoS). Saves the most power, but the top bar and its menus can feel less smooth."
            checked={config.throttleProcesses}
            onChange={(v) => setConfig({ throttleProcesses: v })}
          />
        </div>
      </Section>
    </div>
  )
}

function statusHeadline(state: BatterySaverState): string {
  if (state.active) return 'Battery saver is on'
  return 'Battery saver is off'
}

function statusDetail(state: BatterySaverState, thresholdPercent: number, automaticEnabled: boolean): string {
  const charge = state.percent == null ? 'Charge unavailable' : `${state.percent}% charge`
  const source = state.onAcPower ? (state.charging ? 'charging' : 'plugged in') : 'on battery'
  if (state.reason === 'manual') return `${charge}, ${source} — turned on manually.`
  if (state.reason === 'threshold') return `${charge}, ${source} — at or below your ${thresholdPercent}% threshold.`
  if (state.override === 'off') return `${charge}, ${source} — turned off manually until you next plug in.`
  if (state.onAcPower) return `${charge}, ${source} — battery saver stays off while you are plugged in.`
  if (!automaticEnabled) return `${charge}, ${source} — automatic battery saver is turned off.`
  return `${charge}, ${source} — battery saver turns on at ${thresholdPercent}%.`
}

function StatusCard({ state, thresholdPercent, automaticEnabled }: { state: BatterySaverState; thresholdPercent: number; automaticEnabled: boolean }) {
  const Icon = state.active ? Leaf : state.onAcPower ? BatteryCharging : BatteryLow
  return (
    <div className="rounded-lg bg-neutral-900 border border-white/5 px-4 py-4 flex items-center gap-3">
      <Icon size={18} className={`shrink-0 ${state.active ? 'text-emerald-400' : 'text-white/60'}`} />
      <div className="flex flex-col flex-1 min-w-0 gap-0.5">
        <span className="text-[13px] text-white/90">{statusHeadline(state)}</span>
        <span className="text-xs text-white/50">{statusDetail(state, thresholdPercent, automaticEnabled)}</span>
      </div>
      {state.active && (
        <span className="shrink-0 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400/90">
          {state.reason === 'manual' ? 'Manual' : 'Automatic'}
        </span>
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

function ChoiceRow({ label, description, value, choices, onChange }: { label: string; description?: string; value: BatterySaverOverride; choices: { value: BatterySaverOverride; label: string }[]; onChange: (v: BatterySaverOverride) => void }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="text-sm">{label}</div>
        {description && <div className="text-xs text-white/50 mt-0.5">{description}</div>}
      </div>
      <div className="shrink-0 flex gap-0.5 rounded-md bg-white/10 p-0.5">
        {choices.map((choice) => (
          <button
            key={choice.value}
            onClick={() => onChange(choice.value)}
            className={`px-2.5 py-1 text-xs rounded transition-colors cursor-pointer ${
              value === choice.value ? 'bg-white text-neutral-900' : 'text-white/70 hover:text-white'
            }`}
          >
            {choice.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function SliderRow({ label, min, max, step, value, suffix, onChange }: { label: string; min: number; max: number; step: number; value: number; suffix?: string; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0 text-sm">{label}</div>
      <div className="flex items-center gap-3 shrink-0">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value, 10))}
          className="accent-white cursor-pointer"
        />
        <span className="text-xs text-white/50 w-10 text-right tabular-nums">
          {value}
          {suffix}
        </span>
      </div>
    </div>
  )
}
