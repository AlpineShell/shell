import { useEffect, useState } from 'react'
import { useWallpaper } from '../../hooks/useWallpaper'

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

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

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
    <div className="max-w-4xl">
      <div className="flex gap-6 items-stretch">
        <div className="w-72 shrink-0 flex flex-col gap-2">
          <div
            className="w-full aspect-video rounded-lg bg-neutral-900 bg-cover bg-center border border-white/5"
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
              <div key={i} className="w-full h-6 rounded-md bg-neutral-900 border border-white/5 animate-pulse" />
            ))
          )}
        </div>

        <div
          className="pt-1 flex flex-col transition-opacity duration-300 min-w-0 flex-1"
          style={{ opacity: info ? 1 : 0 }}
        >
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight truncate">
              {info?.computerName ?? ''}
            </h1>
            <span className="text-sm text-white/60 truncate">
              {info?.os.name ?? ''}
            </span>
            {info?.os.build && (
              <span className="text-xs text-white/40">
                Version {info.os.version} - Build {info.os.build}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function UsageRow({ label, used, total, color }: { label: string; used: number; total: number; color: string }) {
  const pct = total > 0 ? (used / total) * 100 : 0
  return (
    <div className="relative w-full h-6 rounded-md bg-neutral-900 border border-white/5 overflow-hidden">
      <div
        className="absolute left-0 top-0 bottom-0 transition-all"
        style={{ width: `${pct}%`, backgroundColor: color, opacity: 0.85 }}
      />
      <div className="absolute inset-0 flex items-center justify-between px-2.5 text-[11px] font-medium">
        <span className="text-white/90">{label}</span>
        <span className="text-white/80">
          {formatSize(used)} / {formatSize(total)}
        </span>
      </div>
    </div>
  )
}

function SpecRow({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wider text-white/40">{label}</span>
      <span className="text-sm text-white/90">{value}</span>
      {detail && <span className="text-xs text-white/50">{detail}</span>}
    </div>
  )
}
