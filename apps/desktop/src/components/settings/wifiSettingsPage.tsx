import { useEffect, useRef } from 'react'
import { EthernetPort, Lock, RefreshCw, Wifi, WifiHigh, WifiLow, WifiOff, WifiZero } from 'lucide-react'
import { Button, Card, EmptyState, ListRow, PageHeader, Row, Section, Spinner, TextField, Toggle } from '@alpine/ui'
import { useNetworkStatus } from '../../hooks/useNetwork'
import { useWifi } from '../../hooks/useWifi'
import { useWifiJoin } from '../../hooks/useWifiJoin'
import { useNetworkDetails } from '../../hooks/useNetworkDetails'
import { ETHERNET_ONLY_TITLE, networkStatusLabel, wifiOffLabel } from '../../lib/wifiPresentation'
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
  const state = useWifi()
  const join = useWifiJoin()
  const networkStatus = useNetworkStatus()
  const details = useNetworkDetails()
  const enabled = state.radio === 'on'

  useEffect(() => {
    void window.shell.network.wifiScan().catch(() => {})
  }, [])

  function scan() {
    void window.shell.network.wifiScan().catch(() => {})
  }

  function toggleRadio(value: boolean) {
    void window.shell.network.wifiRadioSet(value).catch(() => {})
  }

  function activate(network: WifiNetwork) {
    if (state.operation) return
    if (join.passwordFor === network.ssid) join.cancelPassword()
    else void join.activate(network)
  }

  const onEthernet = networkStatus.connected && networkStatus.type === 'ethernet'

  return (
    <div className="flex w-full flex-col gap-section">
      <PageHeader variant="plain" title={settingsPage('wifi')?.label ?? ''}>
        {enabled && !state.blockedByEthernet && (
          <Button shape="square" variant="ghost" size="sm" icon={<RefreshCw size={14} />} busy={state.scanning} onClick={scan}>
            Rescan
          </Button>
        )}
      </PageHeader>

      {state.blockedByEthernet ? (
        <Section variant="label" title="Ethernet">
          <Card variant="list">
            <ListRow
              variant="plain"
              icon={<EthernetPort size={16} className="text-ink-primary" />}
              title={ETHERNET_ONLY_TITLE}
            />
          </Card>
        </Section>
      ) : (
        <Card variant="group">
          <Row label="Wi-Fi">
            <Toggle variant="compact" label="Wi-Fi" checked={enabled} onChange={toggleRadio} />
          </Row>
        </Card>
      )}

      {details && (
        <Section variant="label" title="Connection">
          <NetworkMap details={details} />
        </Section>
      )}

      {!state.blockedByEthernet && (
        <Section variant="label" title="Wi-Fi networks">
          {!enabled ? (
            <EmptyState
              variant="plain"
              icon={state.ethernet ? <EthernetPort size={20} /> : <WifiOff size={20} />}
              title={wifiOffLabel(state)}
            />
          ) : state.scanning && state.networks.length === 0 ? (
            <PageSpinner label="Scanning for networks" />
          ) : state.networks.length === 0 ? (
            <EmptyState variant="plain" title="No networks found" />
          ) : (
            <Card variant="list">
              {state.networks.map((n) => (
                <NetworkRow
                  key={n.ssid}
                  network={n}
                  state={state}
                  passwordFor={join.passwordFor}
                  username={join.username}
                  password={join.password}
                  needsUsername={join.needsUsername}
                  canSubmit={join.canSubmit}
                  wrongPassword={join.wrongPasswordFor === n.ssid}
                  untrustedServer={join.untrustedServerFor === n.ssid}
                  onActivate={() => activate(n)}
                  onUsernameChange={join.setUsername}
                  onPasswordChange={join.setPassword}
                  onPasswordSubmit={() => { if (!state.operation && join.canSubmit) void join.submitPassword() }}
                  onConnectAnyway={() => { if (!state.operation && join.canSubmit) void join.connectAnyway() }}
                />
              ))}
            </Card>
          )}
        </Section>
      )}

      {onEthernet && !state.blockedByEthernet && (
        <Section variant="label" title="Ethernet">
          <Card variant="list">
            <ListRow
              variant="plain"
              icon={<EthernetPort size={16} className="text-ink-primary" />}
              title="Ethernet"
              detail="Connected"
            />
          </Card>
        </Section>
      )}
    </div>
  )
}

function NetworkRow({
  network,
  state,
  passwordFor,
  username,
  password,
  needsUsername,
  canSubmit,
  wrongPassword,
  untrustedServer,
  onActivate,
  onUsernameChange,
  onPasswordChange,
  onPasswordSubmit,
  onConnectAnyway,
}: {
  network: WifiNetwork
  state: WifiState
  passwordFor: string | null
  username: string
  password: string
  needsUsername: boolean
  canSubmit: boolean
  wrongPassword: boolean
  untrustedServer: boolean
  onActivate: () => void
  onUsernameChange: (v: string) => void
  onPasswordChange: (v: string) => void
  onPasswordSubmit: () => void
  onConnectAnyway: () => void
}) {
  const usernameRef = useRef<HTMLInputElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const open = passwordFor === network.ssid
  const askingPassword = open && !network.connected
  const detail = networkStatusLabel(network, state)
  const busy = state.operation !== null

  useEffect(() => {
    if (askingPassword) requestAnimationFrame(() => (needsUsername ? usernameRef : inputRef).current?.focus())
  }, [askingPassword, needsUsername])

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
      detail={detail && <span className={wrongPassword || (state.lastError?.ssid === network.ssid && state.lastError.error !== 'wrong-password') ? 'text-danger' : ''}>{detail}</span>}
      onActivate={onActivate}
      activateLabel={network.connected ? network.ssid : `Connect to ${network.ssid}`}
      expanded={askingPassword ? true : undefined}
      actions={
        <>
          {state.operation?.ssid === network.ssid && <Spinner size={13} />}
          {network.secured && <Lock size={13} className="shrink-0 text-ink-quiet" />}
        </>
      }
    >
      <div
        className="grid transition-all duration-200 ease-out"
        style={{ gridTemplateRows: open ? '1fr' : '0fr', opacity: open ? 1 : 0 }}
      >
        <div className="min-h-0 overflow-hidden" inert={!open}>
          <div className="pt-1 pr-3.5 pb-3 pl-[54px]">
            <div className="flex max-w-xs flex-col gap-2">
              {needsUsername && (
                <TextField
                  ref={usernameRef}
                  type="text"
                  label={`Username for ${network.ssid}`}
                  placeholder="Username"
                  value={username}
                  invalid={wrongPassword}
                  onChange={onUsernameChange}
                  onSubmit={() => {
                    if (canSubmit) (untrustedServer ? onConnectAnyway : onPasswordSubmit)()
                    else inputRef.current?.focus()
                  }}
                />
              )}
              <div className="flex items-center gap-2">
                <TextField
                  ref={inputRef}
                  type="password"
                  label={`Password for ${network.ssid}`}
                  placeholder="Password"
                  value={password}
                  invalid={wrongPassword}
                  onChange={onPasswordChange}
                  onSubmit={untrustedServer ? onConnectAnyway : onPasswordSubmit}
                  className="min-w-0 flex-1"
                />
                {!untrustedServer && (
                  <Button shape="square" size="sm" disabled={busy || !canSubmit} onClick={onPasswordSubmit}>
                    Connect
                  </Button>
                )}
              </div>
              {untrustedServer && (
                <Button shape="square" size="sm" disabled={busy || !canSubmit} onClick={onConnectAnyway} className="w-full justify-center">
                  Connect anyway
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </ListRow>
  )
}
