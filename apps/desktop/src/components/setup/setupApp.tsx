import { useState, useEffect, useRef } from 'react'
import { X, AlertTriangle, FlaskConical, Settings, Link } from 'lucide-react'
import { Button, Card, IconButton, PageTitle, Row, Spinner, Ticket, Toggle } from '@alpine/ui'
import { usePaperPalette } from '../../hooks/usePaperPalette'
import { useFitSetupWindow } from '../../hooks/useFitSetupWindow'
import GoogleMark from './googleMark'

type SignInRetry = 'signIn' | 'activate'

interface SignInProblem {
  message: string
  buttonLabel: string
  retry: SignInRetry
}

const LICENCE_REQUIRED = 'licence-required'
const LICENSED_STATES: ReadonlySet<LicenceState> = new Set(['development', 'valid'])
const SIGN_IN_PROMPT = 'Sign in with your Alpine Shell account to install'
const BINDING_LOST_PROMPT = 'This PC no longer matches the licence it was activated with. That happens after a cleared TPM, a new motherboard, a rebuilt Windows profile or a Windows reinstall. Sign in to put it back; the same PC does not take another seat. If every seat is in use, release the old entry for this PC on your account page, then sign in.'
const OTHER_PC_PROMPT = 'The licence on this PC was issued to another PC. Sign in to activate this one.'
const WELCOME_PROMPT = 'Welcome to a faster, cleaner Windows experience'
const UNREACHABLE_MESSAGE = 'Could not reach alpineshell.com.'

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

const idleProgress: LicenceSignInProgress = { phase: 'idle', userCode: null, verificationUri: null, outcome: null, error: null }

function requestedPage(): SetupPage | null {
  const page = new URLSearchParams(window.location.search).get('page')
  return page === 'signIn' ? 'signIn' : null
}

function isLicensed(licence: LicenceStatus) {
  return LICENSED_STATES.has(licence.state)
}

function bindingLost(licence: LicenceStatus | null) {
  return licence?.state === 'unlicensed' && licence.reason === 'binding-mismatch'
}

function signInPrompt(licence: LicenceStatus | null) {
  if (bindingLost(licence)) return BINDING_LOST_PROMPT
  if (licence?.state === 'unlicensed' && licence.reason === 'device-mismatch') return OTHER_PC_PROMPT
  return SIGN_IN_PROMPT
}

function formatDate(iso: string | null) {
  const parsed = iso ? Date.parse(iso) : NaN
  if (!Number.isFinite(parsed)) return 'soon'
  return new Date(parsed).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}

function seatDetail(seat: LicenceSeatActivation) {
  const parsed = seat.activatedAt ? Date.parse(seat.activatedAt) : NaN
  if (!Number.isFinite(parsed)) return 'Using this licence'
  return `Activated ${new Date(parsed).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
}

function problemForPhase(progress: LicenceSignInProgress): SignInProblem | null {
  if (progress.phase === 'denied') return { message: 'You denied the request.', buttonLabel: 'Try again', retry: 'signIn' }
  if (progress.phase === 'expired') return { message: 'This code expired, start again.', buttonLabel: 'Try again', retry: 'signIn' }
  if (progress.phase === 'error') {
    const message = progress.error === 'unreachable' ? UNREACHABLE_MESSAGE : `Sign-in failed (${progress.error ?? 'unknown'}).`
    return { message, buttonLabel: progress.error === 'unreachable' ? 'Retry' : 'Try again', retry: 'signIn' }
  }
  return null
}

function problemForOutcome(outcome: LicenceActivationOutcome): SignInProblem | null {
  switch (outcome.kind) {
    case 'session-expired':
      return { message: 'Your sign-in expired.', buttonLabel: 'Sign in again', retry: 'signIn' }
    case 'device-unreadable':
      return { message: "Could not read this PC's identity.", buttonLabel: 'Retry', retry: 'activate' }
    case 'unreachable':
      return { message: UNREACHABLE_MESSAGE, buttonLabel: 'Retry', retry: 'activate' }
    case 'mode-mismatch':
      return { message: 'This licence was bought in test mode.', buttonLabel: 'Use another account', retry: 'signIn' }
    case 'error':
      return { message: `Activation failed (${outcome.message}).`, buttonLabel: 'Try again', retry: 'signIn' }
    default:
      return null
  }
}

function seatProblem(outcome: LicenceActivationOutcome): string | null {
  if (outcome.kind === 'move-limit') return `This licence already moved to another PC in the last six months. Write to support@alpineshell.com to move it now, or move it yourself on ${formatDate(outcome.retryAt)}.`
  if (outcome.kind === 'replacement-not-yours') return 'That PC is not on one of your licences.'
  return null
}

interface ProgressRoute {
  page: SetupPage
  problem?: SignInProblem | null
  seats?: LicenceSeatActivation[]
  seatMessage?: string | null
  accountEmail?: string | null
}

function routeForOutcome(outcome: LicenceActivationOutcome): ProgressRoute {
  switch (outcome.kind) {
    case 'activated':
      return { page: 'welcome', problem: null }
    case 'no-licence':
      return { page: 'noLicence', accountEmail: outcome.email }
    case 'seats-in-use':
      return { page: 'seatsInUse', seats: outcome.activations, seatMessage: null }
    case 'move-limit':
    case 'replacement-not-yours':
      return { page: 'seatsInUse', seatMessage: seatProblem(outcome) }
    default:
      return { page: 'signIn', problem: problemForOutcome(outcome) }
  }
}

function routeForProgress(progress: LicenceSignInProgress): ProgressRoute | null {
  if (progress.phase === 'waiting') return { page: 'waiting' }
  const phaseProblem = problemForPhase(progress)
  if (phaseProblem) return { page: 'signIn', problem: phaseProblem }
  if (progress.phase === 'done' && progress.outcome) return routeForOutcome(progress.outcome)
  return null
}

function initialPage(licence: LicenceStatus): SetupPage {
  return requestedPage() ?? (isLicensed(licence) ? 'welcome' : 'signIn')
}

function Wordmark() {
  return <div className="aspect-[193/34] h-8 bg-ink-primary" style={wordmarkMask} role="img" aria-label="Alpine Shell" />
}

function FailureBadge() {
  return (
    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-danger/10 text-danger">
      <X size={24} strokeWidth={2.5} />
    </div>
  )
}

const SERIAL_LENGTH = 8

function licenceSerial(licenceId: string) {
  const serial = licenceId.replace(/-/g, '').slice(0, SERIAL_LENGTH).toUpperCase()
  return `${serial.slice(0, SERIAL_LENGTH / 2)}-${serial.slice(SERIAL_LENGTH / 2)}`
}

function LicenceTicket({ licence }: { licence: LicenceStatus }) {
  return (
    <Ticket
      title="Alpine Shell licence"
      serial={licence.licenceId ? licenceSerial(licence.licenceId) : undefined}
      serialTitle={licence.licenceId ?? undefined}
      detail={licence.email ?? undefined}
      stamps={[{ label: 'Activated', tone: 'success' }]}
      size="compact"
    />
  )
}

export default function SetupApp() {
  usePaperPalette()

  const frame = useRef<HTMLDivElement>(null)
  useFitSetupWindow(frame)

  const [page, setPage] = useState<SetupPage | null>(null)
  const [installCursor, setInstallCursor] = useState(true)
  const [status, setStatus] = useState<SetupStatus | null>(null)
  const [licence, setLicence] = useState<LicenceStatus | null>(null)
  const [progress, setProgress] = useState<LicenceSignInProgress>(idleProgress)
  const [seats, setSeats] = useState<LicenceSeatActivation[]>([])
  const [problem, setProblem] = useState<SignInProblem | null>(null)
  const [seatMessage, setSeatMessage] = useState<string | null>(null)
  const [accountEmail, setAccountEmail] = useState<string | null>(null)
  const [result, setResult] = useState<SetupResult | null>(null)
  const [currentStep, setCurrentStep] = useState('')

  useEffect(() => {
    const applyProgress = (next: LicenceSignInProgress) => {
      setProgress(next)
      const route = routeForProgress(next)
      if (!route) return
      setPage(route.page)
      if (route.problem !== undefined) setProblem(route.problem)
      if (route.seats !== undefined) setSeats(route.seats)
      if (route.seatMessage !== undefined) setSeatMessage(route.seatMessage)
      if (route.accountEmail !== undefined) setAccountEmail(route.accountEmail)
    }
    const applyLicence = (next: LicenceStatus) => {
      setLicence(next)
      setPage((current) => (current === null ? initialPage(next) : current === 'signIn' && isLicensed(next) ? 'welcome' : current))
    }
    window.setup.status().then(setStatus)
    window.setup.onProgress(setCurrentStep)
    window.licence.status().then(applyLicence)
    window.licence.signInState().then(applyProgress)
    const stopChanged = window.licence.onChanged(applyLicence)
    const stopProgress = window.licence.onSignInProgress(applyProgress)
    return () => {
      stopChanged()
      stopProgress()
    }
  }, [])

  const isUpdate = !!status && !status.isFirstRun
  const restoreShell = isUpdate && !!status && !status.isShell
  const verb = isUpdate ? 'Update' : 'Install'
  const verbIng = isUpdate ? 'Updating' : 'Installing'
  const installing = page === 'installing'
  const activating = progress.phase === 'activating'
  const startingSignIn = progress.phase === 'starting'
  const email = licence?.email ?? null

  function startSignIn() {
    setProblem(null)
    window.licence.signIn()
  }

  function retrySignIn() {
    const retry = problem?.retry ?? 'signIn'
    setProblem(null)
    if (retry === 'activate') window.licence.activate()
    else window.licence.signIn()
  }

  async function useAnotherAccount() {
    await window.licence.cancelSignIn()
    setProblem(null)
    setSeatMessage(null)
    window.licence.signIn()
  }

  async function cancelSignIn() {
    await window.licence.cancelSignIn()
    setProblem(null)
    setPage('signIn')
  }

  function copyVerificationLink() {
    if (progress.verificationUri) navigator.clipboard.writeText(progress.verificationUri).catch(() => undefined)
  }

  async function handleInstall() {
    setCurrentStep('')
    setPage('installing')
    try {
      const res = await window.setup.install({ shell: true, cursor: installCursor })
      setResult(res)
      setPage(res.error ? 'error' : 'complete')
    } catch (e) {
      setResult({ shell: false, startup: false, cursor: false, gpoBlocked: false, error: e instanceof Error ? e.message : String(e) })
      setPage('error')
    }
  }

  async function handleRestoreShell() {
    setCurrentStep('')
    setPage('installing')
    const res = await window.setup.setShell()
    if (res.success) {
      setPage('complete')
      return
    }
    setResult({ shell: false, startup: false, cursor: false, gpoBlocked: false, error: res.error ?? 'Could not register Alpine Shell as your desktop.' })
    setPage('error')
  }

  async function handleTestOut() {
    const res = await window.setup.testOut()
    if (res && res.error) {
      setResult({ shell: false, startup: false, cursor: false, gpoBlocked: false, error: res.error })
      setPage('error')
    }
  }

  const licenceRequired = result?.error === LICENCE_REQUIRED
  const prompt = problem ? problem.message : signInPrompt(licence)
  const promptExplains = !problem && prompt !== SIGN_IN_PROMPT

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
        {page === null && (
          <div className="flex items-center gap-3 text-sm text-ink-secondary">
            <Spinner size={14} label="Loading" />
            Checking this PC
          </div>
        )}

        {page === 'signIn' && (
          <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-5">
              <Wordmark />
              <p className={`${promptExplains ? 'text-sm' : 'text-base'} ${problem ? 'text-warning' : 'text-ink-secondary'}`}>{prompt}</p>
            </div>
            <div className="flex flex-col gap-2">
              <Button
                className="w-full"
                icon={problem ? undefined : <GoogleMark />}
                busy={startingSignIn || activating}
                onClick={problem ? retrySignIn : startSignIn}
              >
                {problem ? problem.buttonLabel : 'Continue with Google'}
              </Button>
              {bindingLost(licence) && (
                <Button className="w-full" variant="ghost" onClick={() => window.licence.openAccount()}>
                  Open my account page
                </Button>
              )}
            </div>
          </div>
        )}

        {page === 'waiting' && (
          <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-5">
              <PageTitle title="Approve this PC in your browser" subtitle="Check that the page shows this code, then approve." />
              <Card className="flex items-center justify-center px-4 py-4">
                {activating ? (
                  <div className="flex items-center gap-3 text-sm text-ink-secondary">
                    <Spinner size={14} label="Activating" />
                    Activating this PC
                  </div>
                ) : (
                  <span className="font-display text-3xl tracking-[0.2em] text-ink-primary tabular-nums" aria-label="Device code">
                    {progress.userCode ?? ''}
                  </span>
                )}
              </Card>
            </div>
            <div className="flex items-center gap-2">
              <Button className="flex-1" variant="outline" icon={<Link size={14} />} disabled={!progress.verificationUri} onClick={copyVerificationLink}>
                Copy link
              </Button>
              <Button variant="ghost" onClick={cancelSignIn}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {page === 'noLicence' && (
          <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-5">
              <PageTitle title={`No licence on ${accountEmail ?? email ?? 'this account'} yet.`} subtitle="Buy one in your browser; this installer continues by itself." />
            </div>
            <div className="flex flex-col gap-2">
              <Button className="w-full" onClick={() => window.licence.openCheckout()}>
                Buy a licence
              </Button>
              <div className="flex items-center gap-2">
                <Button className="flex-1" variant="outline" busy={activating} onClick={() => window.licence.activate()}>
                  Check again
                </Button>
                <Button variant="ghost" onClick={useAnotherAccount}>
                  Use another account
                </Button>
              </div>
            </div>
          </div>
        )}

        {page === 'seatsInUse' && (
          <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-5">
              <PageTitle title="All your licences are in use." subtitle="Move one to this PC, or buy another." />
              {seatMessage && (
                <div className="flex items-center gap-1.5 text-xs text-warning">
                  <AlertTriangle size={12} className="shrink-0" />
                  {seatMessage}
                </div>
              )}
              <Card className="flex flex-col gap-3 px-4 py-3.5">
                {seats.map((seat) => (
                  <Row key={seat.id} label={seat.deviceName || 'Unnamed PC'} description={seatDetail(seat)}>
                    <Button size="sm" variant="outline" busy={activating} onClick={() => window.licence.activate({ replaceActivationId: seat.id })}>
                      Use it here instead
                    </Button>
                  </Row>
                ))}
              </Card>
            </div>
            <div className="flex items-center gap-2">
              <Button className="flex-1" onClick={() => window.licence.openCheckout()}>
                Buy another licence
              </Button>
              <Button variant="ghost" onClick={useAnotherAccount}>
                Use another account
              </Button>
            </div>
          </div>
        )}

        {(page === 'welcome' || installing) && (
          <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-5">
              <Wordmark />
              <p className="text-base text-ink-secondary">
                {installing && currentStep ? currentStep : WELCOME_PROMPT}
              </p>
              {licence && email && <LicenceTicket licence={licence} />}
            </div>
            {restoreShell ? (
              <Button className="w-full" busy={installing} onClick={handleRestoreShell}>
                {installing ? 'Registering' : 'Make Alpine Shell my desktop again'}
              </Button>
            ) : (
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
            )}
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

              <Card className="px-4 py-3.5">
                <Row label="Custom cursor" description="Install the Bibata cursor pack">
                  <Toggle label="Custom cursor" checked={installCursor} onChange={setInstallCursor} />
                </Row>
              </Card>
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
                <FailureBadge />
                <PageTitle title={licenceRequired ? 'Sign in first' : isUpdate ? 'Update failed' : 'Installation failed'} />
              </div>
              {licenceRequired ? (
                <p className="text-sm text-ink-secondary">Alpine Shell needs a licence on this PC before it can become your desktop.</p>
              ) : (
                <p className="max-h-20 overflow-y-auto rounded-field border border-line-hairline bg-surface-2 px-3 py-2 font-mono text-xs break-all text-ink-secondary">
                  {result.error}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2">
              {licenceRequired ? (
                <Button className="flex-1" onClick={() => { setProblem(null); setPage('signIn') }}>
                  Sign in
                </Button>
              ) : (
                <Button className="flex-1" onClick={() => setPage('welcome')}>
                  Try Again
                </Button>
              )}
              <Button variant="ghost" onClick={() => window.close()}>
                Close
              </Button>
            </div>
          </div>
        )}

        {page === 'complete' && (
          <div className="flex flex-col gap-8">
            <PageTitle
              title={isUpdate ? (restoreShell ? 'Alpine Shell is your desktop again' : 'Update complete') : 'Setup complete'}
              subtitle={`Restart your PC to ${isUpdate ? (restoreShell ? 'bring it back' : 'finish updating') : 'start using'} Alpine Shell.`}
            />

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
