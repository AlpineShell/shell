import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import brightnessWmiNative from './brightnessWmiNative.js'
import monitorIdentity from './monitorIdentity.js'

const { NATIVE_ADDON_PATH, bindBrightnessWmi, loadNativeBrightnessWmi } = brightnessWmiNative
const { normalizeInstancePath } = monitorIdentity

const BUILT_IN_PANEL = 'DISPLAY\\SDC41B3\\5&391b0070&0&UID256_0'
const DELL = 'DISPLAY\\DEL415A\\5&391b0070&0&UID275_0'
const EMBEDDED_DISPLAYPORT = 2147483648
const HDMI = 5
const DISPLAYPORT_EXTERNAL = 10

function fakeAddon(overrides = {}) {
  return {
    brightnessReadCurrent: vi.fn(async () => 70),
    brightnessReadVideoOutputTechnologies: vi.fn(async () => [EMBEDDED_DISPLAYPORT, DISPLAYPORT_EXTERNAL]),
    brightnessReadMonitorIdentities: vi.fn(async () => [
      { instanceName: BUILT_IN_PANEL, manufacturer: 'SDC', productCode: '41B3', serial: '65441' },
      { instanceName: DELL, manufacturer: 'DEL', productCode: '415A', serial: 'FJMYQ83' },
    ]),
    brightnessSetInternal: vi.fn(async () => true),
    brightnessSetInternalBlocking: vi.fn(() => true),
    brightnessWatch: vi.fn(),
    ...overrides,
  }
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('bindBrightnessWmi', () => {
  it('finds the built-in panel and its brightness in one probe', async () => {
    expect(await bindBrightnessWmi(fakeAddon()).probeInternalAndBrightness()).toEqual({ hasInternal: true, brightness: 70 })
  })

  it('reports no built-in panel when only external connections are attached', async () => {
    const addon = fakeAddon({
      brightnessReadVideoOutputTechnologies: vi.fn(async () => [HDMI, DISPLAYPORT_EXTERNAL]),
      brightnessReadCurrent: vi.fn(async () => { throw new Error('0x8004100C Not supported') }),
    })
    expect(await bindBrightnessWmi(addon).probeInternalAndBrightness()).toEqual({ hasInternal: false, brightness: null })
    expect(console.error).not.toHaveBeenCalled()
  })

  it('reports no built-in panel when the connection types cannot be read', async () => {
    const addon = fakeAddon({ brightnessReadVideoOutputTechnologies: vi.fn(async () => { throw new Error('WMI is down') }) })
    expect((await bindBrightnessWmi(addon).probeInternalAndBrightness()).hasInternal).toBe(false)
  })

  it('reads a failed brightness query as no reading', async () => {
    const addon = fakeAddon({ brightnessReadCurrent: vi.fn(async () => { throw new Error('WMI is down') }) })
    expect(await bindBrightnessWmi(addon).readBrightness()).toBeNull()
  })

  it('writes the clamped percentage and reports whether a panel took it', async () => {
    const addon = fakeAddon({ brightnessSetInternal: vi.fn(async () => false) })
    expect(await bindBrightnessWmi(addon).writeBrightness(140)).toEqual({ accepted: false, answered: true })
    expect(addon.brightnessSetInternal).toHaveBeenCalledWith(100)
  })

  it('treats a refused write as answered, as the PowerShell path does', async () => {
    const addon = fakeAddon({ brightnessSetInternal: vi.fn(async () => { throw new Error('WmiSetBrightness failed') }) })
    expect(await bindBrightnessWmi(addon).writeBrightness(40)).toEqual({ accepted: false, answered: true })
  })

  it('writes synchronously with the given timeout', () => {
    const addon = fakeAddon()
    expect(bindBrightnessWmi(addon).writeBrightnessSynchronously(55.4, 2000)).toBe(true)
    expect(addon.brightnessSetInternalBlocking).toHaveBeenCalledWith(55, 2000)
  })

  it('lets a synchronous write that timed out throw', () => {
    const addon = fakeAddon({ brightnessSetInternalBlocking: vi.fn(() => { throw new Error('did not finish within 2000 ms') }) })
    expect(() => bindBrightnessWmi(addon).writeBrightnessSynchronously(55, 2000)).toThrow(/2000 ms/)
  })

  it('keys the EDID identities by normalised instance path', async () => {
    const edid = await bindBrightnessWmi(fakeAddon()).readMonitorEdid()
    expect(edid.get(normalizeInstancePath(DELL))).toEqual({ manufacturer: 'DEL', productCode: '415A', serial: 'FJMYQ83' })
    expect(edid.size).toBe(2)
  })

  it('hands brightness events and failures to their own listeners', () => {
    const addon = fakeAddon()
    const onBrightness = vi.fn()
    const onFailure = vi.fn()
    bindBrightnessWmi(addon).watchBrightness(onBrightness, onFailure)
    const listener = addon.brightnessWatch.mock.calls[0][0]
    listener(null, 35)
    const failure = new Error('subscription ended')
    listener(failure, undefined)
    expect(onBrightness).toHaveBeenCalledExactlyOnceWith(35)
    expect(onFailure).toHaveBeenCalledExactlyOnceWith(failure)
  })

  it('reports a watch that could not start as a failure', () => {
    const failure = new Error('could not start the brightness watch thread')
    const addon = fakeAddon({ brightnessWatch: vi.fn(() => { throw failure }) })
    const onFailure = vi.fn()
    bindBrightnessWmi(addon).watchBrightness(vi.fn(), onFailure)
    expect(onFailure).toHaveBeenCalledExactlyOnceWith(failure)
  })

  it('refuses an add-on built before brightness existed', () => {
    expect(() => bindBrightnessWmi({ audioGetState: async () => ({}) })).toThrow(/no brightness exports/)
  })
})

describe('loadNativeBrightnessWmi', () => {
  it('loads the add-on from the electron native folder', () => {
    const requireAddon = vi.fn(() => fakeAddon())
    expect(loadNativeBrightnessWmi(requireAddon)?.kind).toBe('native')
    expect(requireAddon).toHaveBeenCalledWith(NATIVE_ADDON_PATH)
  })

  it('gives up quietly when the add-on was not built', () => {
    const missing = () => { throw new Error('Cannot find module') }
    expect(loadNativeBrightnessWmi(missing)).toBeNull()
  })

  it('gives up when the add-on lacks the brightness exports', () => {
    expect(loadNativeBrightnessWmi(() => ({}))).toBeNull()
  })
})
