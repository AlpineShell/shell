import { Activity, FileType, Package, Power } from 'lucide-react'
import { Card, NavRow, PageTitle } from '@alpine/ui'
import { settingsPage, settingsPageRoute } from '../../settings/registry'
import { useInstalledApps } from '../../hooks/useInstalledApps'
import { useStartupApps } from '../../hooks/useStartupApps'
import { useRunningApps } from '../../hooks/useRunningApps'
import { installedAppCount, runningAppCount, startupAppsOnCount } from './appsShared'

const ROWS: { page: SettingsPageId; icon: typeof Package }[] = [
  { page: 'apps-installed', icon: Package },
  { page: 'apps-startup', icon: Power },
  { page: 'apps-running', icon: Activity },
  { page: 'apps-defaults', icon: FileType },
]

function countDetail(count: number, loaded: boolean, suffix = ''): string | undefined {
  return loaded ? `${count}${suffix}` : undefined
}

export default function AppsHub({ onNavigate }: { onNavigate: (path: string) => void }) {
  const installed = useInstalledApps()
  const startup = useStartupApps()
  const running = useRunningApps()

  const details: Partial<Record<SettingsPageId, string>> = {
    'apps-installed': countDetail(installedAppCount(installed), installed.length > 0),
    'apps-startup': countDetail(startupAppsOnCount(startup), startup.length > 0, ' on'),
    'apps-running': countDetail(runningAppCount(running), running.length > 0),
  }

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
              detail={details[row.page]}
              onClick={() => onNavigate(settingsPageRoute(row.page) ?? '')}
            />
          )
        })}
      </Card>
    </div>
  )
}
