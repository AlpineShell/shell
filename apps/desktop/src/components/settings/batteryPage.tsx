import { BatteryCharging, BatteryLow, Leaf } from 'lucide-react'
import { useBatterySaver } from '../../hooks/useBatterySaver'
import PageTitle from '../ui/pageTitle'
import Section from '../ui/section'
import Row from '../ui/row'
import Toggle from '../ui/toggle'
import Segmented from '../ui/segmented'
import Slider from '../ui/slider'

const OVERRIDE_CHOICES: { value: BatterySaverOverride; label: string }[] = [
  { value: 'auto', label: 'Automatic' },
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off' },
]

export default function BatteryPage() {
  const { config, setConfig, state, setOverride } = useBatterySaver()

  return (
    <div className="flex flex-col gap-section w-full">
      <PageTitle title="Battery" />

      <StatusCard state={state} thresholdPercent={config.thresholdPercent} automaticEnabled={config.automaticEnabled} />

      <Section title="Battery saver">
        <Row
          label="Battery saver right now"
          description="On and Off both hold whatever the charge is, and go back to Automatic the next time you plug in."
        >
          <Segmented
            label="Battery saver right now"
            options={OVERRIDE_CHOICES}
            value={state.override}
            onChange={setOverride}
          />
        </Row>
      </Section>

      <Section title="Automatic">
        <div className="flex flex-col gap-3">
          <Row
            label="Turn on battery saver automatically"
            description="Enter battery saver on its own once the charge runs low."
          >
            <Toggle
              label="Turn on battery saver automatically"
              checked={config.automaticEnabled}
              onChange={(v) => setConfig({ automaticEnabled: v })}
            />
          </Row>
          {config.automaticEnabled && (
            <Row label="Turn on at or below">
              <Slider
                label="Turn on at or below"
                min={5}
                max={90}
                step={5}
                value={config.thresholdPercent}
                suffix="%"
                onChange={(v) => setConfig({ thresholdPercent: v })}
              />
            </Row>
          )}
        </div>
        {!state.hasBattery && (
          <p className="text-xs text-ink-quiet">
            No battery was detected on this PC, so battery saver will never turn on by itself. You can still switch it on manually.
          </p>
        )}
      </Section>

      <Section title="What battery saver does" subtitle="Each of these applies only while battery saver is active.">
        <div className="flex flex-col gap-3">
          <Row
            label="Dim the displays"
            description="Lower the brightness of the built-in display, and put it back when battery saver ends."
          >
            <Toggle
              label="Dim the displays"
              checked={config.dimDisplays}
              onChange={(v) => setConfig({ dimDisplays: v })}
            />
          </Row>
          {config.dimDisplays && (
            <Row label="Dim by">
              <Slider
                label="Dim by"
                min={5}
                max={60}
                step={5}
                value={config.brightnessReductionPercent}
                suffix="%"
                onChange={(v) => setConfig({ brightnessReductionPercent: v })}
              />
            </Row>
          )}
          {config.dimDisplays && (
            <Row
              label="Also dim external monitors"
              description="External monitors run on their own power supply, so dimming them saves no battery. Turn this on only if a monitor draws its power from this PC."
            >
              <Toggle
                label="Also dim external monitors"
                checked={config.dimExternalDisplays}
                onChange={(v) => setConfig({ dimExternalDisplays: v })}
              />
            </Row>
          )}
          <Row
            label="Slow down background checks"
            description="Poll Bluetooth, Wi-Fi and window colours far less often. The top bar updates more slowly but wakes the CPU and the radios much less."
          >
            <Toggle
              label="Slow down background checks"
              checked={config.reduceBackgroundPolling}
              onChange={(v) => setConfig({ reduceBackgroundPolling: v })}
            />
          </Row>
          <Row
            label="Throttle Alpine's own processes"
            description="Ask Windows to run Alpine at efficiency speed (EcoQoS). Saves the most power, but the top bar and its menus can feel less smooth."
          >
            <Toggle
              label="Throttle Alpine's own processes"
              checked={config.throttleProcesses}
              onChange={(v) => setConfig({ throttleProcesses: v })}
            />
          </Row>
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
    <div className="rounded-card bg-surface-2 border border-line-hairline px-4 py-4 flex items-center gap-3">
      <Icon size={18} className={`shrink-0 ${state.active ? 'text-success' : 'text-ink-secondary'}`} />
      <div className="flex flex-col flex-1 min-w-0 gap-0.5">
        <span className="text-dense text-ink-primary">{statusHeadline(state)}</span>
        <span className="text-xs text-ink-quiet">{statusDetail(state, thresholdPercent, automaticEnabled)}</span>
      </div>
      {state.active && (
        <span className="shrink-0 text-eyebrow uppercase px-1.5 py-0.5 rounded bg-success/15 text-success">
          {state.reason === 'manual' ? 'Manual' : 'Automatic'}
        </span>
      )}
    </div>
  )
}
