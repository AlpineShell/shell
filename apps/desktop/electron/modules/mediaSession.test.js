import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import mediaSessionModule from './mediaSession.js'

const { MEDIA_CHANNELS, createMediaSessionChooser, prefersPowerShellMedia } = mediaSessionModule

function fakeMediaSession(kind) {
  return {
    kind,
    handlers: Object.fromEntries(MEDIA_CHANNELS.map((channel) => [channel, vi.fn(async (...args) => ({ kind, channel, args }))])),
    start: vi.fn(),
  }
}

function fakeChooser({ native = fakeMediaSession('native'), prefersPowerShell = false } = {}) {
  const powerShell = fakeMediaSession('powershell')
  const dependencies = {
    loadNative: vi.fn(() => native),
    loadPowerShell: vi.fn(() => powerShell),
    prefersPowerShell: () => prefersPowerShell,
  }
  return { chooser: createMediaSessionChooser(dependencies), dependencies, native, powerShell }
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('prefersPowerShellMedia', () => {
  it('honours the backend override only in development', () => {
    const override = { ALPINE_MEDIA_BACKEND: 'powershell' }
    expect(prefersPowerShellMedia(false, override)).toBe(true)
    expect(prefersPowerShellMedia(true, override)).toBe(false)
    expect(prefersPowerShellMedia(false, {})).toBe(false)
  })
})

describe('createMediaSessionChooser', () => {
  it('registers every media channel without loading a backend', () => {
    const { chooser, dependencies } = fakeChooser()
    expect(Object.keys(chooser.handlers)).toEqual(MEDIA_CHANNELS)
    expect(dependencies.loadNative).not.toHaveBeenCalled()
  })

  it('starts the native backend and routes calls to it', async () => {
    const { chooser, native } = fakeChooser()
    const broadcast = vi.fn()
    chooser.start(broadcast)
    expect(native.start).toHaveBeenCalledWith(broadcast)
    expect(await chooser.handlers['media/seek']('event', 4000)).toEqual({ kind: 'native', channel: 'media/seek', args: ['event', 4000] })
  })

  it('falls back to PowerShell when the native backend cannot load', async () => {
    const { chooser, powerShell } = fakeChooser({ native: null })
    chooser.start(vi.fn())
    expect(powerShell.start).toHaveBeenCalledOnce()
    expect((await chooser.handlers['media/session']()).kind).toBe('powershell')
  })

  it('uses PowerShell without loading the add-on when PowerShell is preferred', () => {
    const { chooser, dependencies, powerShell } = fakeChooser({ prefersPowerShell: true })
    chooser.start(vi.fn())
    expect(powerShell.start).toHaveBeenCalledOnce()
    expect(dependencies.loadNative).not.toHaveBeenCalled()
  })

  it('chooses the backend once', async () => {
    const { chooser, dependencies } = fakeChooser()
    chooser.start(vi.fn())
    await chooser.handlers['media/timeline']()
    await chooser.handlers['media/control']('event', 'toggle')
    expect(dependencies.loadNative).toHaveBeenCalledOnce()
  })
})
