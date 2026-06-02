import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, AppWindow, CheckCircle2, Download, RefreshCw, RotateCcw, ScrollText } from 'lucide-react'
import { useUpdate } from '../../hooks/useUpdate'
import { useWindowsUpdate } from '../../hooks/useWindowsUpdate'
import { PageHeader, Spinner } from './appsShared'

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

function formatLogTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function restart() {
  window.shell.system.powerAction('restart')
}

export default function UpdatesPage() {
  const alpine = useUpdate()
  const windows = useWindowsUpdate()
  const didCheck = useRef(false)

  const [showLogs, setShowLogs] = useState(false)
  const [logs, setLogs] = useState<WindowsUpdateLogEntry[]>([])
  const [logsLoading, setLogsLoading] = useState(false)

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

  async function toggleLogs() {
    const next = !showLogs
    setShowLogs(next)
    if (next) {
      setLogsLoading(true)
      try {
        setLogs(await windows.logs())
      } finally {
        setLogsLoading(false)
      }
    }
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
            onClick={toggleLogs}
            title="View Windows Update logs"
            aria-label="View Windows Update logs"
            className={`-m-1 p-1 inline-flex items-center justify-center transition-colors cursor-pointer ${
              showLogs ? 'text-white/90' : 'text-white/50 hover:text-white/90'
            }`}
          >
            <ScrollText size={16} />
          </button>
          <button
            onClick={refresh}
            disabled={checking || installing || alpineBusy}
            title="Check for updates"
            aria-label="Check for updates"
            className="-m-1 p-1 inline-flex items-center justify-center text-white/50 hover:text-white/90 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {checking ? <Spinner size={16} /> : <RefreshCw size={16} />}
          </button>
        </div>
      </PageHeader>

      {errorMessage && (
        <div className="flex items-start gap-2.5 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3">
          <AlertTriangle size={16} className="text-red-400/80 shrink-0 mt-0.5" />
          <span className="text-[13px] text-red-300/90">{errorMessage}</span>
        </div>
      )}

      {(restartRequired || hasRows) && (
        <div className="flex flex-col gap-1">
          {restartRequired && (
            <Row
              icon={<AlertTriangle size={20} className="text-amber-400" />}
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
              icon={<AppWindow size={20} className="text-white/70" />}
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
                  icon={<Download size={18} className="text-white/35" />}
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
                      <SecondaryButton onClick={() => windows.install(update.updateId)} disabled={installing}>
                        <Download size={13} />
                        Install
                      </SecondaryButton>
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
            <CheckCircle2 size={26} className="text-emerald-400" />
          )}
          <span className="text-[13px] text-white/70">
            {checking ? 'Checking for updates…' : "You're up to date"}
          </span>
          {!checking && (
            <span className="text-[11px] text-white/40">
              Alpine Shell {alpine.state.currentVersion}
              {windows.state.lastCheckedAt ? ` · Windows checked ${formatTime(windows.state.lastCheckedAt)}` : ''}
            </span>
          )}
        </div>
      )}

      {showLogs && (
        <div className="flex flex-col gap-2">
          <span className="text-[11px] uppercase tracking-wider text-white/40 px-1">Windows Update logs</span>
          <div className="flex flex-col rounded-lg bg-neutral-900 border border-white/5 max-h-64 overflow-y-auto">
            {logsLoading ? (
              <div className="px-3 py-2.5 text-[12px] text-white/40">Loading logs…</div>
            ) : logs.length === 0 ? (
              <div className="px-3 py-2.5 text-[12px] text-white/40">No recent Windows Update activity.</div>
            ) : (
              logs.map((entry, i) => (
                <div
                  key={`${entry.time}-${i}`}
                  className="flex items-start gap-3 px-3 py-1.5 border-b border-white/5 last:border-b-0"
                >
                  <span className="text-[11px] text-white/30 tabular-nums shrink-0 whitespace-nowrap pt-px">
                    {formatLogTime(entry.time)}
                  </span>
                  <span className={`text-[12px] ${entry.level === 'Error' ? 'text-red-300/90' : 'text-white/70'}`}>
                    {entry.message}
                  </span>
                </div>
              ))
            )}
          </div>
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
    <div className="flex items-center gap-3 rounded-lg bg-neutral-900 border border-white/5 px-3 min-h-14 py-2">
      <span className="w-7 flex justify-center shrink-0">{icon}</span>
      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-[13px] text-white/90 truncate">{title}</span>
        {detail && <span className="text-[11px] text-white/45 truncate">{detail}</span>}
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
  if (state.status === 'downloading') {
    return <ProgressBar percent={state.progressPercent} />
  }

  if (state.status === 'downloaded') {
    return (
      <PrimaryButton onClick={install} disabled={disabled}>
        <RotateCcw size={14} />
        Restart &amp; install
      </PrimaryButton>
    )
  }

  return (
    <PrimaryButton onClick={download} disabled={disabled}>
      <Download size={14} />
      Download
    </PrimaryButton>
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
    <button
      onClick={onClick}
      disabled={disabled}
      className="h-8 px-3 inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 text-white/90 text-[12px] font-medium hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  )
}

function ProgressBar({ percent }: { percent: number }) {
  const clamped = Math.min(100, Math.max(0, percent))
  return (
    <div className="flex items-center gap-2.5 w-40">
      <div className="relative flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div className="absolute left-0 top-0 bottom-0 bg-blue-500 transition-all" style={{ width: `${clamped}%` }} />
      </div>
      <span className="text-xs text-white/50 shrink-0 tabular-nums">{Math.round(clamped)}%</span>
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
    <button
      onClick={onClick}
      disabled={disabled}
      className="h-8 px-3 inline-flex items-center gap-1.5 rounded-md bg-white hover:bg-neutral-200 text-neutral-950 text-[12px] font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  )
}
