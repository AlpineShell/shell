import { Activity, FileType, Package, Power } from 'lucide-react'
import { settingsPage, settingsPageRoute } from '../../settings/registry'
import PageTitle from '../ui/pageTitle'
import NavRow from '../ui/navRow'

const ROWS: { page: SettingsPageId; description: string; icon: typeof Package }[] = [
  { page: 'apps-installed', description: 'All your apps. Turn off auto-start, open, or uninstall.', icon: Package },
  { page: 'apps-startup', description: 'Choose what opens automatically when you start your PC.', icon: Power },
  { page: 'apps-running', description: 'See what’s open and using your computer right now.', icon: Activity },
  { page: 'apps-defaults', description: 'File types your plugins can open, and which app Windows uses.', icon: FileType },
]

export default function AppsHub({ onNavigate }: { onNavigate: (path: string) => void }) {
  return (
    <div className="w-full flex flex-col gap-4">
      <PageTitle title={settingsPage('apps')?.label ?? ''} />
      <div className="flex flex-col gap-2">
        {ROWS.map((row) => {
          const Icon = row.icon
          return (
            <NavRow
              key={row.page}
              icon={<Icon size={18} />}
              label={settingsPage(row.page)?.label ?? ''}
              description={row.description}
              onClick={() => onNavigate(settingsPageRoute(row.page) ?? '')}
            />
          )
        })}
      </div>
    </div>
  )
}
