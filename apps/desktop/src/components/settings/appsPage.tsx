import { useState } from 'react'
import PageTitle from '../ui/pageTitle'
import Segmented from '../ui/segmented'
import AppsRunningPage from './appsRunningPage'
import AppsInstalledPage from './appsInstalledPage'
import AppsStartupPage from './appsStartupPage'

const TABS: SegmentedOption<AppsTab>[] = [
  { value: 'running', label: 'Running' },
  { value: 'installed', label: 'Installed' },
  { value: 'startup', label: 'Startup' },
]

function resolveTab(value: string | undefined): AppsTab {
  return TABS.some((tab) => tab.value === value) ? (value as AppsTab) : 'running'
}

export default function AppsPage({ initialTab }: { initialTab?: string }) {
  const [tab, setTab] = useState<AppsTab>(() => resolveTab(initialTab))

  return (
    <div className="flex w-full flex-col gap-5">
      <div className="flex items-center justify-between gap-4">
        <PageTitle title="Apps" />
        <Segmented label="Apps view" options={TABS} value={tab} onChange={setTab} />
      </div>

      {tab === 'running' && <AppsRunningPage />}
      {tab === 'installed' && <AppsInstalledPage />}
      {tab === 'startup' && <AppsStartupPage />}
    </div>
  )
}
