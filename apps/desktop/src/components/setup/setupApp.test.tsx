import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'

import SetupApp from './setupApp'

class ResizeObserverStub {
  observe() {}
  disconnect() {}
  unobserve() {}
}

const idleProgress: LicenceSignInProgress = { phase: 'idle', userCode: null, verificationUri: null, outcome: null, error: null }
const THEME: ThemeState = { name: 'dark', background: '#202020' }

function licenceStatus(overrides: Partial<LicenceStatus> = {}): LicenceStatus {
  return {
    state: 'unlicensed',
    reason: null,
    graceUntil: null,
    email: null,
    licenceId: null,
    activationId: null,
    deviceName: null,
    expiresAt: null,
    lastRefreshAt: null,
    movedTo: null,
    deviceReadable: true,
    releaseBuild: true,
    ...overrides,
  }
}

function setupStatus(overrides: Partial<SetupStatus> = {}): SetupStatus {
  return {
    isShell: false,
    hasStartup: false,
    hasCursor: false,
    gpoBlocked: false,
    isInstalled: false,
    installedVersion: null,
    currentVersion: '1.0.0',
    isFirstRun: true,
    ...overrides,
  }
}

interface Bridge {
  licence: LicenceStatus
  setup: SetupStatus
  progressListeners: Array<(progress: LicenceSignInProgress) => void>
  changedListeners: Array<(status: LicenceStatus) => void>
  signIn: ReturnType<typeof vi.fn>
  activate: ReturnType<typeof vi.fn>
  install: ReturnType<typeof vi.fn>
  setShell: ReturnType<typeof vi.fn>
  testOut: ReturnType<typeof vi.fn>
  openCheckout: ReturnType<typeof vi.fn>
}

function installBridge({ licence = licenceStatus(), setup = setupStatus() }: { licence?: LicenceStatus; setup?: SetupStatus } = {}): Bridge {
  const bridge: Bridge = {
    licence,
    setup,
    progressListeners: [],
    changedListeners: [],
    signIn: vi.fn(async () => idleProgress),
    activate: vi.fn(async () => ({ kind: 'session-expired' })),
    install: vi.fn(async () => ({ shell: true, startup: true, cursor: true, gpoBlocked: false, error: null })),
    setShell: vi.fn(async () => ({ success: true, error: null })),
    testOut: vi.fn(async () => ({ error: null })),
    openCheckout: vi.fn(async () => undefined),
  }
  ;(window as unknown as { shell: unknown }).shell = {
    theme: { initial: THEME, get: async () => THEME, onChanged: () => () => {} },
  }
  ;(window as unknown as { setup: unknown }).setup = {
    status: async () => bridge.setup,
    onProgress: () => {},
    fitWindowHeight: () => {},
    install: bridge.install,
    setShell: bridge.setShell,
    testOut: bridge.testOut,
    restartWindows: async () => {},
  }
  ;(window as unknown as { licence: unknown }).licence = {
    status: async () => bridge.licence,
    signInState: async () => idleProgress,
    onChanged: (listener: (status: LicenceStatus) => void) => {
      bridge.changedListeners.push(listener)
      return () => {}
    },
    onSignInProgress: (listener: (progress: LicenceSignInProgress) => void) => {
      bridge.progressListeners.push(listener)
      return () => {}
    },
    signIn: bridge.signIn,
    activate: bridge.activate,
    cancelSignIn: async () => idleProgress,
    openCheckout: bridge.openCheckout,
    openAccount: async () => undefined,
  }
  return bridge
}

async function renderSetup(options?: Parameters<typeof installBridge>[0]) {
  const bridge = installBridge(options)
  render(<SetupApp />)
  await act(async () => {
    await Promise.resolve()
  })
  return bridge
}

function emitProgress(bridge: Bridge, progress: LicenceSignInProgress) {
  act(() => bridge.progressListeners.forEach((listener) => listener(progress)))
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('SetupApp', () => {
  it('opens on the sign-in page when the PC has no licence and offers nothing that installs', async () => {
    await renderSetup()
    expect(screen.getByText('Sign in with your Alpine Shell account to install')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Install' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Test out/ })).toBeNull()
  })

  it('opens on welcome with the licensed email when the licence is valid', async () => {
    await renderSetup({ licence: licenceStatus({ state: 'valid', email: 'someone@example.com' }) })
    expect(screen.getByText('someone@example.com')).toBeTruthy()
    expect(screen.getByText('Licensed')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Install' })).toBeTruthy()
  })

  it('opens on welcome during grace, because installing is still allowed', async () => {
    await renderSetup({ licence: licenceStatus({ state: 'grace', reason: 'expired', email: 'someone@example.com' }) })
    expect(screen.getByRole('button', { name: 'Install' })).toBeTruthy()
  })

  it('starts the device flow and shows the code while waiting', async () => {
    const bridge = await renderSetup()
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }))
    expect(bridge.signIn).toHaveBeenCalledTimes(1)
    emitProgress(bridge, { ...idleProgress, phase: 'waiting', userCode: 'ABCD-EFGH', verificationUri: 'https://alpineshell.com/device?user_code=ABCD-EFGH' })
    expect(screen.getByText('Approve this PC in your browser')).toBeTruthy()
    expect(screen.getByText('ABCD-EFGH')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeTruthy()
  })

  it('moves on to welcome by itself once the PC is activated', async () => {
    const bridge = await renderSetup()
    emitProgress(bridge, { ...idleProgress, phase: 'done', outcome: { kind: 'activated', email: 'someone@example.com', licenceId: 'lic_1' } })
    act(() => bridge.changedListeners.forEach((listener) => listener(licenceStatus({ state: 'valid', email: 'someone@example.com' }))))
    expect(screen.getByRole('button', { name: 'Install' })).toBeTruthy()
    expect(screen.getByText('someone@example.com')).toBeTruthy()
  })

  it('shows the no-licence page with a buy button for an account without one', async () => {
    const bridge = await renderSetup()
    emitProgress(bridge, { ...idleProgress, phase: 'done', outcome: { kind: 'no-licence', email: 'someone@example.com' } })
    expect(screen.getByText('No licence on someone@example.com yet.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Buy a licence' }))
    expect(bridge.openCheckout).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }))
    expect(bridge.activate).toHaveBeenCalledTimes(1)
  })

  it('lists the PCs holding seats and moves one here on request', async () => {
    const bridge = await renderSetup()
    emitProgress(bridge, {
      ...idleProgress,
      phase: 'done',
      outcome: { kind: 'seats-in-use', activations: [{ id: 'act_old', licenceId: 'lic_1', deviceName: 'DESK-1', lastSeenAt: null }] },
    })
    expect(screen.getByText('All your licences are in use.')).toBeTruthy()
    expect(screen.getByText('DESK-1')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Use it here instead' }))
    expect(bridge.activate).toHaveBeenCalledWith({ replaceActivationId: 'act_old' })
  })

  it('returns to sign-in with a message when the request was denied', async () => {
    const bridge = await renderSetup()
    emitProgress(bridge, { ...idleProgress, phase: 'denied' })
    expect(screen.getByText('You denied the request.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(bridge.signIn).toHaveBeenCalledTimes(1)
  })

  it('offers Sign in when the main process refuses to install without a licence', async () => {
    const bridge = await renderSetup({ licence: licenceStatus({ state: 'valid', email: 'someone@example.com' }) })
    bridge.install.mockResolvedValueOnce({ shell: false, startup: false, cursor: false, gpoBlocked: false, error: 'licence-required' })
    fireEvent.click(screen.getByRole('button', { name: 'Install' }))
    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.getByText('Sign in first')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeTruthy()
  })

  it('offers to make Alpine Shell the desktop again on a licensed PC that was handed back', async () => {
    const bridge = await renderSetup({
      licence: licenceStatus({ state: 'valid', email: 'someone@example.com' }),
      setup: setupStatus({ isFirstRun: false, isShell: false, isInstalled: true }),
    })
    fireEvent.click(screen.getByRole('button', { name: 'Make Alpine Shell my desktop again' }))
    await act(async () => {
      await Promise.resolve()
    })
    expect(bridge.setShell).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Restart Now' })).toBeTruthy()
  })
})
