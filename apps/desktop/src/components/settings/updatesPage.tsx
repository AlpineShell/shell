import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, AppWindow, CheckCircle2, Download, RefreshCw, RotateCcw } from 'lucide-react'
import { useUpdate } from '../../hooks/useUpdate'
import { useWindowsUpdate } from '../../hooks/useWindowsUpdate'
import { PageHeader, Spinner } from './appsShared'
import Button from '../ui/button'

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
    <div className="flex flex-col gap-5 w-full">
      <PageHeader
        title="Updates"
        description={headerDescription({
          checking,
          installing,
          restartRequired,
          hasUpdates: hasRows,
          lastCheckedAt: windows.state.lastCheckedAt,
        })}
      >
        <div className="flex items-center gap-1">
          <button
            onClick={refresh}
            disabled={checking || installing || alpineBusy}
            title="Check for updates"
            aria-label="Check for updates"
            className="focus-ring -m-1 p-1 inline-flex items-center justify-center text-ink-quiet hover:text-ink-primary transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {checking ? <Spinner size={16} /> : <RefreshCw size={16} />}
          </button>
        </div>
      </PageHeader>

      {errorMessage && (
        <div className="flex items-start gap-2.5 rounded-card border border-danger/30 bg-danger/10 px-4 py-3">
          <AlertTriangle size={16} className="text-danger shrink-0 mt-0.5" />
          <span className="text-dense text-danger">{errorMessage}</span>
        </div>
      )}

      {(restartRequired || hasRows) && (
        <div className="flex flex-col gap-1">
          {restartRequired && (
            <Row
              icon={<AlertTriangle size={20} className="text-warning" />}
              title="Restart required"
              detail="Restart your device to finish installing Windows updates."
              action={
                <PrimaryButton onClick={restart}>
                  <RotateCcw size={14} />
                  Restart now
                </PrimaryButton>
              }
            />
          )}

          {!restartRequired && alpineActionable && (
            <Row
              icon={<AppWindow size={20} className="text-ink-secondary" />}
              title="Alpine Shell"
              detail={alpineDetail(alpine.state)}
              action={
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
                <Row
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
                  action={
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
        <div className="flex flex-col items-center justify-center gap-2.5 py-14 text-center">
          {checking ? (
            <Spinner size={22} />
          ) : (
            <CheckCircle2 size={26} className="text-success" />
          )}
          <span className="text-dense text-ink-secondary">
            {checking ? 'Checking for updates…' : "You're up to date"}
          </span>
          {!checking && (
            <span className="text-[11px] text-ink-quiet">
              Alpine Shell {alpine.state.currentVersion}
              {windows.state.lastCheckedAt ? ` · Windows checked ${formatTime(windows.state.lastCheckedAt)}` : ''}
            </span>
          )}
        </div>
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

function Row({
  icon,
  title,
  detail,
  action,
}: {
  icon: React.ReactNode
  title: string
  detail: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-3 rounded-card bg-surface-2 border border-line-hairline px-3 min-h-14 py-2">
      <span className="w-7 flex justify-center shrink-0">{icon}</span>
      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-dense text-ink-primary truncate">{title}</span>
        {detail && <span className="text-[11px] text-ink-quiet truncate">{detail}</span>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
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
      <PrimaryButton onClick={() => { setPending(true); install() }} disabled={disabled || pending}>
        {pending ? <Spinner size={14} /> : <RotateCcw size={14} />}
        Restart &amp; install
      </PrimaryButton>
    )
  }

  return (
    <PrimaryButton onClick={() => { setPending(true); download() }} disabled={disabled || pending}>
      {pending ? <Spinner size={14} /> : <Download size={14} />}
      Download
    </PrimaryButton>
  )
}

function WindowsInstallButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  const [pending, setPending] = useState(false)
  useEffect(() => {
    if (disabled) setPending(false)
  }, [disabled])
  return (
    <SecondaryButton onClick={() => { setPending(true); onClick() }} disabled={disabled || pending}>
      {pending ? <Spinner size={13} /> : <Download size={13} />}
      Install
    </SecondaryButton>
  )
}

function SecondaryButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <Button variant="outline" size="sm" onClick={onClick} disabled={disabled} className="font-medium">
      {children}
    </Button>
  )
}

function ProgressBar({ percent }: { percent: number }) {
  const clamped = Math.min(100, Math.max(0, percent))
  return (
    <div className="flex items-center gap-2.5 w-40">
      <div className="relative flex-1 h-1.5 rounded-full bg-fill-track overflow-hidden">
        <div className="absolute left-0 top-0 bottom-0 bg-fill-solid transition-all" style={{ width: `${clamped}%` }} />
      </div>
      <span className="text-xs text-ink-quiet shrink-0 tabular-nums">{Math.round(clamped)}%</span>
    </div>
  )
}

function PrimaryButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <Button size="sm" onClick={onClick} disabled={disabled} className="font-medium">
      {children}
    </Button>
  )
}
