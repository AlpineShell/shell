import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, AppWindow, BellOff, CheckCircle2, Download, RefreshCw, RotateCcw } from 'lucide-react'
import { Button, Card, EmptyState, IconButton, ListRow, PageHeader } from '@alpine/ui'
import { useUpdate } from '../../hooks/useUpdate'
import { useWindowsUpdate } from '../../hooks/useWindowsUpdate'
import { useSettingsValue } from '../../hooks/useSettingsValue'
import { useHighlightedSetting } from '../../hooks/useHighlightedSetting'
import { settingsValueEntry } from '../../settings/registry'
import { ValueRow } from './registryRow'
import PageSpinner from './pageSpinner'

const GB = 1024 ** 3
const MB = 1024 ** 2

const UPDATE_CHECKS = settingsValueEntry('update-checks')
const CHECKS_ON_DETAIL = 'Alpine Shell asks alpineshell.com for a newer version about every six hours, sending only its licence token.'
const CHECKS_OFF_DETAIL = 'No update checks: Alpine Shell makes no update requests and never contacts alpineshell.com on its own for anything. Get a newer version by hand from alpineshell.com when you want one.'
const CHECKS_OFF_TITLE = 'Update checks are off'

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
  const checksOn = useSettingsValue(UPDATE_CHECKS).value !== false
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
      <PageHeader title="Updates">
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
                      ? 'Installs separately'
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

      {showEmptyState && checking && <PageSpinner label="Checking for updates" />}
      {showEmptyState && !checking && (
        <EmptyState
          variant="plain"
          icon={checksOn ? <CheckCircle2 size={14} className="text-success" /> : <BellOff size={14} className="text-ink-quiet" />}
          title={checksOn ? "You're up to date" : CHECKS_OFF_TITLE}
          detail={`Alpine Shell ${alpine.state.currentVersion}${
            windows.state.lastCheckedAt ? ` · Windows checked ${formatTime(windows.state.lastCheckedAt)}` : ''
          }`}
        />
      )}

      <UpdateChecksCard checksOn={checksOn} />
    </div>
  )
}

function UpdateChecksCard({ checksOn }: { checksOn: boolean }) {
  const highlighted = useHighlightedSetting(UPDATE_CHECKS.id)
  const anchor = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (highlighted) anchor.current?.scrollIntoView({ block: 'center' })
  }, [highlighted])

  return (
    <div
      ref={anchor}
      className={`-mx-2 rounded-field px-2 py-1.5 transition-colors duration-300 ${
        highlighted ? 'bg-fill-ghost ring-1 ring-line-strong' : ''
      }`}
    >
      <Card variant="borderless" className="px-4 py-3.5">
        <ValueRow entry={UPDATE_CHECKS} description={checksOn ? CHECKS_ON_DETAIL : CHECKS_OFF_DETAIL} />
      </Card>
    </div>
  )
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
