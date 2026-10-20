import { Battery, BatteryCharging, BatteryFull, BatteryLow, BatteryMedium, Leaf } from 'lucide-react'
import { Card, Row, Segmented, type SegmentedOption } from '@alpine/ui'
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
          description="On and Off hold until you next plug in, then it goes back to Automatic."
        >
          <Segmented
            variant="filled"
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
  const summary = state.onAcPower ? (state.charging ? 'Charging' : 'Plugged in') : 'On battery'
  if (state.reason === 'manual') return `${summary} · on manually`
  if (state.reason === 'threshold') return `${summary} · automatic, below ${thresholdPercent}%`
  if (state.override === 'off') return `${summary} · off until you plug in`
  if (state.onAcPower) return summary
  if (!automaticEnabled) return `${summary} · automatic off`
  return `${summary} · turns on at ${thresholdPercent}%`
}

const BATTERY_GLYPH = { size: 34, strokeWidth: 1.5, className: 'my-2 shrink-0 text-ink-primary' }

function BatteryGlyph({ state }: { state: BatterySaverState }) {
  if (state.charging || state.onAcPower) return <BatteryCharging {...BATTERY_GLYPH} />
  if (state.percent == null) return <Battery {...BATTERY_GLYPH} />
  if (state.percent >= 80) return <BatteryFull {...BATTERY_GLYPH} />
  if (state.percent >= 40) return <BatteryMedium {...BATTERY_GLYPH} />
  return <BatteryLow {...BATTERY_GLYPH} />
}

function BatteryStatus({ state, thresholdPercent, automaticEnabled }: { state: BatterySaverState; thresholdPercent: number; automaticEnabled: boolean }) {
  return (
    <Card variant="group">
      <div className="flex items-center gap-4">
        <BatteryGlyph state={state} />
        <div className="flex min-w-0 flex-col">
          <span className="text-[28px] leading-8 font-medium tabular-nums text-ink-primary">
            {state.percent == null ? 'No charge reading' : `${state.percent}%`}
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs text-ink-quiet">
            {state.active && <Leaf size={12} className="text-success" />}
            {statusHeadline(state)} · {statusDetail(state, thresholdPercent, automaticEnabled)}
          </span>
        </div>
      </div>
    </Card>
  )
}
