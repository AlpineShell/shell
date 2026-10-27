import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import browserTabsBackendModule from './browserTabsBackend.js'

const { createBackendChooser, prefersPowerShellBrowserTabs } = browserTabsBackendModule

function fakeChooser({ native = { kind: 'native' }, prefersPowerShell = false } = {}) {
  const powerShell = { kind: 'powershell' }
  const dependencies = {
    loadNative: vi.fn(() => native),
    loadPowerShell: vi.fn(() => powerShell),
    prefersPowerShell: () => prefersPowerShell,
  }
  return { chosenBackend: createBackendChooser(dependencies), dependencies, powerShell }
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('prefersPowerShellBrowserTabs', () => {
  it('honours the backend override only in development', () => {
    const override = { ALPINE_BROWSER_TABS_BACKEND: 'powershell' }
    expect(prefersPowerShellBrowserTabs(false, override)).toBe(true)
    expect(prefersPowerShellBrowserTabs(true, override)).toBe(false)
    expect(prefersPowerShellBrowserTabs(false, {})).toBe(false)
  })
})

describe('createBackendChooser', () => {
  it('picks the native backend once and keeps it', () => {
    const { chosenBackend, dependencies } = fakeChooser()
    expect(chosenBackend().kind).toBe('native')
    expect(chosenBackend().kind).toBe('native')
    expect(dependencies.loadNative).toHaveBeenCalledOnce()
    expect(dependencies.loadPowerShell).not.toHaveBeenCalled()
  })

  it('falls back to PowerShell when the add-on is unavailable', () => {
    const { chosenBackend, powerShell } = fakeChooser({ native: null })
    expect(chosenBackend()).toBe(powerShell)
  })

  it('skips the add-on when PowerShell is preferred', () => {
    const { chosenBackend, dependencies } = fakeChooser({ prefersPowerShell: true })
    expect(chosenBackend().kind).toBe('powershell')
    expect(dependencies.loadNative).not.toHaveBeenCalled()
  })

  it('loads nothing until a backend is first needed', () => {
    const { dependencies } = fakeChooser()
    expect(dependencies.loadNative).not.toHaveBeenCalled()
    expect(dependencies.loadPowerShell).not.toHaveBeenCalled()
  })
})
