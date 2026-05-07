import { useEffect, useState } from 'react'
import { useWallpaper } from '../../hooks/useWallpaper'

const CACHE_KEY = 'alpine.systemInfo'

function readCache(): SystemInfo | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? (JSON.parse(raw) as SystemInfo) : null
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
    <div className="max-w-3xl">
      <div className="flex gap-6 items-start">
        <div className="w-72 shrink-0 flex flex-col gap-2">
          <div
            className="w-full aspect-video rounded-lg bg-neutral-900 bg-cover bg-center border border-white/5"
            style={wallpaper ? { backgroundImage: `url('${wallpaper}')` } : undefined}
          />

          {info
            ? info.disks.map((d, i) => (
                <DiskRow key={d.letter} disk={d} color={DISK_COLORS[i % DISK_COLORS.length]} />
              ))
            : [0, 1].map((i) => (
                <div key={i} className="w-full h-6 rounded-md bg-neutral-900 border border-white/5 animate-pulse" />
              ))}
        </div>

        <div
          className="pt-1 flex flex-col gap-1 transition-opacity duration-300"
          style={{ opacity: info ? 1 : 0 }}
        >
          <h1 className="text-2xl font-semibold tracking-tight">
            {info?.computerName ?? ' '}
          </h1>
          <span className="text-sm text-white/60">
            {info?.os.name ?? ' '}
          </span>
          {info?.os.build && (
            <span className="text-xs text-white/40 mt-2">
              Version {info.os.version} · Build {info.os.build}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function DiskRow({ disk, color }: { disk: DiskInfo; color: string }) {
  const pct = disk.total > 0 ? (disk.used / disk.total) * 100 : 0
  return (
    <div className="relative w-full h-6 rounded-md bg-neutral-900 border border-white/5 overflow-hidden">
      <div
        className="absolute left-0 top-0 bottom-0 transition-all"
        style={{ width: `${pct}%`, backgroundColor: color, opacity: 0.85 }}
      />
      <div className="absolute inset-0 flex items-center justify-between px-2.5 text-[11px] font-medium">
        <span className="text-white/90">{disk.letter}:</span>
        <span className="text-white/80">
          {formatSize(disk.used)} / {formatSize(disk.total)}
        </span>
      </div>
    </div>
  )
}
