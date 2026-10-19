import { useEffect, useRef, useState } from 'react'
import { EthernetPort, Lock, RefreshCw, Wifi, WifiHigh, WifiLow, WifiZero } from 'lucide-react'
import { Button, EmptyState, IconButton, ListRow, PageHeader, Spinner, TextField, Toggle } from '@alpine/ui'
import { useNetworkStatus } from '../../hooks/useNetwork'
import PageSpinner from './pageSpinner'

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
  const networkStatus = useNetworkStatus()

  useEffect(() => {
    window.shell.network.wifiNetworks().then((cached) => {
      if (cached.length > 0) setNetworks(cached)
    })
    window.shell.network.wifiRadioGet().then((r) => {
      if (r.success) setEnabled(r.state === 'on')
    })
    const unsubscribe = window.shell.network.onWifiScanUpdated(setNetworks)
    scan()
    return unsubscribe
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

  const onEthernet = networkStatus.connected && networkStatus.type === 'ethernet'

  return (
    <div className="flex w-full flex-col gap-5">
      <PageHeader variant="plain" title="Wi-Fi">
        <IconButton onClick={scan} disabled={scanning || !enabled} label="Rescan">
          <RefreshCw size={15} className={scanning ? 'animate-spin' : ''} />
        </IconButton>
        <Toggle label="Wi-Fi" checked={enabled} onChange={toggleRadio} />
      </PageHeader>

      {onEthernet && <ListRow icon={<EthernetPort size={20} className="text-ink-primary" />} title="Ethernet" detail="Connected" />}

      {!enabled ? null : scanning && networks.length === 0 ? (
        <PageSpinner label="Scanning for networks" />
      ) : networks.length === 0 ? (
        onEthernet ? null : <EmptyState variant="plain" title="No networks found" />
      ) : (
        <div className="flex flex-col gap-1">
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
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (passwordOpen) requestAnimationFrame(() => inputRef.current?.focus())
  }, [passwordOpen])

  return (
    <ListRow
      icon={
        <SignalIcon
          signal={network.signal}
          size={16}
          className={network.connected ? 'text-ink-primary' : 'text-ink-quiet'}
        />
      }
      title={network.ssid}
      detail={network.connected || disconnecting ? (disconnecting ? 'Disconnecting…' : 'Connected') : undefined}
      onActivate={onClick}
      activateLabel={network.connected ? `Disconnect from ${network.ssid}` : `Connect to ${network.ssid}`}
      actions={
        <>
          {(connecting || disconnecting) && <Spinner size={13} />}
          {network.security !== 'Open' && <Lock size={13} className="shrink-0 text-ink-quiet" />}
        </>
      }
    >
      <div
        className="grid transition-all duration-200 ease-out"
        style={{ gridTemplateRows: passwordOpen ? '1fr' : '0fr', opacity: passwordOpen ? 1 : 0 }}
      >
        <div className="min-h-0 overflow-hidden" inert={!passwordOpen}>
          <div className="flex items-center gap-2 border-t border-line-hairline bg-surface-0 px-3 py-3">
            <TextField
              ref={inputRef}
              type="password"
              label={`Password for ${network.ssid}`}
              placeholder="Password"
              value={password}
              invalid={error}
              onChange={onPasswordChange}
              onSubmit={onPasswordSubmit}
              className="max-w-xs flex-1"
            />
            <Button onClick={onPasswordSubmit}>
              Connect
            </Button>
          </div>
        </div>
      </div>
    </ListRow>
  )
}
