import { useState, useEffect, useRef } from 'react'
import { Check, X, AlertTriangle, FlaskConical, Settings } from 'lucide-react'
import { Button, Card, IconButton, PageTitle, Row, Select, Toggle } from '@alpine/ui'
import { useTheme } from '../../hooks/useTheme'
import { useFitSetupWindow } from '../../hooks/useFitSetupWindow'

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

function cursorStyleLabel(style: string) {
  return style.replace(/^Bibata-/, '').replace('-', ' ')
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

  const frame = useRef<HTMLDivElement>(null)
  useFitSetupWindow(frame)

  const [page, setPage] = useState<Page>('welcome')
  const [installCursor, setInstallCursor] = useState(true)
  const [pickedCursorStyle, setPickedCursorStyle] = useState<string | null>(null)
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
  const installing = page === 'installing'
  const cursorStyle = pickedCursorStyle ?? status?.defaultCursorStyle ?? ''

  async function handleInstall() {
    setCurrentStep('')
    setPage('installing')
    const res = await window.setup.install({ shell: true, cursor: installCursor, cursorStyle })
    setResult(res)
    setPage(res.error ? 'error' : 'complete')
  }

  function handleTestOut() {
    window.setup.testOut()
  }

  return (
    <div ref={frame} className="settings-scope flex w-screen flex-col bg-surface-0 text-ink-primary">
      <div className="flex h-9 shrink-0 items-center justify-end px-2" style={dragRegion}>
        <div style={noDragRegion}>
          <IconButton label="Close" onClick={() => window.close()}>
            <X size={14} />
          </IconButton>
        </div>
      </div>

      <div className="px-8 pb-8">
        {(page === 'welcome' || installing) && (
          <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-5">
              <div className="aspect-[193/34] h-8 bg-ink-primary" style={wordmarkMask} role="img" aria-label="Alpine Shell" />
              <p className="text-base text-ink-secondary">
                {installing && currentStep ? currentStep : 'Welcome to a faster, cleaner Windows experience'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button className="flex-1" busy={installing} onClick={handleInstall}>
                {installing ? verbIng : verb}
              </Button>
              <IconButton
                label={`Customize ${verb.toLowerCase()}`}
                shape="round"
                tooltip="topEnd"
                disabled={installing}
                onClick={() => setPage('options')}
              >
                <Settings size={16} />
              </IconButton>
              {!isUpdate && (
                <IconButton
                  label="Test out, resets on restart"
                  shape="round"
                  tooltip="topEnd"
                  disabled={installing}
                  onClick={handleTestOut}
                >
                  <FlaskConical size={16} />
                </IconButton>
              )}
            </div>
          </div>
        )}

        {page === 'options' && (
          <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-5">
              <PageTitle title="Configure" subtitle="Choose what to set up." />

              {status?.gpoBlocked && (
                <div className="flex items-center gap-1.5 text-xs text-warning">
                  <AlertTriangle size={12} className="shrink-0" />
                  Group Policy may prevent shell replacement
                </div>
              )}

              <Card variant="borderless" className="px-4 py-3.5">
                <Row label="Custom cursor" description="Install the Bibata cursor pack">
                  <Toggle label="Custom cursor" checked={installCursor} onChange={setInstallCursor} />
                </Row>
              </Card>

              {installCursor && status && (
                <Card variant="borderless" className="px-4 py-3.5">
                  <Row label="Cursor style" description="Modern is rounded, Original is sharp">
                    <Select
                      label="Cursor style"
                      options={status.cursorStyles.map((style) => ({ value: style, label: cursorStyleLabel(style) }))}
                      value={cursorStyle}
                      onChange={setPickedCursorStyle}
                    />
                  </Row>
                </Card>
              )}
            </div>

            <Button className="w-full" onClick={() => setPage('welcome')}>
              Done
            </Button>
          </div>
        )}

        {page === 'error' && result && (
          <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-4">
                <OutcomeBadge tone="danger">
                  <X size={24} strokeWidth={2.5} />
                </OutcomeBadge>
                <PageTitle title={isUpdate ? 'Update failed' : 'Installation failed'} />
              </div>
              <p className="max-h-20 overflow-y-auto rounded-field border border-line-hairline bg-surface-2 px-3 py-2 font-mono text-xs break-all text-ink-secondary">
                {result.error}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button className="flex-1" onClick={() => setPage('welcome')}>
                Try Again
              </Button>
              <Button variant="ghost" onClick={() => window.close()}>
                Close
              </Button>
            </div>
          </div>
        )}

        {page === 'complete' && result && (
          <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-4">
                <OutcomeBadge tone="success">
                  <Check size={24} strokeWidth={2.5} />
                </OutcomeBadge>
                <PageTitle
                  title={isUpdate ? 'Update complete' : 'Setup complete'}
                  subtitle={`Restart your PC to ${isUpdate ? 'finish updating' : 'start using'} Alpine Shell.`}
                />
              </div>

              <div className="flex flex-col gap-1.5 text-xs">
                {result.shell && <OutcomeNote tone="done">Set as default desktop environment</OutcomeNote>}
                {result.startup && <OutcomeNote tone="done">Added to startup</OutcomeNote>}
                {result.cursor && <OutcomeNote tone="done">Custom cursor installed</OutcomeNote>}
                {result.gpoBlocked && (
                  <OutcomeNote tone="warning">Group Policy may have blocked shell replacement</OutcomeNote>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button className="flex-1" onClick={() => window.setup.restartWindows()}>
                Restart Now
              </Button>
              <Button variant="ghost" onClick={() => window.close()}>
                Restart Later
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
