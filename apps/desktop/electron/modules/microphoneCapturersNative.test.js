import { describe, it, expect, vi } from 'vitest'
import microphoneCapturersNative from './microphoneCapturersNative.js'

const { NATIVE_ADDON_PATH, bindMicrophoneCapturers, loadNativeMicrophoneCapturers } = microphoneCapturersNative

const DISCORD = { name: 'Discord', path: null, description: 'Discord' }

function fakeAddon() {
  return {
    microphoneListCapturers: vi.fn(async () => [DISCORD]),
  }
}

describe('bindMicrophoneCapturers', () => {
  it('lists the capturing apps straight from the add-on', async () => {
    const addon = fakeAddon()
    expect(await bindMicrophoneCapturers(addon).listCapturers()).toEqual([DISCORD])
    expect(addon.microphoneListCapturers).toHaveBeenCalledTimes(1)
  })

  it('refuses an add-on built before the microphone exports', () => {
    expect(() => bindMicrophoneCapturers({})).toThrow('no microphone exports')
  })
})

describe('loadNativeMicrophoneCapturers', () => {
  it('loads the add-on from the electron native folder', () => {
    const requireAddon = vi.fn(() => fakeAddon())
    expect(loadNativeMicrophoneCapturers(requireAddon)?.kind).toBe('native')
    expect(requireAddon).toHaveBeenCalledWith(NATIVE_ADDON_PATH)
  })

  it('gives up quietly when the add-on is missing or too old', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const missing = () => { throw new Error('Cannot find module') }
    expect(loadNativeMicrophoneCapturers(missing)).toBeNull()
    expect(loadNativeMicrophoneCapturers(() => ({}))).toBeNull()
    error.mockRestore()
  })
})
