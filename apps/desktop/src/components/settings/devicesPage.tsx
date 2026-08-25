import { useState } from 'react'
import PageTitle from '../ui/pageTitle'
import Segmented from '../ui/segmented'
import WifiSettingsPage from './wifiSettingsPage'
import BluetoothSettingsPage from './bluetoothSettingsPage'
import SoundPage from './soundPage'
import BatteryPage from './batteryPage'

const TABS: SegmentedOption<DevicesTab>[] = [
  { value: 'wifi', label: 'Wi-Fi' },
  { value: 'bluetooth', label: 'Bluetooth' },
  { value: 'sound', label: 'Sound' },
  { value: 'battery', label: 'Battery' },
]

function resolveTab(value: string | undefined): DevicesTab {
  return TABS.some((tab) => tab.value === value) ? (value as DevicesTab) : 'wifi'
}

export default function DevicesPage({ initialTab }: { initialTab?: string }) {
  const [tab, setTab] = useState<DevicesTab>(() => resolveTab(initialTab))

  return (
    <div className="flex w-full flex-col gap-5">
      <div className="flex items-center justify-between gap-4">
        <PageTitle title="Devices" />
        <Segmented label="Devices view" options={TABS} value={tab} onChange={setTab} />
      </div>

      {tab === 'wifi' && <WifiSettingsPage />}
      {tab === 'bluetooth' && <BluetoothSettingsPage />}
      {tab === 'sound' && <SoundPage />}
      {tab === 'battery' && <BatteryPage />}
    </div>
  )
}
