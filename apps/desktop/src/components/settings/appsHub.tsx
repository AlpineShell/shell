import { Activity, Package, Power } from 'lucide-react'
import { NavRow } from './appsShared'

const ROWS = [
  { path: 'apps/running', label: 'Running', description: 'See what’s open and using your computer right now.', icon: Activity },
  { path: 'apps/installed', label: 'Installed', description: 'All your apps. Turn off auto-start, open, or uninstall.', icon: Package },
  { path: 'apps/startup', label: 'Startup', description: 'Choose what opens automatically when you start your PC.', icon: Power },
]

export default function AppsHub({ onNavigate }: { onNavigate: (path: string) => void }) {
  return (
    <div className="w-full flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Apps</h1>
      <div className="flex flex-col gap-2">
        {ROWS.map((row) => (
          <NavRow key={row.path} icon={row.icon} label={row.label} description={row.description} onClick={() => onNavigate(row.path)} />
        ))}
      </div>
    </div>
  )
}
