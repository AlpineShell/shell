import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import appActivatorModule from './appActivator.js'

const { createAppActivator, isPackagedAumid, prefersPowerShellActivation } = appActivatorModule

const CALCULATOR = 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App'
const DESKTOP_APP = 'Microsoft.Windows.Explorer'

function fakeBackend(kind) {
  return {
    kind,
    warm: vi.fn(async () => {}),
    activatePackaged: vi.fn(async () => 4242),
  }
}

function fakeActivator({ native = fakeBackend('native'), prefersPowerShell = false } = {}) {
  const powerShell = fakeBackend('powershell')
  const dependencies = {
    loadNative: vi.fn(() => native),
    loadPowerShell: vi.fn(() => powerShell),
    prefersPowerShell: () => prefersPowerShell,
    openAppsFolderItem: vi.fn(),
    logFailure: vi.fn(),
  }
  return { activator: createAppActivator(dependencies), dependencies, native, powerShell }
}

function settle() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('isPackagedAumid', () => {
  it('treats an id with a package application separator as packaged', () => {
    expect(isPackagedAumid(CALCULATOR)).toBe(true)
    expect(isPackagedAumid(DESKTOP_APP)).toBe(false)
  })
})

describe('prefersPowerShellActivation', () => {
  it('honours the backend override only in development', () => {
    const override = { ALPINE_APP_ACTIVATION_BACKEND: 'powershell' }
    expect(prefersPowerShellActivation(false, override)).toBe(true)
    expect(prefersPowerShellActivation(true, override)).toBe(false)
    expect(prefersPowerShellActivation(false, {})).toBe(false)
  })
})

describe('createAppActivator', () => {
  it('activates a packaged app through the native backend', async () => {
    const { activator, native, powerShell, dependencies } = fakeActivator()
    activator.activate(CALCULATOR)
    await settle()
    expect(native.activatePackaged).toHaveBeenCalledWith(CALCULATOR)
    expect(powerShell.activatePackaged).not.toHaveBeenCalled()
    expect(dependencies.openAppsFolderItem).not.toHaveBeenCalled()
  })

  it('opens a non-packaged app through the apps folder without loading a backend', async () => {
    const { activator, dependencies } = fakeActivator()
    activator.activate(DESKTOP_APP)
    await settle()
    expect(dependencies.openAppsFolderItem).toHaveBeenCalledWith(DESKTOP_APP)
    expect(dependencies.loadNative).not.toHaveBeenCalled()
  })

  it('opens File Explorer through the apps folder', async () => {
    const { activator, dependencies } = fakeActivator()
    activator.openFileExplorer()
    await settle()
    expect(dependencies.openAppsFolderItem).toHaveBeenCalledWith(DESKTOP_APP)
  })

  it('ignores an empty app id', async () => {
    const { activator, dependencies } = fakeActivator()
    activator.activate('')
    await settle()
    expect(dependencies.openAppsFolderItem).not.toHaveBeenCalled()
    expect(dependencies.loadNative).not.toHaveBeenCalled()
  })

  it('falls back to PowerShell when the native backend cannot load', async () => {
    const { activator, powerShell } = fakeActivator({ native: null })
    activator.activate(CALCULATOR)
    await settle()
    expect(powerShell.activatePackaged).toHaveBeenCalledWith(CALCULATOR)
  })

  it('uses PowerShell without loading the add-on when PowerShell is preferred', async () => {
    const { activator, powerShell, dependencies } = fakeActivator({ prefersPowerShell: true })
    activator.warm()
    await settle()
    expect(powerShell.warm).toHaveBeenCalledOnce()
    expect(dependencies.loadNative).not.toHaveBeenCalled()
  })

  it('chooses the backend once', async () => {
    const { activator, dependencies, native } = fakeActivator()
    activator.warm()
    activator.activate(CALCULATOR)
    activator.activate(CALCULATOR)
    await settle()
    expect(dependencies.loadNative).toHaveBeenCalledOnce()
    expect(native.warm).toHaveBeenCalledOnce()
    expect(native.activatePackaged).toHaveBeenCalledTimes(2)
  })

  it('logs a failed activation instead of throwing', async () => {
    const native = fakeBackend('native')
    const failure = new Error('could not activate Bogus!App: 0x80270254 not registered')
    native.activatePackaged.mockRejectedValueOnce(failure)
    const { activator, dependencies } = fakeActivator({ native })
    expect(() => activator.activate('Bogus!App')).not.toThrow()
    await settle()
    expect(dependencies.logFailure).toHaveBeenCalledWith(failure)
  })
})
