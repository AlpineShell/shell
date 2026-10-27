import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import brightnessWmi from './brightnessWmi.js'

const { chooseBrightnessWmi, prefersPowerShellBrightness } = brightnessWmi

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('prefersPowerShellBrightness', () => {
  it('honours the backend override only in development', () => {
    const override = { ALPINE_BRIGHTNESS_BACKEND: 'powershell' }
    expect(prefersPowerShellBrightness(false, override)).toBe(true)
    expect(prefersPowerShellBrightness(true, override)).toBe(false)
    expect(prefersPowerShellBrightness(false, {})).toBe(false)
  })
})

describe('chooseBrightnessWmi', () => {
  it('uses the native backend when it loads', () => {
    const loadPowerShell = vi.fn(() => ({ kind: 'powershell' }))
    const chosen = chooseBrightnessWmi({ prefersPowerShell: false, loadNative: () => ({ kind: 'native' }), loadPowerShell })
    expect(chosen.kind).toBe('native')
    expect(loadPowerShell).not.toHaveBeenCalled()
  })

  it('falls back to PowerShell when the add-on is missing', () => {
    const chosen = chooseBrightnessWmi({ prefersPowerShell: false, loadNative: () => null, loadPowerShell: () => ({ kind: 'powershell' }) })
    expect(chosen.kind).toBe('powershell')
  })

  it('never loads the add-on when PowerShell is forced', () => {
    const loadNative = vi.fn(() => ({ kind: 'native' }))
    const chosen = chooseBrightnessWmi({ prefersPowerShell: true, loadNative, loadPowerShell: () => ({ kind: 'powershell' }) })
    expect(chosen.kind).toBe('powershell')
    expect(loadNative).not.toHaveBeenCalled()
  })
})
