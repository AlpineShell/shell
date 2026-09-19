import { Badge, Button, Card, ConfirmButton, Row } from '@alpine/ui'
import { useLicence } from '../../hooks/useLicence'

const STATE_BADGE: Record<LicenceState, { tone: 'neutral' | 'success' | 'danger'; label: string }> = {
  development: { tone: 'neutral', label: 'Development build' },
  valid: { tone: 'success', label: 'Licensed' },
  unlicensed: { tone: 'danger', label: 'Not licensed' },
}

const SIGN_OUT_NOTE = 'Signing out frees this licence for another PC. Alpine Shell keeps working here without updates and asks you to sign in again the next time it starts.'
const BINDING_LOST_NOTE = 'This PC no longer matches the licence it was activated with, which happens after a cleared TPM, a new motherboard, a rebuilt Windows profile or a Windows reinstall. Sign in again to put it back; the same PC does not take another seat.'

const BINDING_LABEL: Record<LicenceBindingTier, string> = {
  tpm: 'held in this PC’s TPM',
  dpapi: 'sealed to this Windows profile',
  machine: 'tied to this PC’s hardware ids',
}

function formatActivated(iso: string | null) {
  const parsed = iso ? Date.parse(iso) : NaN
  if (!Number.isFinite(parsed)) return null
  return `activated ${new Date(parsed).toLocaleDateString(undefined, { dateStyle: 'medium' })}`
}

function licenceDescription(status: LicenceStatus) {
  if (!status.email && !status.licenceId) return 'No account is signed in on this PC.'
  const parts = [
    status.email,
    status.licenceId ? `licence ${status.licenceId}` : null,
    status.deviceName ? `on ${status.deviceName}` : null,
    formatActivated(status.activatedAt),
    status.bindTier ? BINDING_LABEL[status.bindTier] : null,
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
      {status.state === 'unlicensed' && status.reason === 'binding-mismatch' && <p className="mt-2 text-xs text-warning">{BINDING_LOST_NOTE}</p>}
      {status.activationId && <p className="mt-2 text-xs text-ink-quiet">{SIGN_OUT_NOTE}</p>}
    </Card>
  )
}
