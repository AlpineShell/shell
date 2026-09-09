import { Activity, FileType, Package, Power } from 'lucide-react'
import PageTitle from '../ui/pageTitle'
import NavRow from '../ui/navRow'

const ROWS = [
  { path: 'apps/installed', label: 'Installed', description: 'All your apps. Turn off auto-start, open, or uninstall.', icon: Package },
  { path: 'apps/startup', label: 'Startup', description: 'Choose what opens automatically when you start your PC.', icon: Power },
  { path: 'apps/running', label: 'Running', description: 'See what’s open and using your computer right now.', icon: Activity },
  { path: 'apps/defaults', label: 'Default apps', description: 'File types your plugins can open, and which app Windows uses.', icon: FileType },
]

export default function AppsHub({ onNavigate }: { onNavigate: (path: string) => void }) {
  return (
    <div className="w-full flex flex-col gap-4">
      <PageTitle title="Apps" />
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
