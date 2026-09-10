import { useEffect, useState, type ReactNode } from 'react'
import { Bluetooth, Check, Image as ImageIcon, MonitorCog, RotateCcw, Wifi } from 'lucide-react'
import { useWallpaper } from '../../hooks/useWallpaper'
import { settingsPage, settingsPageRoute } from '../../settings/registry'
import NavRow from '../ui/navRow'
import Button from '../ui/button'

const CACHE_KEY = 'alpine.systemInfo.v2'

const HOME_ROWS: { page: SettingsPageId; icon: ReactNode; description: string }[] = [
  { page: 'wallpaper', icon: <ImageIcon size={18} />, description: 'Change background image' },
  { page: 'wifi', icon: <Wifi size={18} />, description: 'Connect to networks' },
  { page: 'bluetooth', icon: <Bluetooth size={18} />, description: 'Pair and manage Bluetooth devices' },
  { page: 'revert', icon: <RotateCcw size={18} />, description: 'Switch back to Windows Explorer temporarily or for good, or remove Alpine Shell' },
]

function readCache(): SystemInfo | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.cpu || !parsed?.gpu || !parsed?.memory || typeof parsed?.uptime !== 'number') return null
    return parsed as SystemInfo
  } catch {
    return null
  }
}

function writeCache(info: SystemInfo) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(info))
  } catch {
    return
  }
}

const TB = 1024 ** 4
const GB = 1024 ** 3

function formatSize(bytes: number): string {
  if (bytes >= TB) {
    const tb = bytes / TB
    return `${tb >= 10 ? tb.toFixed(0) : tb.toFixed(2).replace('.', ',')}TB`
  }
  const gb = bytes / GB
  return `${Math.round(gb)}GB`
}

const DISK_COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#a855f7', '#ec4899']
const RAM_COLOR = '#8b5cf6'

export default function AboutPage({ onNavigate }: { onNavigate: (path: string) => void }) {
  const wallpaper = useWallpaper()
  const [info, setInfo] = useState<SystemInfo | null>(() => readCache())

  useEffect(() => {
    window.shell.system.info().then((fresh) => {
      setInfo((prev) => {
        const prevJson = prev ? JSON.stringify(prev) : ''
        const freshJson = JSON.stringify(fresh)
        if (prevJson === freshJson) return prev
        writeCache(fresh)
        return fresh
      })
    })
  }, [])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-6 items-stretch max-w-4xl">
        <div className="w-72 shrink-0 flex flex-col gap-2">
          <div
            className="w-full aspect-video rounded-field bg-surface-3 bg-cover bg-center border border-line-hairline"
            style={wallpaper ? { backgroundImage: `url('${wallpaper}')` } : undefined}
          />

          {info ? (
            <>
              {info.disks.map((d, i) => (
                <UsageRow
                  key={d.letter}
                  label={`${d.letter}:`}
                  used={d.used}
                  total={d.total}
                  color={DISK_COLORS[i % DISK_COLORS.length]}
                />
              ))}
              <UsageRow
                label="RAM"
                used={info.memory.used}
                total={info.memory.total}
                color={RAM_COLOR}
              />
            </>
          ) : (
            [0, 1, 2].map((i) => (
              <div key={i} className="w-full h-6 rounded-md bg-surface-3 border border-line-hairline animate-pulse" />
            ))
          )}
        </div>

        <div
          className="pt-1 flex flex-col transition-opacity duration-300 min-w-0 flex-1"
          style={{ opacity: info ? 1 : 0 }}
        >
          <div className="flex flex-col gap-1">
            <h1 className="font-display text-2xl font-normal tracking-tight text-ink-primary truncate">
              {info?.computerName ?? ''}
            </h1>
            <span className="text-sm text-ink-secondary truncate">
              {info?.os.name ?? ''}
            </span>
            {info?.os.build && (
              <span className="text-xs text-ink-quiet">
                Version {info.os.version} - Build {info.os.build}
              </span>
            )}
          </div>
        </div>
      </div>

      <DefaultShellCard />

      <div className="flex flex-col gap-2">
        {HOME_ROWS.map((row) => (
          <NavRow
            key={row.page}
            icon={row.icon}
            label={settingsPage(row.page)?.label ?? ''}
            description={row.description}
            onClick={() => onNavigate(settingsPageRoute(row.page) ?? '')}
          />
        ))}
      </div>
    </div>
  )
}

function DefaultShellCard() {
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

  if (!status && !isDev) return null

  return (
    <div className="rounded-card bg-surface-2 border border-line-hairline px-4 py-4 flex items-center gap-3 max-w-4xl">
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
  )
}

function UsageRow({ label, used, total, color }: { label: string; used: number; total: number; color: string }) {
  const pct = total > 0 ? (used / total) * 100 : 0
  return (
    <div className="relative w-full h-6 rounded-md bg-surface-3 border border-line-hairline overflow-hidden">
      <div
        className="absolute left-0 top-0 bottom-0 transition-all"
        style={{ width: `${pct}%`, backgroundColor: color, opacity: 0.85 }}
      />
      <div className="absolute inset-0 flex items-center justify-between px-2.5 text-[11px] font-medium text-ink-primary">
        <span>{label}</span>
        <span>
          {formatSize(used)} / {formatSize(total)}
        </span>
      </div>
    </div>
  )
}
