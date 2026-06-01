import { AlertTriangle, CheckCircle2, Download, ExternalLink, Loader2, RefreshCw, RotateCcw } from 'lucide-react'
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

export default function UpdatesPage() {
  return (
    <div className="max-w-2xl flex flex-col gap-8">
      <h1 className="text-2xl font-semibold tracking-tight">Updates</h1>
      <AlpineShellSection />
      <WindowsUpdateSection />
    </div>
  )
}

function AlpineShellSection() {
  const { state, check, download, install } = useUpdate()
  const checking = state.status === 'checking'

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-base font-medium">Alpine Shell</h2>
        <span className="text-xs text-white/50">Current version {state.currentVersion}</span>
      </div>

      <div className="rounded-lg bg-neutral-900 border border-white/5 px-4 py-4 flex flex-col gap-4">
        {state.status === 'available' && (
          <StatusLine
            icon={<Download size={16} className="text-blue-400 shrink-0" />}
            title={`Version ${state.availableVersion} is available`}
            description="Download the update to install it."
          />
        )}

        {state.status === 'downloading' && (
          <div className="flex flex-col gap-2">
            <StatusLine
              icon={<Loader2 size={16} className="text-blue-400 shrink-0 animate-spin" />}
              title="Downloading update"
              description={`${Math.round(state.progressPercent)}%`}
            />
            <div className="relative w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div
                className="absolute left-0 top-0 bottom-0 bg-blue-500 transition-all"
                style={{ width: `${Math.min(100, Math.max(0, state.progressPercent))}%` }}
              />
            </div>
          </div>
        )}

        {state.status === 'downloaded' && (
          <StatusLine
            icon={<RotateCcw size={16} className="text-emerald-400 shrink-0" />}
            title={`Version ${state.availableVersion} is ready to install`}
            description="Restart Alpine Shell to finish installing."
          />
        )}

        {state.status === 'not-available' && (
          <StatusLine
            icon={<CheckCircle2 size={16} className="text-emerald-400 shrink-0" />}
            title="You're up to date"
            description={`Alpine Shell ${state.currentVersion} is the latest version.`}
          />
        )}

        {state.status === 'error' && (
          <StatusLine
            icon={<AlertTriangle size={16} className="text-amber-400 shrink-0" />}
            title="Update check failed"
            description={state.error ?? 'Something went wrong.'}
            tone="error"
          />
        )}

        <div className="flex items-center gap-2">
          {state.status === 'available' ? (
            <PrimaryButton onClick={download}>
              <Download size={14} />
              Download
            </PrimaryButton>
          ) : state.status === 'downloaded' ? (
            <PrimaryButton onClick={install}>
              <RotateCcw size={14} />
              Restart &amp; install
            </PrimaryButton>
          ) : (
            <SecondaryButton onClick={check} disabled={checking || state.status === 'downloading'}>
              {checking ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              {checking ? 'Checking...' : 'Check for updates'}
            </SecondaryButton>
          )}
        </div>
      </div>
    </section>
  )
}

function WindowsUpdateSection() {
  const { state, check, openSettings } = useWindowsUpdate()
  const checking = state.status === 'checking'

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-base font-medium">Windows Update</h2>
        <span className="text-xs text-white/50">
          {state.lastCheckedAt ? `Last checked ${formatTime(state.lastCheckedAt)}` : 'System updates from Microsoft'}
        </span>
      </div>

      <div className="rounded-lg bg-neutral-900 border border-white/5 px-4 py-4 flex flex-col gap-4">
        {state.status === 'available' && (
          <div className="flex flex-col gap-3">
            <StatusLine
              icon={<Download size={16} className="text-blue-400 shrink-0" />}
              title={`${state.updates.length} update${state.updates.length === 1 ? '' : 's'} available`}
              description="Install these from Windows Settings."
            />
            <div className="flex flex-col">
              {state.updates.map((update, i) => (
                <div
                  key={`${update.kb ?? update.title}-${i}`}
                  className="flex items-start justify-between gap-4 py-2.5 border-b border-white/5 last:border-b-0"
                >
                  <div className="flex flex-col min-w-0">
                    <span className="text-[13px] text-white/90 truncate">{update.title}</span>
                    {update.kb && <span className="text-xs text-white/50">{update.kb}</span>}
                  </div>
                  {update.sizeBytes > 0 && (
                    <span className="text-xs text-white/50 shrink-0">{formatBytes(update.sizeBytes)}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {state.status === 'up-to-date' && (
          <StatusLine
            icon={<CheckCircle2 size={16} className="text-emerald-400 shrink-0" />}
            title="You're up to date"
            description="Windows has no pending updates."
          />
        )}

        {state.status === 'error' && (
          <StatusLine
            icon={<AlertTriangle size={16} className="text-amber-400 shrink-0" />}
            title="Update check failed"
            description={state.error ?? 'Something went wrong.'}
            tone="error"
          />
        )}

        <div className="flex items-center gap-2">
          <SecondaryButton onClick={check} disabled={checking}>
            {checking ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {checking ? 'Checking...' : 'Check for updates'}
          </SecondaryButton>
          {state.status === 'available' && (
            <PrimaryButton onClick={openSettings}>
              <ExternalLink size={14} />
              Open Windows Update settings
            </PrimaryButton>
          )}
        </div>
      </div>
    </section>
  )
}

function StatusLine({
  icon,
  title,
  description,
  tone,
}: {
  icon: React.ReactNode
  title: string
  description: string
  tone?: 'error'
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5">{icon}</span>
      <div className="flex flex-col min-w-0">
        <span className={`text-sm ${tone === 'error' ? 'text-red-300' : 'text-white/90'}`}>{title}</span>
        <span className="text-xs text-white/50">{description}</span>
      </div>
    </div>
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
      className="h-8 px-3 inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 hover:bg-white/10 text-white/90 text-[12px] font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  )
}
