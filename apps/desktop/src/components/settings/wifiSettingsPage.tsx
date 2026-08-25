import { useEffect, useRef, useState } from 'react'
import { Loader2, Lock, RefreshCw, Wifi, WifiHigh, WifiLow, WifiOff, WifiZero } from 'lucide-react'
import Row from '../ui/row'
import Toggle from '../ui/toggle'
import IconButton from '../ui/iconButton'

function SignalIcon({ signal, className, size }: { signal: number; className: string; size: number }) {
  if (signal >= 70) return <Wifi className={className} size={size} />
  if (signal >= 40) return <WifiHigh className={className} size={size} />
  if (signal >= 10) return <WifiLow className={className} size={size} />
  return <WifiZero className={className} size={size} />
}

export default function WifiSettingsPage() {
  const [enabled, setEnabled] = useState(window.alpineBoot?.wifi()?.radio ?? true)
  const [networks, setNetworks] = useState<WifiNetwork[]>([])
  const [scanning, setScanning] = useState(true)
  const [connecting, setConnecting] = useState<string | null>(null)
  const [disconnecting, setDisconnecting] = useState<string | null>(null)
  const [passwordFor, setPasswordFor] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.shell.network.wifiNetworks().then((cached) => {
      if (cached.length > 0) setNetworks(cached)
    })
    window.shell.network.wifiRadioGet().then((r) => {
      if (r.success) setEnabled(r.state === 'on')
    })
    window.shell.network.onWifiScanUpdated(setNetworks)
    scan()
  }, [])

  function scan() {
    setScanning(true)
    window.shell.network.wifiScan().then((list) => {
      if (list) setNetworks(list)
      setScanning(false)
    })
  }

  async function toggleRadio(value: boolean) {
    setEnabled(value)
    if (!value) setNetworks([])
    const result = await window.shell.network.wifiRadioSet(value)
    if (result.success && value) {
      setTimeout(() => scan(), 1500)
    }
  }

  async function handleConnect(ssid: string, pwd?: string) {
    setConnecting(ssid)
    setError(null)
    const result = await window.shell.network.wifiConnect(ssid, pwd)
    if (result.needsPassword && !pwd) {
      setConnecting(null)
      setPasswordFor(ssid)
      setPassword('')
      return
    }
    if (!result.success) {
      setConnecting(null)
      setError(ssid)
      return
    }
    setPasswordFor(null)
    setPassword('')
    await new Promise((r) => setTimeout(r, 1500))
    setConnecting(null)
    scan()
  }

  async function handleDisconnect(ssid: string) {
    setDisconnecting(ssid)
    await window.shell.network.wifiDisconnect()
    await new Promise((r) => setTimeout(r, 1000))
    const list = await window.shell.network.wifiScan()
    if (list) setNetworks(list)
    setDisconnecting(null)
  }

  return (
    <div className="w-full flex flex-col gap-5">
      <Row label="Wi-Fi">
        <div className="flex items-center gap-2">
          <IconButton onClick={scan} disabled={scanning || !enabled} label="Rescan">
            <RefreshCw size={15} className={scanning ? 'animate-spin' : ''} />
          </IconButton>
          <Toggle label="Wi-Fi" checked={enabled} onChange={toggleRadio} />
        </div>
      </Row>

      {!enabled ? (
        <EmptyState icon={<WifiOff size={20} />} text="Wi-Fi off" />
      ) : scanning && networks.length === 0 ? (
        <EmptyState icon={<Loader2 size={20} className="animate-spin" />} text="Scanning..." />
      ) : networks.length === 0 ? (
        <EmptyState icon={<WifiOff size={20} />} text="No networks found" />
      ) : (
        <div className="flex flex-col">
          {networks.map((n) => (
            <NetworkRow
              key={n.ssid}
              network={n}
              connecting={connecting === n.ssid}
              disconnecting={disconnecting === n.ssid}
              error={error === n.ssid}
              passwordOpen={passwordFor === n.ssid}
              password={password}
              onClick={() => {
                if (connecting || disconnecting) return
                if (n.connected) handleDisconnect(n.ssid)
                else if (passwordFor === n.ssid) {
                  setPasswordFor(null)
                  setPassword('')
                } else handleConnect(n.ssid)
              }}
              onPasswordChange={(v) => {
                setPassword(v)
                setError(null)
              }}
              onPasswordSubmit={() => password.trim() && handleConnect(n.ssid, password)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function NetworkRow({
  network,
  connecting,
  disconnecting,
  error,
  passwordOpen,
  password,
  onClick,
  onPasswordChange,
  onPasswordSubmit,
}: {
  network: WifiNetwork
  connecting: boolean
  disconnecting: boolean
  error: boolean
  passwordOpen: boolean
  password: string
  onClick: () => void
  onPasswordChange: (v: string) => void
  onPasswordSubmit: () => void
}) {
  const iconClass = network.connected ? 'text-ink-primary shrink-0' : 'text-ink-quiet shrink-0'
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (passwordOpen) requestAnimationFrame(() => inputRef.current?.focus())
  }, [passwordOpen])

  return (
    <div className="relative after:content-[''] after:absolute after:bottom-0 after:left-2 after:right-2 after:h-px after:bg-line-hairline last:after:hidden hover:after:hidden [&:has(+*:hover)]:after:hidden">
      <button
        onClick={onClick}
        className="focus-ring w-full flex items-center justify-between gap-4 py-3 px-2 rounded-field cursor-pointer hover:bg-fill-ghost transition-colors text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <SignalIcon signal={network.signal} className={iconClass} size={16} />
          <div className="flex flex-col min-w-0">
            <span className={`text-sm truncate text-ink-primary ${network.connected ? 'font-medium' : ''}`}>{network.ssid}</span>
            {(network.connected || disconnecting) && (
              <span className="text-xs text-ink-quiet">{disconnecting ? 'Disconnecting…' : 'Connected'}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {(connecting || disconnecting) && <Loader2 size={13} className="text-ink-secondary animate-spin" />}
          {network.security !== 'Open' && <Lock size={13} className="text-ink-quiet" />}
        </div>
      </button>
      <div
        className="grid transition-[grid-template-rows,opacity] duration-200 ease-out"
        style={{ gridTemplateRows: passwordOpen ? '1fr' : '0fr', opacity: passwordOpen ? 1 : 0 }}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="flex gap-2 items-center pl-7 pr-1 pb-3 pt-1">
            <input
              ref={inputRef}
              type="password"
              value={password}
              tabIndex={passwordOpen ? 0 : -1}
              onChange={(e) => onPasswordChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onPasswordSubmit()
              }}
              placeholder="Password"
              className={`focus-ring flex-1 max-w-xs h-8 text-dense px-2.5 rounded-field outline-none border border-line-hairline bg-surface-2 text-ink-primary placeholder:text-ink-faint ${
                error ? 'border-danger' : ''
              }`}
            />
            <button
              onClick={onPasswordSubmit}
              tabIndex={passwordOpen ? 0 : -1}
              className="focus-ring h-8 px-3 rounded-full text-[12px] bg-fill-solid text-on-solid hover:bg-fill-solid-hover cursor-pointer transition-colors"
            >
              Connect
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-ink-faint">
      {icon}
      <span className="text-sm">{text}</span>
    </div>
  )
}
