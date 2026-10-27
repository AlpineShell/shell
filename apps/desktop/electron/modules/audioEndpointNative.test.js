import { describe, it, expect, vi } from 'vitest'
import audioEndpointNative from './audioEndpointNative.js'

const { ADDON_PATH, bindAudioEndpoint, loadNativeAudioEndpoint } = audioEndpointNative

const SPEAKERS = '{0.0.0.00000000}.{d3ac2b73-0d5c-4882-aeac-51fdafd224c2}'

function fakeAddon() {
  return {
    audioGetState: vi.fn(async () => ({ volume: 40, muted: false })),
    audioSetVolume: vi.fn(async () => {}),
    audioSetMute: vi.fn(async () => {}),
    audioStepVolume: vi.fn(async () => ({ volume: 42, muted: false })),
    audioToggleMute: vi.fn(async () => ({ volume: 40, muted: true })),
    audioGetPeak: vi.fn(async () => 0.25),
    audioListDevices: vi.fn(async () => [{ id: SPEAKERS, name: 'Speakers', flow: 'output', isDefault: true }]),
    audioSetDefaultDevice: vi.fn(async () => true),
    audioWatch: vi.fn(async () => {}),
  }
}

describe('bindAudioEndpoint', () => {
  it('passes each call straight to the add-on', async () => {
    const addon = fakeAddon()
    const endpoint = bindAudioEndpoint(addon)
    await endpoint.setVolume(30)
    await endpoint.stepVolume(-2)
    await endpoint.setDefaultDevice(SPEAKERS)
    expect(addon.audioSetVolume).toHaveBeenCalledWith(30)
    expect(addon.audioStepVolume).toHaveBeenCalledWith(-2)
    expect(addon.audioSetDefaultDevice).toHaveBeenCalledWith(SPEAKERS)
    expect(await endpoint.getState()).toEqual({ volume: 40, muted: false })
  })

  it('groups the listed endpoints into outputs and inputs', async () => {
    const endpoint = bindAudioEndpoint(fakeAddon())
    expect(await endpoint.listDevices()).toEqual({
      output: [{ id: SPEAKERS, name: 'Speakers', isDefault: true }],
      input: [],
    })
  })
})

describe('watch', () => {
  it('hands both listeners to the add-on', async () => {
    const addon = fakeAddon()
    const onState = () => {}
    const onDevicesChanged = () => {}
    await bindAudioEndpoint(addon).watch(onState, onDevicesChanged)
    expect(addon.audioWatch).toHaveBeenCalledWith(onState, onDevicesChanged)
  })

  it('is absent when the add-on predates change notifications', () => {
    const { audioWatch, ...olderAddon } = fakeAddon()
    expect(audioWatch).toBeTypeOf('function')
    expect(bindAudioEndpoint(olderAddon).watch).toBeNull()
  })
})

describe('loadNativeAudioEndpoint', () => {
  it('loads the add-on from the electron native folder', () => {
    const requireAddon = vi.fn(() => fakeAddon())
    expect(loadNativeAudioEndpoint(requireAddon)?.kind).toBe('native')
    expect(requireAddon).toHaveBeenCalledWith(ADDON_PATH)
  })

  it('gives up quietly when the add-on was not built', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const missing = () => { throw new Error('Cannot find module') }
    expect(loadNativeAudioEndpoint(missing)).toBeNull()
    error.mockRestore()
  })
})
