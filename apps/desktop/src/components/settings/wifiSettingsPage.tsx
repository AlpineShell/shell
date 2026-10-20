import { useEffect, useRef, useState } from 'react'
import { EthernetPort, Lock, RefreshCw, Wifi, WifiHigh, WifiLow, WifiZero } from 'lucide-react'
import { Button, Card, EmptyState, ListRow, PageHeader, Row, Section, Spinner, TextField, Toggle } from '@alpine/ui'
import { useNetworkStatus } from '../../hooks/useNetwork'
import { useNetworkDetails } from '../../hooks/useNetworkDetails'
import { settingsPage } from '../../settings/registry'
import NetworkMap from './networkMap'
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
  const [openSsid, setOpenSsid] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const networkStatus = useNetworkStatus()
  const details = useNetworkDetails()

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

  function closeRow() {
    setOpenSsid(null)
    setPassword('')
  }

  async function handleConnect(ssid: string, pwd?: string) {
    setConnecting(ssid)
    setError(null)
    const result = await window.shell.network.wifiConnect(ssid, pwd)
    if (result.needsPassword && !pwd) {
      setConnecting(null)
      setOpenSsid(ssid)
      setPassword('')
      return
    }
    if (!result.success) {
      setConnecting(null)
      setError(ssid)
      return
    }
    closeRow()
    await new Promise((r) => setTimeout(r, 1500))
    setConnecting(null)
    scan()
  }

  async function handleDisconnect(ssid: string) {
    closeRow()
    setDisconnecting(ssid)
    await window.shell.network.wifiDisconnect()
    await new Promise((r) => setTimeout(r, 1000))
    const list = await window.shell.network.wifiScan()
    if (list) setNetworks(list)
    setDisconnecting(null)
  }

  function activate(network: WifiNetwork) {
    if (connecting || disconnecting) return
    if (openSsid === network.ssid) closeRow()
    else if (network.connected) setOpenSsid(network.ssid)
    else handleConnect(network.ssid)
  }

  const onEthernet = networkStatus.connected && networkStatus.type === 'ethernet'

  return (
    <div className="flex w-full flex-col gap-section">
      <PageHeader variant="plain" title={settingsPage('wifi')?.label ?? ''}>
        {enabled && (
          <Button shape="square" variant="ghost" size="sm" icon={<RefreshCw size={14} />} busy={scanning} onClick={scan}>
            Rescan
          </Button>
        )}
      </PageHeader>

      <Card variant="group">
        <Row label="Wi-Fi">
          <Toggle variant="compact" label="Wi-Fi" checked={enabled} onChange={toggleRadio} />
        </Row>
      </Card>

      {details !== undefined && (
        <Section variant="label" title="Connection">
          {details ? <NetworkMap details={details} /> : <EmptyState variant="plain" title="Not connected" />}
        </Section>
      )}

      {enabled && (
        <Section variant="label" title="Wi-Fi networks">
          {scanning && networks.length === 0 ? (
            <PageSpinner label="Scanning for networks" />
          ) : networks.length === 0 ? (
            <EmptyState variant="plain" title="No networks found" />
          ) : (
            <Card variant="list">
              {networks.map((n) => (
                <NetworkRow
                  key={n.ssid}
                  network={n}
                  connecting={connecting === n.ssid}
                  disconnecting={disconnecting === n.ssid}
                  error={error === n.ssid}
                  open={openSsid === n.ssid}
                  password={password}
                  onActivate={() => activate(n)}
                  onDisconnect={() => handleDisconnect(n.ssid)}
                  onPasswordChange={(v) => {
                    setPassword(v)
                    setError(null)
                  }}
                  onPasswordSubmit={() => password.trim() && handleConnect(n.ssid, password)}
                />
              ))}
            </Card>
          )}
        </Section>
      )}

      <Section variant="label" title="Ethernet">
        <Card variant="list">
          <ListRow
            variant="plain"
            icon={<EthernetPort size={16} className={onEthernet ? 'text-ink-primary' : 'text-ink-quiet'} />}
            title="Ethernet"
            detail={onEthernet ? 'Connected' : 'Not connected'}
          />
        </Card>
      </Section>
    </div>
  )
}

function networkDetail(network: WifiNetwork, connecting: boolean, disconnecting: boolean, error: boolean): string | undefined {
  if (disconnecting) return 'Disconnecting…'
  if (connecting) return 'Connecting…'
  if (network.connected) return 'Connected'
  if (error) return "Couldn't connect"
  return undefined
}

function NetworkRow({
  network,
  connecting,
  disconnecting,
  error,
  open,
  password,
  onActivate,
  onDisconnect,
  onPasswordChange,
  onPasswordSubmit,
}: {
  network: WifiNetwork
  connecting: boolean
  disconnecting: boolean
  error: boolean
  open: boolean
  password: string
  onActivate: () => void
  onDisconnect: () => void
  onPasswordChange: (v: string) => void
  onPasswordSubmit: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const askingPassword = open && !network.connected
  const detail = networkDetail(network, connecting, disconnecting, error)

  useEffect(() => {
    if (askingPassword) requestAnimationFrame(() => inputRef.current?.focus())
  }, [askingPassword])

  return (
    <ListRow
      variant="plain"
      icon={
        <SignalIcon
          signal={network.signal}
          size={16}
          className={network.connected ? 'text-ink-primary' : 'text-ink-quiet'}
        />
      }
      title={network.ssid}
      detail={detail && <span className={error ? 'text-danger' : ''}>{detail}</span>}
      onActivate={onActivate}
      activateLabel={network.connected ? network.ssid : `Connect to ${network.ssid}`}
      expanded={network.connected ? open : undefined}
      actions={
        <>
          {(connecting || disconnecting) && <Spinner size={13} />}
          {network.security !== 'Open' && <Lock size={13} className="shrink-0 text-ink-quiet" />}
        </>
      }
    >
      <div
        className="grid transition-all duration-200 ease-out"
        style={{ gridTemplateRows: open ? '1fr' : '0fr', opacity: open ? 1 : 0 }}
      >
        <div className="min-h-0 overflow-hidden" inert={!open}>
          <div className="flex items-center gap-2 pt-1 pr-3.5 pb-3 pl-[54px]">
            {network.connected ? (
              <Button shape="square" variant="soft" size="sm" onClick={onDisconnect}>
                Disconnect
              </Button>
            ) : (
              <>
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
                <Button shape="square" size="sm" onClick={onPasswordSubmit}>
                  Connect
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </ListRow>
  )
}
