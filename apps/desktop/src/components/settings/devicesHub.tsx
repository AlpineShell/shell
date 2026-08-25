import { Bluetooth, Wifi } from 'lucide-react'
import PageTitle from '../ui/pageTitle'
import NavRow from '../ui/navRow'

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
      <PageTitle title="Devices & Connections" />

      <div className="flex flex-col gap-2">
        {ROWS.map((row) => {
          const Icon = row.icon
          return (
            <NavRow
              key={row.path}
              icon={<Icon size={18} />}
              label={row.label}
              description={row.description}
              onClick={() => onNavigate(row.path)}
            />
          )
        })}
      </div>
    </div>
  )
}
