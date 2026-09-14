import { Activity, FileType, Package, Power } from 'lucide-react'
import { NavRow, PageTitle } from '@alpine/ui'
import { settingsPage, settingsPageRoute } from '../../settings/registry'

const ROWS: { page: SettingsPageId; icon: typeof Package }[] = [
  { page: 'apps-installed', icon: Package },
  { page: 'apps-startup', icon: Power },
  { page: 'apps-running', icon: Activity },
  { page: 'apps-defaults', icon: FileType },
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
              onClick={() => onNavigate(settingsPageRoute(row.page) ?? '')}
            />
          )
        })}
      </div>
    </div>
  )
}
