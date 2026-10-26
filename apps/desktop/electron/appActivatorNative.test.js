import { describe, it, expect, vi } from 'vitest'
import appActivatorNative from './appActivatorNative.js'

const { NATIVE_ADDON_PATH, bindAppActivator, loadNativeAppActivator } = appActivatorNative

const CALCULATOR = 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App'

function fakeAddon() {
  return {
    appActivate: vi.fn(async () => 4242),
    appActivationWarm: vi.fn(async () => {}),
  }
}

describe('bindAppActivator', () => {
  it('activates through the add-on and resolves with the process id', async () => {
    const addon = fakeAddon()
    const activator = bindAppActivator(addon)
    expect(await activator.activatePackaged(CALCULATOR)).toBe(4242)
    expect(addon.appActivate).toHaveBeenCalledWith(CALCULATOR)
  })

  it('warms the activation thread without activating anything', async () => {
    const addon = fakeAddon()
    await bindAppActivator(addon).warm()
    expect(addon.appActivationWarm).toHaveBeenCalledOnce()
    expect(addon.appActivate).not.toHaveBeenCalled()
  })

  it('refuses an add-on built before app activation existed', () => {
    expect(() => bindAppActivator({ audioGetState: async () => ({}) })).toThrow(/no app activation exports/)
  })
})

describe('loadNativeAppActivator', () => {
  it('loads the add-on from the electron native folder', () => {
    const requireAddon = vi.fn(() => fakeAddon())
    expect(loadNativeAppActivator(requireAddon)?.kind).toBe('native')
    expect(requireAddon).toHaveBeenCalledWith(NATIVE_ADDON_PATH)
  })

  it('gives up quietly when the add-on was not built', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const missing = () => { throw new Error('Cannot find module') }
    expect(loadNativeAppActivator(missing)).toBeNull()
    error.mockRestore()
  })

  it('gives up when the add-on lacks the activation exports', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(loadNativeAppActivator(() => ({}))).toBeNull()
    error.mockRestore()
  })
})
