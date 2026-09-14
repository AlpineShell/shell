import { useState, useEffect } from 'react'
import { Check, X, AlertTriangle, FlaskConical } from 'lucide-react'
import { Button, Card, IconButton, PageTitle, Row, Toggle } from '@alpine/ui'
import { useTheme } from '../../hooks/useTheme'

type Page = 'welcome' | 'options' | 'installing' | 'complete' | 'error'

const dragRegion = { WebkitAppRegion: 'drag' } as unknown as React.CSSProperties
const noDragRegion = { WebkitAppRegion: 'no-drag' } as unknown as React.CSSProperties

const wordmarkSource = 'url("./AlpineShellLogo.svg")'
const wordmarkMask: React.CSSProperties = {
  maskImage: wordmarkSource,
  WebkitMaskImage: wordmarkSource,
  maskSize: 'contain',
  WebkitMaskSize: 'contain',
  maskRepeat: 'no-repeat',
  WebkitMaskRepeat: 'no-repeat',
}

function OutcomeBadge({ tone, children }: OutcomeBadgeProps) {
  return (
    <div
      className={`flex h-12 w-12 items-center justify-center rounded-full ${
        tone === 'success' ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'
      }`}
    >
      {children}
    </div>
  )
}

function OutcomeNote({ tone, children }: OutcomeNoteProps) {
  return (
    <p className={`flex items-center gap-2 ${tone === 'warning' ? 'text-warning' : 'text-ink-quiet'}`}>
      {tone === 'warning' ? (
        <AlertTriangle size={11} className="shrink-0" />
      ) : (
        <Check size={11} className="shrink-0 text-success" />
      )}
      {children}
    </p>
  )
}

export default function SetupApp() {
  useTheme()

  const [page, setPage] = useState<Page>('welcome')
  const [installCursor, setInstallCursor] = useState(true)
  const [status, setStatus] = useState<SetupStatus | null>(null)
  const [result, setResult] = useState<SetupResult | null>(null)
  const [currentStep, setCurrentStep] = useState('')

  useEffect(() => {
    window.setup.status().then(setStatus)
    window.setup.onProgress(setCurrentStep)
  }, [])

  const isUpdate = !!status && !status.isFirstRun
  const verb = isUpdate ? 'Update' : 'Install'
  const verbIng = isUpdate ? 'Updating' : 'Installing'

  async function handleInstall() {
    setCurrentStep('')
    setPage('installing')
    const res = await window.setup.install({ shell: true, cursor: installCursor })
    setResult(res)
    setPage(res.error ? 'error' : 'complete')
  }

  function handleTestOut() {
    window.setup.testOut()
  }

  return (
    <div className="settings-scope flex h-screen w-screen flex-col overflow-hidden bg-surface-0 text-ink-primary">
      <div className="flex h-9 shrink-0 items-center justify-end px-2" style={dragRegion}>
        <div style={noDragRegion}>
          <IconButton label="Close" onClick={() => window.close()}>
            <X size={14} />
          </IconButton>
        </div>
      </div>

      <div className="flex flex-1 flex-col px-8 pt-1 pb-8">
        {page === 'welcome' && (
          <div className="flex flex-1 flex-col">
            <div className="flex flex-1 flex-col justify-center">
              <div className="aspect-[193/34] h-8 bg-ink-primary" style={wordmarkMask} role="img" aria-label="Alpine Shell" />
              <p className="mt-5 text-base text-ink-secondary">
                Welcome to a faster, cleaner Windows experience
              </p>
            </div>
            <div className="flex flex-col gap-2.5">
              <Button className="w-full" onClick={handleInstall}>
                {verb}
              </Button>
              {!isUpdate && (
                <Button className="w-full" variant="outline" onClick={handleTestOut}>
                  <FlaskConical size={14} />
                  Test Out
                  <span className="text-ink-quiet">Resets on restart</span>
                </Button>
              )}
              <Button className="w-full" variant="ghost" onClick={() => setPage('options')}>
                Customize {verb}
              </Button>
            </div>
          </div>
        )}

        {page === 'options' && (
          <div className="flex flex-1 flex-col justify-between">
            <div className="flex flex-col gap-5">
              <PageTitle title="Configure" subtitle="Choose what to set up." />

              {status?.gpoBlocked && (
                <div className="flex items-center gap-1.5 text-xs text-warning">
                  <AlertTriangle size={12} className="shrink-0" />
                  Group Policy may prevent shell replacement
                </div>
              )}

              <Card className="px-4 py-3.5">
                <Row label="Custom cursor" description="Install the Bibata cursor pack">
                  <Toggle label="Custom cursor" checked={installCursor} onChange={setInstallCursor} />
                </Row>
              </Card>
            </div>

            <div className="flex flex-col gap-2.5">
              <Button className="w-full" onClick={handleInstall}>
                {verb}
              </Button>
              <Button className="w-full" variant="ghost" onClick={() => setPage('welcome')}>
                Back
              </Button>
            </div>
          </div>
        )}

        {page === 'installing' && (
          <div className="flex flex-1 flex-col items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-line-strong border-t-ink-primary" />
            <p className="mt-5 text-sm text-ink-primary">{verbIng}</p>
            <p className="mt-2 h-4 text-xs text-ink-quiet">{currentStep}</p>
          </div>
        )}

        {page === 'error' && result && (
          <div className="flex flex-1 flex-col justify-between">
            <div className="flex flex-col gap-5">
              <OutcomeBadge tone="danger">
                <X size={24} strokeWidth={2.5} />
              </OutcomeBadge>
              <PageTitle title={isUpdate ? 'Update failed' : 'Installation failed'} />
              <p className="rounded-field border border-line-hairline bg-surface-2 px-3 py-2 font-mono text-xs break-all text-ink-secondary">
                {result.error}
              </p>
            </div>

            <div className="flex flex-col gap-2.5">
              <Button className="w-full" onClick={() => setPage('options')}>
                Try Again
              </Button>
              <Button className="w-full" variant="ghost" onClick={() => window.close()}>
                Close
              </Button>
            </div>
          </div>
        )}

        {page === 'complete' && result && (
          <div className="flex flex-1 flex-col justify-between">
            <div className="flex flex-col gap-5">
              <OutcomeBadge tone="success">
                <Check size={24} strokeWidth={2.5} />
              </OutcomeBadge>
              <PageTitle
                title={isUpdate ? 'Update complete' : 'Setup complete'}
                subtitle={`Restart your PC to ${isUpdate ? 'finish updating' : 'start using'} Alpine Shell.`}
              />

              <div className="flex flex-col gap-1.5 text-xs">
                {result.shell && <OutcomeNote tone="done">Set as default desktop environment</OutcomeNote>}
                {result.startup && <OutcomeNote tone="done">Added to startup</OutcomeNote>}
                {result.cursor && <OutcomeNote tone="done">Custom cursor installed</OutcomeNote>}
                {result.gpoBlocked && (
                  <OutcomeNote tone="warning">Group Policy may have blocked shell replacement</OutcomeNote>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              <Button className="w-full" onClick={() => window.setup.restartWindows()}>
                Restart Now
              </Button>
              <Button className="w-full" variant="ghost" onClick={() => window.close()}>
                Restart Later
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
