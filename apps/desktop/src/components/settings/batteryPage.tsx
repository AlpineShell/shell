import { BatteryCharging, BatteryLow, Leaf } from 'lucide-react'
import { Row, Segmented, type SegmentedOption } from '@alpine/ui'
import { useBatterySaver } from '../../hooks/useBatterySaver'
import { settingsValueEntry } from '../../settings/registry'
import { useSettingsValue } from '../../hooks/useSettingsValue'
import RegistryPage from './registryPage'

const SAVER_GROUP = 'Battery saver'

const AUTOMATIC = settingsValueEntry('battery-saver-automatic')
const THRESHOLD = settingsValueEntry('battery-saver-threshold')
const DIMMING = settingsValueEntry('battery-saver-dimming')

const AUTOMATIC_GROUP_ENTRIES = ['battery-saver-automatic', 'battery-saver-threshold']

const OVERRIDE_CHOICES: SegmentedOption<BatterySaverOverride>[] = [
  { value: 'auto', label: 'Automatic' },
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off' },
]

export default function BatteryPage() {
  const { state, setOverride } = useBatterySaver()
  const automatic = useSettingsValue(AUTOMATIC).value === true
  const threshold = useSettingsValue(THRESHOLD).value
  const dimming = useSettingsValue(DIMMING).value === true

  const slots: SettingsPageSlot[] = [
    {
      group: SAVER_GROUP,
      order: 0,
      replaces: ['battery-saver'],
      content: (
        <Row
          label="Battery saver right now"
          info="On and Off both hold whatever the charge is, and go back to Automatic the next time you plug in."
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

  const hidden: string[] = []
  if (!state.hasBattery) hidden.push(...AUTOMATIC_GROUP_ENTRIES)
  else if (!automatic) hidden.push('battery-saver-threshold')
  if (!dimming) hidden.push('battery-saver-dim-amount', 'battery-saver-dim-externals')

  return (
    <RegistryPage
      page="battery"
      slots={slots}
      hidden={hidden}
      lead={
        <BatteryStatus
          state={state}
          thresholdPercent={typeof threshold === 'number' ? threshold : 20}
          automaticEnabled={automatic}
        />
      }
    />
  )
}

function statusHeadline(state: BatterySaverState): string {
  if (state.active) return 'Battery saver is on'
  return 'Battery saver is off'
}

function statusDetail(state: BatterySaverState, thresholdPercent: number, automaticEnabled: boolean): string {
  const charge = state.percent == null ? 'Charge unavailable' : `${state.percent}%`
  const source = state.onAcPower ? (state.charging ? 'charging' : 'plugged in') : 'on battery'
  const summary = `${charge}, ${source}`
  if (state.reason === 'manual') return `${summary} · on manually`
  if (state.reason === 'threshold') return `${summary} · automatic, below ${thresholdPercent}%`
  if (state.override === 'off') return `${summary} · off until you plug in`
  if (state.onAcPower) return summary
  if (!automaticEnabled) return `${summary} · automatic off`
  return `${summary} · turns on at ${thresholdPercent}%`
}

function BatteryStatus({ state, thresholdPercent, automaticEnabled }: { state: BatterySaverState; thresholdPercent: number; automaticEnabled: boolean }) {
  const Icon = state.active ? Leaf : state.onAcPower ? BatteryCharging : BatteryLow
  return (
    <div className="flex items-center gap-3 rounded-card bg-surface-2 px-4 py-3">
      <Icon size={18} className={`shrink-0 ${state.active ? 'text-success' : 'text-ink-secondary'}`} />
      <div className="flex flex-col flex-1 min-w-0 gap-0.5">
        <span className="text-dense text-ink-primary">{statusHeadline(state)}</span>
        <span className="text-xs text-ink-quiet">{statusDetail(state, thresholdPercent, automaticEnabled)}</span>
      </div>
    </div>
  )
}
