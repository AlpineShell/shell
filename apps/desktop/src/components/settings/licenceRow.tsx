import { Badge, Button, Card, ConfirmButton, Row } from '@alpine/ui'
import { useLicence } from '../../hooks/useLicence'

const STATE_BADGE: Record<LicenceState, { tone: 'neutral' | 'success' | 'warning' | 'danger'; label: string }> = {
  development: { tone: 'neutral', label: 'Development build' },
  valid: { tone: 'success', label: 'Licensed' },
  grace: { tone: 'warning', label: 'Needs attention' },
  unlicensed: { tone: 'danger', label: 'Not licensed' },
  lapsed: { tone: 'danger', label: 'Lapsed' },
}

function formatVerified(iso: string | null) {
  const parsed = iso ? Date.parse(iso) : NaN
  if (!Number.isFinite(parsed)) return 'never'
  return new Date(parsed).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function licenceDescription(status: LicenceStatus) {
  if (!status.email && !status.licenceId) return 'No account is signed in on this PC.'
  const parts = [
    status.email,
    status.licenceId ? `licence ${status.licenceId}` : null,
    status.deviceName ? `on ${status.deviceName}` : null,
    `last verified ${formatVerified(status.lastRefreshAt)}`,
  ].filter(Boolean)
  return parts.join(', ')
}

export default function LicenceRow() {
  const { status, release, openAccount } = useLicence()
  const badge = STATE_BADGE[status.state]

  return (
    <Card variant="borderless" className="px-4 py-3.5">
      <Row label="Licence" description={licenceDescription(status)}>
        <div className="flex items-center gap-2">
          <Badge tone={badge.tone}>{badge.label}</Badge>
          <Button size="sm" variant="outline" onClick={() => openAccount()}>
            Manage licences
          </Button>
          {status.activationId && (
            <ConfirmButton
              size="sm"
              variant="ghost"
              confirmVariant="danger"
              label="Sign out of this PC"
              confirmLabel="Sign out"
              onConfirm={() => { release() }}
            />
          )}
        </div>
      </Row>
      {status.activationId && (
        <p className="mt-2 text-xs text-ink-quiet">
          Signing out hands this PC's desktop back to Windows Explorer at the next sign-in. You can sign in again any time to get it back.
        </p>
      )}
    </Card>
  )
}
