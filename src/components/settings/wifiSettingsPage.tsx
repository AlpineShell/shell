import { useEffect, useState } from 'react'
import { Loader2, Lock, RefreshCw, Wifi, WifiHigh, WifiLow, WifiOff, WifiZero } from 'lucide-react'

function SignalIcon({ signal, color, size }: { signal: number; color: string; size: number }) {
  if (signal >= 70) return <Wifi color={color} size={size} />
  if (signal >= 40) return <WifiHigh color={color} size={size} />
  if (signal >= 10) return <WifiLow color={color} size={size} />
  return <WifiZero color={color} size={size} />
}

export default function WifiSettingsPage() {
  const [enabled, setEnabled] = useState(window.alpineBoot?.wifi?.radio ?? true)
  const [networks, setNetworks] = useState<WifiNetwork[]>([])
  const [scanning, setScanning] = useState(false)
  const [connecting, setConnecting] = useState<string | null>(null)
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
    await new Promise((r) => setTimeout(r, 1500))
    setPasswordFor(null)
    setPassword('')
    setConnecting(null)
    scan()
  }

  async function handleDisconnect() {
    await window.shell.network.wifiDisconnect()
    await new Promise((r) => setTimeout(r, 1000))
    scan()
  }

  return (
    <div className="w-full flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Wi-Fi</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={scan}
            disabled={scanning || !enabled}
            className="w-8 h-8 flex items-center justify-center rounded-md bg-white/5 hover:bg-white/10 text-white/80 cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Rescan"
          >
            <RefreshCw size={13} className={scanning ? 'animate-spin' : ''} />
          </button>
          <Toggle checked={enabled} onChange={toggleRadio} />
        </div>
      </div>

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
              error={error === n.ssid}
              passwordOpen={passwordFor === n.ssid}
              password={password}
              onClick={() => {
                if (connecting) return
                if (n.connected) handleDisconnect()
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
  error,
  passwordOpen,
  password,
  onClick,
  onPasswordChange,
  onPasswordSubmit,
}: {
  network: WifiNetwork
  connecting: boolean
  error: boolean
  passwordOpen: boolean
  password: string
  onClick: () => void
  onPasswordChange: (v: string) => void
  onPasswordSubmit: () => void
}) {
  const iconColor = network.connected ? 'white' : 'rgba(255,255,255,0.5)'
  return (
    <div className="border-b border-white/5 last:border-b-0">
      <button
        onClick={onClick}
        className="w-full flex items-center justify-between gap-4 py-3 px-1 cursor-pointer hover:bg-white/3 transition-colors text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <SignalIcon signal={network.signal} color={iconColor} size={16} />
          <div className="flex flex-col min-w-0">
            <span className={`text-sm truncate ${network.connected ? 'text-white' : 'text-white/90'}`}>{network.ssid}</span>
            {network.connected && <span className="text-xs text-white/50">Connected</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {connecting && <Loader2 size={13} className="text-white/60 animate-spin" />}
          {network.security !== 'Open' && <Lock size={13} className="text-white/50" />}
        </div>
      </button>
      {passwordOpen && (
        <div className="flex gap-2 items-center pl-7 pb-3 pr-1">
          <input
            type="password"
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onPasswordSubmit()
            }}
            placeholder="Password"
            autoFocus
            className={`flex-1 max-w-xs h-8 text-[13px] px-2.5 rounded-md outline-none bg-white/5 text-white placeholder:text-white/30 ${
              error ? 'ring-1 ring-red-400' : ''
            }`}
          />
          <button
            onClick={onPasswordSubmit}
            className="h-8 px-3 rounded-md text-[12px] bg-white text-neutral-950 hover:bg-neutral-200 cursor-pointer transition-colors"
          >
            Connect
          </button>
        </div>
      )}
    </div>
  )
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-white/40">
      {icon}
      <span className="text-sm">{text}</span>
    </div>
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative shrink-0 cursor-pointer rounded-full transition-colors ${checked ? 'bg-white' : 'bg-white/15'}`}
      style={{ width: 36, height: 20 }}
    >
      <span
        className="absolute top-0.5 rounded-full transition-all"
        style={{
          width: 16,
          height: 16,
          left: checked ? 18 : 2,
          backgroundColor: checked ? 'rgb(20,20,20)' : 'rgba(255,255,255,0.7)',
        }}
      />
    </button>
  )
}
