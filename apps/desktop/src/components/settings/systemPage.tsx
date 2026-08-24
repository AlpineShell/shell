import { useEffect, useState } from 'react'
import { BatteryLow, Check, MonitorCog, RotateCcw } from 'lucide-react'
import { NavRow } from './appsShared'

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
      <h1 className="text-2xl font-semibold tracking-tight">System</h1>

      {(status || isDev) && (
        <div className="rounded-lg bg-neutral-900 border border-white/5 px-4 py-4 flex items-center gap-3">
          <MonitorCog size={18} className="text-white/60 shrink-0" />
          <div className="flex flex-col flex-1 min-w-0 gap-0.5">
            <div className="flex items-center gap-2">
              <span className="text-[13px] text-white/90">Default shell</span>
              {isDev && (
                <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400/90">
                  Dev
                </span>
              )}
            </div>
            <span className="text-xs text-white/50">
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
            <button
              disabled
              className="shrink-0 h-8 px-3 rounded-md bg-white/10 text-white/40 text-[12px] font-medium cursor-not-allowed"
            >
              Set as default shell
            </button>
          ) : isShell ? (
            <span className="shrink-0 inline-flex items-center gap-1.5 text-xs text-emerald-400">
              <Check size={14} />
              Active
            </span>
          ) : applied ? (
            <span className="shrink-0 text-xs text-white/50">Pending restart</span>
          ) : (
            <button
              onClick={setAsDefaultShell}
              disabled={applying}
              className="shrink-0 h-8 px-3 rounded-md bg-white hover:bg-neutral-200 text-neutral-950 text-[12px] font-medium transition-colors cursor-pointer disabled:opacity-50"
            >
              {applying ? 'Setting...' : 'Set as default shell'}
            </button>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {ROWS.map((row) => (
          <NavRow key={row.path} icon={row.icon} label={row.label} description={row.description} onClick={() => onNavigate(row.path)} />
        ))}
      </div>
    </div>
  )
}
