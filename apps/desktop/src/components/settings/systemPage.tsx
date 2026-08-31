import { useEffect, useState } from 'react'
import { BatteryLow, Check, Gauge, MonitorCog, RotateCcw } from 'lucide-react'
import PageTitle from '../ui/pageTitle'
import NavRow from '../ui/navRow'
import Button from '../ui/button'

interface SystemPageProps {
  onNavigate: (path: string) => void
}

const ROWS = [
  {
    path: 'system/battery',
    label: 'Battery',
    description: 'Battery saver, when it turns on and what it changes',
    icon: BatteryLow,
  },
  {
    path: 'system/performance',
    label: 'Performance probe',
    description: 'Foreground switch latency, hard fault rate and memory headroom',
    icon: Gauge,
  },
  {
    path: 'system/revert',
    label: 'Revert back to Windows',
    description: 'Switch back to Windows Explorer temporarily or for good, or remove Alpine Shell',
    icon: RotateCcw,
  },
]

export default function SystemPage({ onNavigate }: SystemPageProps) {
  const [status, setStatus] = useState<SetupStatus | null>(null)
  const [applying, setApplying] = useState(false)
  const [applied, setApplied] = useState(false)

  useEffect(() => {
    window.setup.status().then(setStatus)
  }, [])

  async function setAsDefaultShell() {
    setApplying(true)
    await window.setup.setShell()
    const next = await window.setup.status()
    setStatus(next)
    setApplying(false)
    setApplied(true)
  }

  const isDev = import.meta.env.DEV
  const isShell = status?.isShell ?? false

  return (
    <div className="w-full flex flex-col gap-4">
      <PageTitle title="System" />

      {(status || isDev) && (
        <div className="rounded-card bg-surface-2 border border-line-hairline px-4 py-4 flex items-center gap-3">
          <MonitorCog size={18} className="text-ink-secondary shrink-0" />
          <div className="flex flex-col flex-1 min-w-0 gap-0.5">
            <div className="flex items-center gap-2">
              <span className="text-dense text-ink-primary">Default shell</span>
              {isDev && (
                <span className="text-eyebrow uppercase px-1.5 py-0.5 rounded bg-warning/15 text-warning">
                  Dev
                </span>
              )}
            </div>
            <span className="text-xs text-ink-quiet">
              {isDev
                ? 'Unavailable in development — run an installed build to set the shell.'
                : isShell
                  ? 'Alpine Shell is set as your Windows shell.'
                  : applied
                    ? 'Set as default shell. Sign out or restart to apply.'
                    : 'Alpine Shell is not your default shell yet.'}
            </span>
          </div>
          {isDev ? (
            <Button variant="outline" size="sm" onClick={() => {}} disabled className="shrink-0 font-medium">
              Set as default shell
            </Button>
          ) : isShell ? (
            <span className="shrink-0 inline-flex items-center gap-1.5 text-xs text-success">
              <Check size={14} />
              Active
            </span>
          ) : applied ? (
            <span className="shrink-0 text-xs text-ink-quiet">Pending restart</span>
          ) : (
            <Button size="sm" onClick={setAsDefaultShell} disabled={applying} className="shrink-0 font-medium">
              {applying ? 'Setting...' : 'Set as default shell'}
            </Button>
          )}
        </div>
      )}

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
