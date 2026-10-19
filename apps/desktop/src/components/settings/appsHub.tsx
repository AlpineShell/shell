import { Activity, FileType, Package, Power } from 'lucide-react'
import { Card, NavRow, PageTitle } from '@alpine/ui'
import { settingsPage, settingsPageRoute } from '../../settings/registry'

const ROWS: { page: SettingsPageId; icon: typeof Package }[] = [
  { page: 'apps-installed', icon: Package },
  { page: 'apps-startup', icon: Power },
  { page: 'apps-running', icon: Activity },
  { page: 'apps-defaults', icon: FileType },
]

export default function AppsHub({ onNavigate }: { onNavigate: (path: string) => void }) {
  return (
    <div className="w-full flex flex-col gap-section">
      <PageTitle variant="plain" title={settingsPage('apps')?.label ?? ''} />
      <Card variant="group">
        {ROWS.map((row) => {
          const Icon = row.icon
          return (
            <NavRow
              key={row.page}
              variant="flat"
              icon={<Icon size={16} />}
              label={settingsPage(row.page)?.label ?? ''}
              onClick={() => onNavigate(settingsPageRoute(row.page) ?? '')}
            />
          )
        })}
      </Card>
    </div>
  )
}
