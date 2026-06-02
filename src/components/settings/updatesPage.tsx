import { useEffect, useRef } from 'react'
import { AlertTriangle, AppWindow, CheckCircle2, Download, RefreshCw, RotateCcw } from 'lucide-react'
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
  const windowsActionable = windows.state.status === 'available' && windows.state.updates.length > 0
  const hasUpdates = alpineActionable || windowsActionable

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
    <div className="flex flex-col gap-5 w-full">
      <PageHeader
        title="Updates"
        description={headerDescription({
          checking,
          installing,
          restartRequired,
          hasUpdates,
          lastCheckedAt: windows.state.lastCheckedAt,
        })}
      >
        <button
          onClick={refresh}
          disabled={checking || installing}
          title="Check for updates"
          aria-label="Check for updates"
          className="-m-1 p-1 inline-flex items-center justify-center text-white/50 hover:text-white/90 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {checking ? <Spinner size={16} /> : <RefreshCw size={16} />}
        </button>
      </PageHeader>

      {errorMessage && (
        <div className="flex items-start gap-2.5 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3">
          <AlertTriangle size={16} className="text-red-400/80 shrink-0 mt-0.5" />
          <span className="text-[13px] text-red-300/90">{errorMessage}</span>
        </div>
      )}

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
            action={<AlpineAction state={alpine.state} download={alpine.download} install={alpine.install} />}
          />
        )}

        {!restartRequired && (windowsActionable || installing) && (
          <>
            <div className="flex items-center justify-between gap-3 px-1 pt-3 pb-1">
              <span className="text-[11px] uppercase tracking-wider text-white/40">Windows</span>
              <WindowsInstallButton status={windows.state.status} onInstall={windows.install} />
            </div>
            {windows.state.updates.map((update, i) => (
              <Row
                key={`${update.kb ?? update.title}-${i}`}
                icon={<Download size={18} className="text-white/35" />}
                title={update.title}
                detail={[update.kb, update.sizeBytes > 0 ? formatBytes(update.sizeBytes) : null]
                  .filter(Boolean)
                  .join(' · ')}
              />
            ))}
          </>
        )}

        {!restartRequired && !hasUpdates && !installing && (
          <Row
            icon={checking ? <Spinner size={18} /> : <CheckCircle2 size={20} className="text-emerald-400" />}
            title={checking ? 'Checking for updates…' : "You're up to date"}
            detail={
              checking
                ? 'Looking for the latest versions.'
                : `Alpine Shell ${alpine.state.currentVersion}${
                    windows.state.lastCheckedAt ? ` · Windows checked ${formatTime(windows.state.lastCheckedAt)}` : ''
                  }`
            }
          />
        )}
      </div>

      <ActivityLog entries={alpine.log} />
    </div>
  )
}

function ActivityLog({ entries }: { entries: UpdateLogEntry[] }) {
  const ordered = entries.slice().reverse()
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[11px] uppercase tracking-wider text-white/40 px-1">Activity</span>
      <div className="flex flex-col rounded-lg bg-neutral-900 border border-white/5 max-h-44 overflow-y-auto">
        {ordered.length === 0 ? (
          <div className="px-3 py-2.5 text-[12px] text-white/40">No update activity yet.</div>
        ) : (
          ordered.map((entry, i) => (
            <div
              key={`${entry.time}-${i}`}
              className="flex items-start gap-3 px-3 py-1.5 border-b border-white/5 last:border-b-0"
            >
              <span className="text-[11px] text-white/30 tabular-nums shrink-0 whitespace-nowrap pt-px">
                {formatLogTime(entry.time)}
              </span>
              <span className={`text-[12px] ${entry.level === 'error' ? 'text-red-300/90' : 'text-white/70'}`}>
                {entry.message}
              </span>
            </div>
          ))
        )}
      </div>
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
}: {
  state: UpdateState
  download: () => void
  install: () => void
}) {
  if (state.status === 'downloading') {
    return (
      <div className="flex items-center gap-2.5 w-40">
        <div className="relative flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div
            className="absolute left-0 top-0 bottom-0 bg-blue-500 transition-all"
            style={{ width: `${Math.min(100, Math.max(0, state.progressPercent))}%` }}
          />
        </div>
        <span className="text-xs text-white/50 shrink-0 tabular-nums">{Math.round(state.progressPercent)}%</span>
      </div>
    )
  }

  if (state.status === 'downloaded') {
    return (
      <PrimaryButton onClick={install}>
        <RotateCcw size={14} />
        Restart &amp; install
      </PrimaryButton>
    )
  }

  return (
    <PrimaryButton onClick={download}>
      <Download size={14} />
      Download
    </PrimaryButton>
  )
}

function WindowsInstallButton({
  status,
  onInstall,
}: {
  status: WindowsUpdateStatus
  onInstall: () => void
}) {
  if (status === 'downloading' || status === 'installing') {
    return (
      <button
        disabled
        className="h-8 px-3 inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 text-white/90 text-[12px] font-medium cursor-not-allowed opacity-60"
      >
        <Spinner size={14} />
        {status === 'downloading' ? 'Downloading…' : 'Installing…'}
      </button>
    )
  }

  return (
    <PrimaryButton onClick={onInstall}>
      <Download size={14} />
      Install updates
    </PrimaryButton>
  )
}

function PrimaryButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="h-8 px-3 inline-flex items-center gap-1.5 rounded-md bg-white hover:bg-neutral-200 text-neutral-950 text-[12px] font-medium transition-colors cursor-pointer"
    >
      {children}
    </button>
  )
}
