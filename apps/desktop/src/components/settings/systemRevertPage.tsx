import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'

type RevertAction = 'temporary' | 'permanent' | 'delete'

type ActionState =
  | { phase: 'idle' }
  | { phase: 'confirming'; action: RevertAction }
  | { phase: 'running'; action: RevertAction }
  | { phase: 'done'; action: RevertAction; gpoBlocked: boolean; leftBehind: string[] }
  | { phase: 'error'; action: RevertAction; message: string }

interface RevertActionSpec {
  id: RevertAction
  label: string
  description: string
  actionLabel: string
  danger?: boolean
  run: () => Promise<RevertResult>
}

const ACTIONS: RevertActionSpec[] = [
  {
    id: 'temporary',
    label: 'Revert until next sign-in',
    description: 'Switch to Windows Explorer now. Alpine Shell takes over again the next time you sign in.',
    actionLabel: 'Revert',
    run: () => window.setup.revertTemporary(),
  },
  {
    id: 'permanent',
    label: 'Revert permanently',
    description: 'Make Windows Explorer your shell for good. Alpine Shell stays installed — open it from the Start menu to switch back.',
    actionLabel: 'Revert',
    run: () => window.setup.revertPermanent(),
  },
  {
    id: 'delete',
    label: 'Delete Alpine Shell',
    description: 'Revert to Windows Explorer and remove Alpine Shell completely — files, settings, shortcuts and registry entries. This cannot be undone.',
    actionLabel: 'Delete',
    danger: true,
    run: () => window.setup.uninstall(),
  },
]

const DONE_COPY: Record<RevertAction, { title: string; detail: string }> = {
  temporary: {
    title: 'Switching to Windows Explorer…',
    detail: 'Alpine Shell is closing. It will start again at your next sign-in.',
  },
  permanent: {
    title: 'Windows Explorer is now your shell.',
    detail: 'Alpine Shell is closing. Open it from the Start menu to switch back.',
  },
  delete: {
    title: 'Removing Alpine Shell…',
    detail: 'Alpine Shell is closing and will finish uninstalling in the background.',
  },
}

const GPO_WARNING = 'Your organisation’s policy controls the Windows shell, so this may not take effect at sign-in.'
const LEFT_BEHIND_WARNING = 'These folders could not be removed automatically and are still on disk:'

export default function SystemRevertPage() {
  const [state, setState] = useState<ActionState>({ phase: 'idle' })
  const isDev = import.meta.env.DEV

  async function runAction(spec: RevertActionSpec) {
    setState({ phase: 'running', action: spec.id })
    const result = await spec.run()
    if (result.success) setState({ phase: 'done', action: spec.id, gpoBlocked: result.gpoBlocked, leftBehind: result.leftBehind })
    else setState({ phase: 'error', action: spec.id, message: result.error ?? 'Something went wrong.' })
  }

  function doneWarning(gpoBlocked: boolean, leftBehind: string[]) {
    if (leftBehind.length > 0) return `${LEFT_BEHIND_WARNING} ${leftBehind.join(', ')}`
    return gpoBlocked ? GPO_WARNING : null
  }

  return (
    <div className="flex flex-col gap-6 w-full">
      <h1 className="text-2xl font-semibold tracking-tight">Revert back to Windows</h1>

      {state.phase === 'done' && (
        <Banner
          title={DONE_COPY[state.action].title}
          detail={DONE_COPY[state.action].detail}
          extra={doneWarning(state.gpoBlocked, state.leftBehind)}
        />
      )}

      {state.phase === 'error' && <Banner title="Couldn't complete that." detail={state.message} danger />}

      {isDev && (
        <div className="text-xs text-white/50">
          Unavailable in development — run an installed build to revert the shell.
        </div>
      )}

      {state.phase !== 'done' && (
        <div className="flex flex-col">
          {ACTIONS.map((spec) => (
            <Row
              key={spec.id}
              label={spec.label}
              description={spec.description}
              actionLabel={spec.actionLabel}
              danger={spec.danger}
              disabled={isDev || state.phase === 'running'}
              busy={state.phase === 'running' && state.action === spec.id}
              confirming={state.phase === 'confirming' && state.action === spec.id}
              onStart={() => setState({ phase: 'confirming', action: spec.id })}
              onConfirm={() => runAction(spec)}
              onCancel={() => setState({ phase: 'idle' })}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function Banner({
  title,
  detail,
  extra,
  danger,
}: {
  title: string
  detail: string
  extra?: string | null
  danger?: boolean
}) {
  return (
    <div
      className={`rounded-lg border px-4 py-3 flex items-start gap-3 ${
        danger ? 'border-red-500/30 bg-red-500/5' : 'border-white/10 bg-neutral-900'
      }`}
    >
      <AlertTriangle size={16} className={`shrink-0 mt-0.5 ${danger ? 'text-red-400' : 'text-amber-400'}`} />
      <div className="text-sm">
        <p className="text-white/90">{title}</p>
        <p className="text-white/50 text-xs mt-0.5">{detail}</p>
        {extra && <p className="text-amber-400/80 text-xs mt-1">{extra}</p>}
      </div>
    </div>
  )
}

function Row({
  label,
  description,
  actionLabel,
  danger,
  disabled,
  busy,
  confirming,
  onStart,
  onConfirm,
  onCancel,
}: {
  label: string
  description: string
  actionLabel: string
  danger?: boolean
  disabled: boolean
  busy: boolean
  confirming: boolean
  onStart: () => void
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-white/5 last:border-b-0">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-white/50 mt-0.5">{description}</div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {confirming ? (
          <>
            <button
              onClick={onCancel}
              className="h-8 px-3 rounded-md border border-white/10 bg-white/5 hover:bg-white/10 text-[12px] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={busy}
              className={`h-8 px-3 rounded-md text-[12px] font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                danger
                  ? 'bg-red-500 hover:bg-red-600 text-white'
                  : 'bg-white hover:bg-neutral-200 text-neutral-950'
              }`}
            >
              {busy ? 'Working…' : 'Confirm'}
            </button>
          </>
        ) : (
          <button
            onClick={onStart}
            disabled={disabled}
            className={`h-8 px-3 rounded-md border text-[12px] font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
              danger
                ? 'border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-300'
                : 'border-white/10 bg-white/5 hover:bg-white/10 text-white/90'
            }`}
          >
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  )
}
