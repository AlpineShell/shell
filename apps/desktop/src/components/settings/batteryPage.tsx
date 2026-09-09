import { BatteryCharging, BatteryLow, Leaf } from 'lucide-react'
import { useBatterySaver } from '../../hooks/useBatterySaver'
import RegistryPage from './registryPage'
import Row from '../ui/row'
import Segmented from '../ui/segmented'

const SAVER_GROUP = 'Battery saver'
const AUTOMATIC_GROUP = 'Automatic'
const EFFECTS_GROUP = 'What battery saver does'

const OVERRIDE_CHOICES: SegmentedOption<BatterySaverOverride>[] = [
  { value: 'auto', label: 'Automatic' },
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off' },
]

export default function BatteryPage() {
  const { config, state, setOverride } = useBatterySaver()

  const slots: SettingsPageSlot[] = [
    {
      group: SAVER_GROUP,
      order: 0,
      replaces: ['battery-saver'],
      content: (
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
      ),
    },
  ]

  if (!state.hasBattery) {
    slots.push({
      group: AUTOMATIC_GROUP,
      order: 3,
      content: (
        <p className="text-xs text-ink-quiet">
          No battery was detected on this PC, so battery saver will never turn on by itself. You can still switch it on manually.
        </p>
      ),
    })
  }

  const hidden: string[] = []
  if (!config.automaticEnabled) hidden.push('battery-saver-threshold')
  if (!config.dimDisplays) hidden.push('battery-saver-dim-amount', 'battery-saver-dim-externals')

  return (
    <RegistryPage
      page="battery"
      slots={slots}
      hidden={hidden}
      lead={<StatusCard state={state} thresholdPercent={config.thresholdPercent} automaticEnabled={config.automaticEnabled} />}
      groupSubtitles={{ [EFFECTS_GROUP]: 'Each of these applies only while battery saver is active.' }}
    />
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
