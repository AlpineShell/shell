import { Bluetooth, Wifi } from 'lucide-react'
import { NavRow } from './appsShared'

interface DevicesHubProps {
  onNavigate: (path: string) => void
}

const ROWS = [
  { path: 'devices/bluetooth', label: 'Bluetooth', description: 'Pair and manage Bluetooth devices', icon: Bluetooth },
  { path: 'devices/wifi', label: 'Wi-Fi', description: 'Connect to networks', icon: Wifi },
]

export default function DevicesHub({ onNavigate }: DevicesHubProps) {
  return (
    <div className="w-full flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Devices & Connections</h1>

      <div className="flex flex-col gap-2">
        {ROWS.map((row) => (
          <NavRow key={row.path} icon={row.icon} label={row.label} description={row.description} onClick={() => onNavigate(row.path)} />
        ))}
      </div>
    </div>
  )
}
