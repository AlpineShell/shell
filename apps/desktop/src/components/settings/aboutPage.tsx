import { useEffect, useState } from 'react'
import { Check, LogOut, MonitorCog, Power, RotateCcw } from 'lucide-react'
import { useWallpaper } from '../../hooks/useWallpaper'
import Section from '../ui/section'
import Button from '../ui/button'
import AboutRevertSection from './aboutRevertSection'

const CACHE_KEY = 'alpine.systemInfo.v2'

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
  } catch {}
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

export default function AboutPage() {
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
    <div className="flex w-full flex-col gap-section">
      <div className="flex max-w-4xl items-stretch gap-6">
        <div className="flex w-72 shrink-0 flex-col gap-2">
          <div
            className="aspect-video w-full rounded-field border border-line-hairline bg-surface-3 bg-cover bg-center"
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
              <UsageRow label="RAM" used={info.memory.used} total={info.memory.total} color={RAM_COLOR} />
            </>
          ) : (
            [0, 1, 2].map((i) => (
              <div key={i} className="h-6 w-full animate-pulse rounded-md border border-line-hairline bg-surface-3" />
            ))
          )}
        </div>

        <div
          className="flex min-w-0 flex-1 flex-col pt-1 transition-opacity duration-300"
          style={{ opacity: info ? 1 : 0 }}
        >
          <div className="flex flex-col gap-1">
            <h1 className="truncate font-display text-2xl font-normal tracking-tight text-ink-primary">
              {info?.computerName ?? ''}
            </h1>
            <span className="truncate text-sm text-ink-secondary">{info?.os.name ?? ''}</span>
            {info?.os.build && (
              <span className="text-xs text-ink-quiet">
                Version {info.os.version} - Build {info.os.build}
              </span>
            )}
          </div>
        </div>
      </div>

      <DefaultShellSection />

      <Section title="Power">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => window.shell.system.powerAction('logout')} className="font-medium">
            <LogOut size={14} />
            Log out
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.shell.system.powerAction('restart')} className="font-medium">
            <RotateCcw size={14} />
            Restart
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.shell.system.powerAction('shutdown')} className="font-medium">
            <Power size={14} />
            Shut down
          </Button>
        </div>
      </Section>

      <AboutRevertSection />
    </div>
  )
}

function DefaultShellSection() {
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
    <Section title="Setup">
      <div className="flex items-center gap-3 rounded-card border border-line-hairline bg-surface-2 px-4 py-4">
        <MonitorCog size={18} className="shrink-0 text-ink-secondary" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className="text-dense text-ink-primary">Default shell</span>
            {isDev && (
              <span className="rounded bg-warning/15 px-1.5 py-0.5 text-eyebrow uppercase text-warning">Dev</span>
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
          <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-success">
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
    </Section>
  )
}

function UsageRow({ label, used, total, color }: { label: string; used: number; total: number; color: string }) {
  const pct = total > 0 ? (used / total) * 100 : 0
  return (
    <div className="relative h-6 w-full overflow-hidden rounded-md border border-line-hairline bg-surface-3">
      <div
        className="absolute top-0 bottom-0 left-0 transition-all"
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
