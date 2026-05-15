import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'

type ActionState = 'idle' | 'confirmRevert' | 'confirmDelete' | 'reverted' | 'deleted'

export default function SystemRevertPage() {
  const [state, setState] = useState<ActionState>('idle')

  async function handleRevert() {
    await window.setup.revertShell()
    setState('reverted')
  }

  async function handleDelete() {
    await window.setup.uninstall()
    setState('deleted')
  }

  const done = state === 'reverted' || state === 'deleted'

  return (
    <div className="flex flex-col gap-6 w-full">
      <h1 className="text-2xl font-semibold tracking-tight">Revert back to Windows</h1>

      {done && (
        <div className="rounded-lg border border-white/10 bg-neutral-900 px-4 py-3 flex items-start gap-3">
          <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="text-white/90">
              {state === 'reverted' ? 'Reverted to Windows Explorer.' : 'Alpine Shell has been removed.'}
            </p>
            <p className="text-white/50 text-xs mt-0.5">
              Sign out or restart to complete{state === 'deleted' ? ' uninstallation' : ''}.
            </p>
          </div>
        </div>
      )}

      {!done && (
        <div className="flex flex-col">
          <Row
            label="Revert but keep Alpine Shell"
            description="Switch back to Windows Explorer. Files stay installed so you can switch back later."
            actionLabel="Revert"
            confirming={state === 'confirmRevert'}
            onStart={() => setState('confirmRevert')}
            onConfirm={handleRevert}
            onCancel={() => setState('idle')}
          />
          <Row
            label="Delete Alpine Shell"
            description="Permanently remove Alpine Shell — registry entries, installed files, and shortcuts. This cannot be undone."
            actionLabel="Delete"
            danger
            confirming={state === 'confirmDelete'}
            onStart={() => setState('confirmDelete')}
            onConfirm={handleDelete}
            onCancel={() => setState('idle')}
          />
        </div>
      )}
    </div>
  )
}

function Row({
  label,
  description,
  actionLabel,
  danger,
  confirming,
  onStart,
  onConfirm,
  onCancel,
}: {
  label: string
  description: string
  actionLabel: string
  danger?: boolean
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
              className={`h-8 px-3 rounded-md text-[12px] font-medium transition-colors cursor-pointer ${
                danger
                  ? 'bg-red-500 hover:bg-red-600 text-white'
                  : 'bg-white hover:bg-neutral-200 text-neutral-950'
              }`}
            >
              Confirm
            </button>
          </>
        ) : (
          <button
            onClick={onStart}
            className={`h-8 px-3 rounded-md border text-[12px] font-medium transition-colors cursor-pointer ${
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
