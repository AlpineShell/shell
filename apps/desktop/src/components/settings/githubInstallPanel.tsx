import { useState } from 'react'
import { AlertTriangle, Download, Link } from 'lucide-react'
import { Badge, Button, Card, TextField } from '@alpine/ui'

const SHORT_COMMIT_LENGTH = 7

const ERROR_MESSAGES: Record<string, string> = {
  'bad-release-url': 'That is not a GitHub release link.',
  'release-not-found': 'No release found at that link.',
  'release-is-draft': 'That release is still a draft.',
  'no-bundle': 'That release has no .alpineplugin file.',
  'several-bundles': 'That release has more than one .alpineplugin file.',
  'github-unavailable': "Couldn't reach GitHub. Try again.",
  'too-large': 'The plugin file is too large.',
  'already-installed': 'A plugin with this id is already installed.',
  expired: 'This took too long. Check the link again.',
}

function errorMessage(error: string): string {
  return ERROR_MESSAGES[error] ?? "Couldn't install. Try again."
}

function ReleaseFact({ label, value }: GithubReleaseFactProps) {
  return (
    <>
      <dt className="text-ink-quiet">{label}</dt>
      <dd className="truncate font-mono text-ink-primary select-text">{value}</dd>
    </>
  )
}

function InlineError({ message }: InlineInstallErrorProps) {
  return (
    <p className="flex items-center gap-2 text-xs text-warning select-text">
      <AlertTriangle size={12} className="shrink-0" />
      {message}
    </p>
  )
}

export default function GithubInstallPanel({ onInstalled, onClose }: GithubInstallPanelProps) {
  const [state, setState] = useState<GithubInstallStep>({ step: 'link', url: '', busy: false, error: null })

  async function resolve() {
    if (state.step !== 'link' || state.busy || !state.url.trim()) return
    const url = state.url.trim()
    setState({ ...state, busy: true, error: null })
    const result = await window.plugins.github
      .resolve(url)
      .catch((): GithubResolveResult => ({ ok: false, error: 'github-unavailable' }))
    if (result.ok) {
      setState({ step: 'confirm', url, token: result.token, release: result.release, busy: false, error: null })
      return
    }
    setState({ step: 'link', url, busy: false, error: errorMessage(result.error) })
  }

  async function install() {
    if (state.step !== 'confirm' || state.busy) return
    setState({ ...state, busy: true, error: null })
    const result = await window.plugins.github
      .install(state.token)
      .catch((e): GithubInstallResult => ({ ok: false, error: 'install-failed', detail: String(e) }))
    if (result.ok) {
      onInstalled()
      return
    }
    console.error('[plugins] GitHub install failed:', result.error, result.detail)
    if (result.error === 'expired') {
      setState({ step: 'link', url: state.url, busy: false, error: errorMessage(result.error) })
      return
    }
    setState({ ...state, busy: false, error: errorMessage(result.error) })
  }

  if (state.step === 'link') {
    return (
      <Card className="flex flex-col gap-3 p-3.5">
        <div className="flex items-center gap-2">
          <TextField
            label="GitHub release link"
            value={state.url}
            onChange={(url) => setState({ ...state, url, error: null })}
            onSubmit={resolve}
            placeholder="https://github.com/owner/repo/releases/tag/v1.0.0"
            type="url"
            icon={<Link size={13} />}
            invalid={state.error !== null}
            className="flex-1"
          />
          <Button shape="square" size="sm" busy={state.busy} disabled={!state.url.trim()} onClick={resolve}>
            Continue
          </Button>
          <Button shape="square" size="sm" variant="ghost" disabled={state.busy} onClick={onClose}>
            Cancel
          </Button>
        </div>
        {state.error && <InlineError message={state.error} />}
      </Card>
    )
  }

  const { release } = state
  return (
    <Card className="flex flex-col gap-3 p-3.5">
      <div>
        <Badge tone="warning">
          <AlertTriangle size={12} /> Not reviewed by Alpine Shell
        </Badge>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
        <ReleaseFact label="Owner" value={release.owner} />
        <ReleaseFact label="Repository" value={release.repo} />
        <ReleaseFact label="Tag" value={release.tag} />
        <ReleaseFact label="Commit" value={release.commit.slice(0, SHORT_COMMIT_LENGTH)} />
      </dl>
      {state.error && <InlineError message={state.error} />}
      <div className="flex items-center gap-2">
        <Button shape="square" size="sm" variant="primary" icon={<Download size={13} />} busy={state.busy} onClick={install}>
          Install
        </Button>
        <Button shape="square" size="sm" variant="ghost" disabled={state.busy} onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Card>
  )
}
