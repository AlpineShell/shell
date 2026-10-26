import { useEffect, useState, type ReactNode } from 'react'
import { Bluetooth, Image as ImageIcon, PanelTop, Wifi } from 'lucide-react'
import { Card, NavRow } from '@alpine/ui'
import { useWallpaper } from '../../hooks/useWallpaper'
import { useNetworkStatus } from '../../hooks/useNetwork'
import { useBluetooth } from '../../hooks/useBluetooth'
import { connectedSummary } from '../../lib/bluetoothPresentation'
import { settingsPage, settingsPageRoute } from '../../settings/registry'

const CACHE_KEY = 'alpine.systemInfo.v2'

const TB = 1024 ** 4
const GB = 1024 ** 3

const SIZE_FORMAT = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 })

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

function formatSize(bytes: number): string {
  if (bytes >= TB) return `${SIZE_FORMAT.format(bytes / TB)} TB`
  return `${Math.round(bytes / GB)} GB`
}

function wallpaperName(url: string | null): string | undefined {
  if (!url) return undefined
  try {
    const file = new URL(url).searchParams.get('p')?.split(/[\\/]/).pop()
    return file ? file.replace(/\.[^.]+$/, '') : undefined
  } catch {
    return undefined
  }
}

function networkDetail(status: NetworkStatus): string | undefined {
  if (!status.connected) return undefined
  if (status.type === 'ethernet') return 'Ethernet'
  return status.ssid ?? undefined
}

export default function AboutPage({ onNavigate }: { onNavigate: (path: string) => void }) {
  const wallpaper = useWallpaper()
  const network = useNetworkStatus()
  const bluetooth = useBluetooth().state
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

  const rows: { page: SettingsPageId; icon: ReactNode; detail?: string }[] = [
    { page: 'wallpaper', icon: <ImageIcon size={16} />, detail: wallpaperName(wallpaper) },
    { page: 'wifi', icon: <Wifi size={16} />, detail: networkDetail(network) },
    { page: 'bluetooth', icon: <Bluetooth size={16} />, detail: connectedSummary(bluetooth) },
    { page: 'ridge', icon: <PanelTop size={16} /> },
  ]

  return (
    <div className="flex flex-col gap-section">
      <div className="flex items-stretch gap-6">
        <div
          className="aspect-video w-72 shrink-0 rounded-card border border-line-hairline bg-surface-3 bg-cover bg-center"
          style={wallpaper ? { backgroundImage: `url('${wallpaper}')` } : undefined}
        />

        <div
          className="flex min-w-0 flex-1 flex-col pt-1 transition-opacity duration-300"
          style={{ opacity: info ? 1 : 0 }}
        >
          <h1 className="truncate text-2xl font-medium tracking-tight text-ink-primary">{info?.computerName ?? ''}</h1>
          <span className="truncate text-sm text-ink-secondary">{info?.os.name ?? ''}</span>
          {info?.os.build && (
            <span className="text-xs text-ink-quiet select-text">
              Version {info.os.version} · Build {info.os.build}
            </span>
          )}
          {info && (
            <div className="mt-auto flex flex-col gap-2.5 pt-4">
              {info.disks.map((disk) => (
                <UsageRow key={disk.letter} label={`${disk.letter}:`} used={disk.used} total={disk.total} />
              ))}
              <UsageRow label="Memory" used={info.memory.used} total={info.memory.total} />
            </div>
          )}
        </div>
      </div>

      <Card variant="group">
        {rows.map((row) => (
          <NavRow
            key={row.page}
            variant="flat"
            icon={row.icon}
            label={settingsPage(row.page)?.label ?? ''}
            detail={row.detail}
            onClick={() => onNavigate(settingsPageRoute(row.page) ?? '')}
          />
        ))}
      </Card>
    </div>
  )
}

function UsageRow({ label, used, total }: { label: string; used: number; total: number }) {
  const percent = total > 0 ? Math.round((used / total) * 100) : 0
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between text-xs tabular-nums text-ink-quiet">
        <span className="font-medium text-ink-primary">{label}</span>
        <span>
          {formatSize(used)} of {formatSize(total)}
        </span>
      </div>
      <div
        role="img"
        aria-label={`${label} ${percent}% used`}
        className="h-1.5 overflow-hidden rounded-full bg-fill-track"
      >
        <div className="h-full rounded-full bg-ink-secondary" style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}
