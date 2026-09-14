import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, AppWindow, CheckCircle2, Download, RefreshCw, RotateCcw } from 'lucide-react'
import { Button, EmptyState, IconButton, ListRow, PageHeader, Spinner } from '@alpine/ui'
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

  const alpineActionable =
    alpine.state.status === 'available' ||
    alpine.state.status === 'downloading' ||
    alpine.state.status === 'downloaded'
  const alpineBusy = alpine.state.status === 'downloading' || alpine.state.status === 'downloaded'
  const showWindowsList = windows.state.status === 'available' || installing
  const windowsRows = showWindowsList ? windows.state.updates : []

  const errorMessage =
    alpine.state.status === 'error'
      ? alpine.state.error
      : windows.state.status === 'error'
        ? windows.state.error
        : null

  const hasRows = (!restartRequired && alpineActionable) || windowsRows.length > 0
  const showEmptyState = !restartRequired && !errorMessage && !hasRows

  function refresh() {
    alpine.check()
    windows.check()
  }

  return (
    <div className="flex w-full flex-col gap-5">
      <PageHeader
        title="Updates"
        subtitle={headerDescription({
          checking,
          installing,
          restartRequired,
          hasUpdates: hasRows,
          lastCheckedAt: windows.state.lastCheckedAt,
        })}
      >
        <IconButton
          label="Check for updates"
          onClick={refresh}
          busy={checking}
          disabled={installing || alpineBusy}
        >
          <RefreshCw size={16} />
        </IconButton>
      </PageHeader>

      {errorMessage && (
        <div className="flex items-start gap-2.5 rounded-card border border-danger/30 bg-danger/10 px-4 py-3">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-danger" />
          <span className="text-dense text-danger">{errorMessage}</span>
        </div>
      )}

      {(restartRequired || hasRows) && (
        <div className="flex flex-col gap-1">
          {restartRequired && (
            <ListRow
              icon={<AlertTriangle size={20} className="text-warning" />}
              title="Restart required"
              detail="Restart your device to finish installing Windows updates."
              actions={
                <Button size="sm" onClick={restart} icon={<RotateCcw size={14} />}>
                  Restart now
                </Button>
              }
            />
          )}

          {!restartRequired && alpineActionable && (
            <ListRow
              icon={<AppWindow size={20} className="text-ink-secondary" />}
              title="Alpine Shell"
              detail={alpineDetail(alpine.state)}
              actions={
                <AlpineAction
                  state={alpine.state}
                  download={alpine.download}
                  install={alpine.install}
                  disabled={installing}
                />
              }
            />
          )}

          {!restartRequired &&
            windowsRows.map((update, i) => {
              const installingThis = installing && windows.state.installingId === update.updateId
              return (
                <ListRow
                  key={`${update.updateId || update.kb || update.title}-${i}`}
                  icon={<Download size={18} className="text-ink-faint" />}
                  title={update.title}
                  detail={[
                    update.kb,
                    update.tier === 'feature'
                      ? 'Major version upgrade — installed separately'
                      : update.tier === 'enablement'
                        ? 'Version upgrade'
                        : update.sizeBytes > 0
                          ? formatBytes(update.sizeBytes)
                          : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  actions={
                    update.tier === 'feature' ? undefined : installingThis ? (
                      <ProgressBar percent={windows.state.progressPercent} />
                    ) : update.updateId ? (
                      <WindowsInstallButton onClick={() => windows.install(update.updateId)} disabled={installing} />
                    ) : undefined
                  }
                />
              )
            })}
        </div>
      )}

      {showEmptyState && (
        <EmptyState
          icon={checking ? <Spinner size={22} /> : <CheckCircle2 size={26} className="text-success" />}
          title={checking ? 'Checking for updates…' : "You're up to date"}
          detail={
            checking
              ? undefined
              : `Alpine Shell ${alpine.state.currentVersion}${
                  windows.state.lastCheckedAt ? ` · Windows checked ${formatTime(windows.state.lastCheckedAt)}` : ''
                }`
          }
        />
      )}
    </div>
  )
}

function headerDescription({
  checking,
  installing,
  restartRequired,
  hasUpdates,
  lastCheckedAt,
}: {
  checking: boolean
  installing: boolean
  restartRequired: boolean
  hasUpdates: boolean
  lastCheckedAt: number | null
}): string {
  if (checking) return 'Checking for updates…'
  if (installing) return 'Installing Windows updates — this may take a while.'
  if (restartRequired) return 'Restart to finish installing updates.'
  if (hasUpdates) return 'Updates are available.'
  if (lastCheckedAt) return `Last checked ${formatTime(lastCheckedAt)}`
  return "Your system is up to date."
}

function alpineDetail(state: UpdateState): string {
  if (state.status === 'downloading') return `Downloading ${Math.round(state.progressPercent)}%`
  if (state.status === 'downloaded') return `Version ${state.availableVersion ?? ''} ready to install`
  return `Version ${state.availableVersion ?? ''} available`
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

  if (state.status === 'downloaded') {
    return (
      <Button
        size="sm"
        onClick={() => { setPending(true); install() }}
        disabled={disabled}
        busy={pending}
        icon={<RotateCcw size={14} />}
      >
        Restart &amp; install
      </Button>
    )
  }

  return (
    <Button
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
      variant="outline"
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
