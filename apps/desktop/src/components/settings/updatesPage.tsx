import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, AppWindow, CheckCircle2, Download, ExternalLink, LogIn, RefreshCw, RotateCcw } from 'lucide-react'
import { Button, Card, ListRow, PageHeader, Section, Spinner } from '@alpine/ui'
import { settingsPage } from '../../settings/registry'
import { useUpdate } from '../../hooks/useUpdate'
import { useWindowsUpdate } from '../../hooks/useWindowsUpdate'

const GB = 1024 ** 3
const MB = 1024 ** 2

function formatBytes(bytes: number): string {
  if (bytes >= GB) return `${(bytes / GB).toFixed(1)} GB`
  if (bytes >= MB) return `${Math.round(bytes / MB)} MB`
  return `${Math.round(bytes / 1024)} KB`
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function restart() {
  window.shell.system.powerAction('restart')
}

function openSignIn() {
  window.shell.windows.openSignIn()
}

export default function UpdatesPage() {
  const alpine = useUpdate()
  const windows = useWindowsUpdate()
  const didCheck = useRef(false)

  useEffect(() => {
    if (didCheck.current) return
    didCheck.current = true
    alpine.check()
    windows.check()
  }, [alpine.check, windows.check])

  const checking = alpine.state.status === 'checking' || windows.state.status === 'checking'
  const installing = windows.state.status === 'downloading' || windows.state.status === 'installing'
  const restartRequired = windows.state.status === 'restart-required' || windows.state.rebootRequired
  const previewEnabled = alpine.preferences?.channel === 'nightly'

  const alpineActionable =
    alpine.state.status === 'available' ||
    alpine.state.status === 'downloading' ||
    alpine.state.status === 'preparing' ||
    alpine.state.status === 'downloaded'
  const alpineBusy =
    alpine.state.status === 'downloading' ||
    alpine.state.status === 'preparing' ||
    alpine.state.status === 'downloaded'
  const showWindowsList = windows.state.status === 'available' || installing
  const windowsRows = showWindowsList ? windows.state.updates : []

  const errorMessage =
    alpine.state.status === 'error'
      ? alpine.state.error
      : windows.state.status === 'error'
        ? windows.state.error
        : null

  function refresh() {
    alpine.check()
    windows.check()
  }

  return (
    <div className="flex w-full flex-col gap-section">
      <PageHeader variant="plain" title={settingsPage('updates')?.label ?? ''}>
        <Button
          shape="square"
          variant="ghost"
          size="sm"
          icon={<RefreshCw size={14} />}
          busy={checking}
          disabled={installing || alpineBusy}
          onClick={refresh}
        >
          Check for updates
        </Button>
      </PageHeader>

      {errorMessage && (
        <div role="alert" className="flex items-center gap-2.5 rounded-card bg-danger/10 py-2.5 pr-2.5 pl-4">
          <AlertTriangle size={16} className="shrink-0 text-danger" />
          <span className="flex-1 text-dense text-danger">{errorMessage}</span>
          {alpine.state.signInRequired && (
            <Button shape="square" size="sm" onClick={openSignIn} icon={<LogIn size={14} />}>
              Sign in
            </Button>
          )}
        </div>
      )}

      <Section variant="label" title="Alpine Shell">
        <Card variant="list">
          <ListRow
            variant="plain"
            icon={<AppWindow size={16} className="text-ink-secondary" />}
            title={`Alpine Shell ${alpine.state.currentVersion}`}
            detail={previewEnabled ? `${alpineDetail(alpine.state)} · Preview builds enabled` : alpineDetail(alpine.state)}
            actions={
              <div className="flex items-center gap-1">
                {previewEnabled && (
                  <Button
                    shape="square"
                    variant="ghost"
                    size="sm"
                    disabled={alpineBusy}
                    onClick={() => alpine.setChannel('stable')}
                  >
                    Switch to Stable
                  </Button>
                )}
                <Button
                  shape="square"
                  variant="ghost"
                  size="sm"
                  icon={<ExternalLink size={14} />}
                  onClick={alpine.openChangelog}
                >
                  What's new
                </Button>
                {alpineActionable && (
                  <AlpineAction state={alpine.state} download={alpine.download} install={alpine.install} disabled={installing} />
                )}
              </div>
            }
          />
        </Card>
      </Section>

      <Section variant="label" title="Windows Update">
        <Card variant="list">
          {restartRequired ? (
            <ListRow
              variant="plain"
              icon={<AlertTriangle size={16} className="text-warning" />}
              title="Restart required"
              actions={
                <Button shape="square" size="sm" onClick={restart} icon={<RotateCcw size={14} />}>
                  Restart now
                </Button>
              }
            />
          ) : windowsRows.length > 0 ? (
            windowsRows.map((update, i) => {
              const installingThis = installing && windows.state.installingId === update.updateId
              return (
                <ListRow
                  variant="plain"
                  key={`${update.updateId || update.kb || update.title}-${i}`}
                  icon={<Download size={16} className="text-ink-quiet" />}
                  title={update.title}
                  detail={windowsUpdateDetail(update)}
                  actions={
                    update.tier === 'feature' ? undefined : installingThis ? (
                      <ProgressBar percent={windows.state.progressPercent} />
                    ) : update.updateId ? (
                      <WindowsInstallButton onClick={() => windows.install(update.updateId)} disabled={installing} />
                    ) : undefined
                  }
                />
              )
            })
          ) : (
            <ListRow
              variant="plain"
              icon={windows.state.status === 'checking' ? <Spinner size={14} /> : <CheckCircle2 size={16} className="text-success" />}
              title={windows.state.status === 'checking' ? 'Checking for updates…' : 'Up to date'}
              detail={windows.state.lastCheckedAt ? `Checked ${formatTime(windows.state.lastCheckedAt)}` : undefined}
            />
          )}
        </Card>
      </Section>
    </div>
  )
}

function windowsUpdateDetail(update: WindowsUpdateItem): string {
  const kind =
    update.tier === 'feature'
      ? 'Installs separately'
      : update.tier === 'enablement'
        ? 'Version upgrade'
        : update.sizeBytes > 0
          ? formatBytes(update.sizeBytes)
          : null
  return [update.kb, kind].filter(Boolean).join(' · ')
}

function alpineDetail(state: UpdateState): string {
  if (state.status === 'checking') return 'Checking for updates…'
  if (state.status === 'available') return `Version ${state.availableVersion ?? ''} available`
  if (state.status === 'downloading') return `Downloading version ${state.availableVersion ?? ''}`
  if (state.status === 'preparing') return `Preparing version ${state.availableVersion ?? ''}…`
  if (state.status === 'downloaded') return `Version ${state.availableVersion ?? ''} ready to install`
  if (state.status === 'error') return "Couldn't check for updates"
  return 'Up to date'
}

function AlpineAction({
  state,
  download,
  install,
  disabled,
}: {
  state: UpdateState
  download: () => void
  install: () => void
  disabled?: boolean
}) {
  const [pending, setPending] = useState(false)
  useEffect(() => {
    setPending(false)
  }, [state.status])

  if (state.status === 'downloading') {
    return <ProgressBar percent={state.progressPercent} />
  }

  if (state.status === 'preparing') {
    return (
      <Button shape="square" size="sm" disabled busy>
        Preparing
      </Button>
    )
  }

  if (state.status === 'downloaded') {
    return (
      <Button
        shape="square"
        size="sm"
        onClick={() => { setPending(true); install() }}
        disabled={disabled}
        busy={pending}
        icon={<RotateCcw size={14} />}
      >
        Update now
      </Button>
    )
  }

  return (
    <Button
      shape="square"
      size="sm"
      onClick={() => { setPending(true); download() }}
      disabled={disabled}
      busy={pending}
      icon={<Download size={14} />}
    >
      Download
    </Button>
  )
}

function WindowsInstallButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  const [pending, setPending] = useState(false)
  useEffect(() => {
    if (disabled) setPending(false)
  }, [disabled])
  return (
    <Button
      shape="square"
      variant="soft"
      size="sm"
      onClick={() => { setPending(true); onClick() }}
      disabled={disabled}
      busy={pending}
      icon={<Download size={13} />}
    >
      Install
    </Button>
  )
}

function ProgressBar({ percent }: { percent: number }) {
  const clamped = Math.min(100, Math.max(0, percent))
  return (
    <div className="flex w-40 items-center gap-2.5">
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-fill-track">
        <div className="absolute top-0 bottom-0 left-0 bg-fill-solid transition-all" style={{ width: `${clamped}%` }} />
      </div>
      <span className="shrink-0 text-xs text-ink-quiet tabular-nums">{Math.round(clamped)}%</span>
    </div>
  )
}
