import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { ConfirmButton, PageTitle, Row } from '@alpine/ui'
import { settingsPage } from '../../settings/registry'
import { useTestSession } from '../../hooks/useTestSession'

type RevertAction = 'temporary' | 'permanent' | 'delete' | 'endTest'

type ActionState =
  | { phase: 'idle' }
  | { phase: 'running'; action: RevertAction }
  | { phase: 'done'; action: RevertAction; gpoBlocked: boolean; leftBehind: string[] }
  | { phase: 'error'; action: RevertAction; message: string }

interface RevertActionSpec {
  id: RevertAction
  label: string
  description: string
  actionLabel: string
  confirmLabel: string
  danger?: boolean
  run: () => Promise<RevertResult>
}

const ACTIONS: RevertActionSpec[] = [
  {
    id: 'temporary',
    label: 'Revert until next sign-in',
    description: 'Switch to Windows Explorer now. Alpine Shell takes over again the next time you sign in.',
    actionLabel: 'Revert',
    confirmLabel: 'Revert until sign-in',
    run: () => window.setup.revertTemporary(),
  },
  {
    id: 'permanent',
    label: 'Revert permanently',
    description: 'Make Windows Explorer your shell for good. Alpine Shell stays installed — open it from the Start menu to switch back.',
    actionLabel: 'Revert',
    confirmLabel: 'Revert permanently',
    run: () => window.setup.revertPermanent(),
  },
  {
    id: 'delete',
    label: 'Delete Alpine Shell',
    description: 'Revert to Windows Explorer and remove Alpine Shell completely — files, settings, shortcuts and registry entries. This cannot be undone.',
    actionLabel: 'Delete',
    confirmLabel: 'Delete Alpine Shell',
    danger: true,
    run: () => window.setup.uninstall(),
  },
]

const END_TEST_ACTION: RevertActionSpec = {
  id: 'endTest',
  label: 'Return to Windows',
  description: 'End the test and go back to Windows Explorer.',
  actionLabel: 'Return',
  confirmLabel: 'Return to Windows',
  run: () => window.setup.endTestSession(),
}

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
  endTest: {
    title: 'Switching to Windows Explorer…',
    detail: 'Alpine Shell is closing.',
  },
}

const GPO_WARNING = 'Your organisation’s policy controls the Windows shell, so this may not take effect at sign-in.'
const LEFT_BEHIND_WARNING = 'These folders could not be removed automatically and are still on disk:'

export default function SystemRevertPage() {
  const [state, setState] = useState<ActionState>({ phase: 'idle' })
  const testSession = useTestSession()
  const isDev = import.meta.env.DEV
  const actions = testSession ? [END_TEST_ACTION] : ACTIONS

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
      <PageTitle title={settingsPage('revert')?.label ?? ''} />

      {state.phase === 'done' && (
        <Banner
          title={DONE_COPY[state.action].title}
          detail={DONE_COPY[state.action].detail}
          extra={doneWarning(state.gpoBlocked, state.leftBehind)}
        />
      )}

      {state.phase === 'error' && <Banner title="Couldn't complete that." detail={state.message} danger />}

      {isDev && (
        <div className="text-xs text-ink-quiet">
          Unavailable in development — run an installed build to revert the shell.
        </div>
      )}

      {state.phase !== 'done' && testSession !== null && (
        <div className="flex flex-col gap-4">
          {actions.map((spec) => (
            <RevertRow
              key={spec.id}
              label={spec.label}
              description={spec.description}
              actionLabel={spec.actionLabel}
              confirmLabel={spec.confirmLabel}
              danger={spec.danger}
              disabled={isDev || state.phase === 'running'}
              busy={state.phase === 'running' && state.action === spec.id}
              onConfirm={() => runAction(spec)}
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
      className={`rounded-card border px-4 py-3 flex items-start gap-3 ${
        danger ? 'border-danger/30 bg-danger/10' : 'border-line-hairline bg-surface-2'
      }`}
    >
      <AlertTriangle size={16} className={`shrink-0 mt-0.5 ${danger ? 'text-danger' : 'text-warning'}`} />
      <div className="text-sm">
        <p className="text-ink-primary">{title}</p>
        <p className="text-ink-quiet text-xs mt-0.5">{detail}</p>
        {extra && <p className="text-warning text-xs mt-1">{extra}</p>}
      </div>
    </div>
  )
}

function RevertRow({
  label,
  description,
  actionLabel,
  confirmLabel,
  danger,
  disabled,
  busy,
  onConfirm,
}: {
  label: string
  description: string
  actionLabel: string
  confirmLabel: string
  danger?: boolean
  disabled: boolean
  busy: boolean
  onConfirm: () => void
}) {
  return (
    <Row label={label} info={description}>
      <ConfirmButton
        label={actionLabel}
        confirmLabel={confirmLabel}
        onConfirm={onConfirm}
        variant={danger ? 'dangerOutline' : 'outline'}
        confirmVariant={danger ? 'danger' : 'primary'}
        confirmOnly
        disabled={disabled}
        busy={busy}
        className="font-medium"
      />
    </Row>
  )
}
