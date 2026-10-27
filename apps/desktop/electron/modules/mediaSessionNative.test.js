import { describe, it, expect, vi } from 'vitest'
import mediaSessionNative from './mediaSessionNative.js'

const { NATIVE_ADDON_PATH, appNameOf, mediaInfoOf, bindMediaSource, loadNativeMediaSource } = mediaSessionNative

const SPOTIFY = 'Spotify.exe'
const COVER = Buffer.from([0x89, 0x50, 0x4e, 0x47])

const spotifySnapshot = {
  appId: SPOTIFY,
  title: 'COPY WASTE',
  artist: 'Bladee',
  playing: true,
  positionMs: 110508,
  durationMs: 131706,
  timelineUpdatedAt: 1791967940196,
  canSeek: true,
  thumbnailRead: true,
  thumbnail: COVER,
  thumbnailType: 'image/png',
}

function fakeAddon() {
  return {
    mediaGetInfo: vi.fn(async () => spotifySnapshot),
    mediaControl: vi.fn(async () => true),
    mediaSeek: vi.fn(async () => true),
    mediaWatch: vi.fn(async () => {}),
    mediaRefreshWatch: vi.fn(async () => {}),
    mediaUnwatch: vi.fn(async () => {}),
  }
}

describe('appNameOf', () => {
  it('names the app the way the PowerShell helper did', () => {
    expect(appNameOf(SPOTIFY)).toBe('Spotify')
    expect(appNameOf('Chrome')).toBe('Chrome')
    expect(appNameOf('Microsoft.ZuneMusic_8wekyb3d8bbwe!Microsoft.ZuneMusic')).toBe('Microsoft.ZuneMusic')
    expect(appNameOf('VLC.EXE')).toBe('VLC')
  })

  it('has no name without an app id', () => {
    expect(appNameOf(null)).toBeNull()
    expect(appNameOf('')).toBeNull()
  })
})

describe('mediaInfoOf', () => {
  it('turns a snapshot into the media info the PowerShell helper reported', () => {
    expect(mediaInfoOf(spotifySnapshot)).toEqual({
      title: 'COPY WASTE',
      artist: 'Bladee',
      appId: SPOTIFY,
      appName: 'Spotify',
      playing: true,
      positionMs: 110508,
      durationMs: 131706,
      timelineUpdatedAt: 1791967940196,
      canSeek: true,
      thumbnailRead: true,
      thumbnail: COVER.toString('base64'),
      thumbnailType: 'image/png',
    })
  })

  it('reports missing and empty fields as null', () => {
    const emptySession = { title: '', playing: false, positionMs: 0, durationMs: 0, timelineUpdatedAt: 0, canSeek: false, thumbnailRead: true, thumbnail: Buffer.alloc(0) }
    expect(mediaInfoOf(emptySession)).toMatchObject({ title: null, artist: null, appId: null, appName: null, thumbnail: null, thumbnailType: null })
  })
})

describe('bindMediaSource', () => {
  it('reads the session with or without the thumbnail', async () => {
    const addon = fakeAddon()
    const source = bindMediaSource(addon)
    expect((await source.read(false)).title).toBe('COPY WASTE')
    expect(addon.mediaGetInfo).toHaveBeenCalledWith(false)
  })

  it('passes controls and seeks straight to the add-on', async () => {
    const addon = fakeAddon()
    const source = bindMediaSource(addon)
    expect(await source.control('toggle')).toBe(true)
    expect(await source.seek(4000)).toBe(true)
    expect(addon.mediaControl).toHaveBeenCalledWith('toggle')
    expect(addon.mediaSeek).toHaveBeenCalledWith(4000)
  })

  it('hands every watched snapshot over as media info', async () => {
    const addon = fakeAddon()
    const received = vi.fn()
    await bindMediaSource(addon).watch(received)
    const listener = addon.mediaWatch.mock.calls[0][0]
    listener(spotifySnapshot)
    expect(received).toHaveBeenCalledWith(mediaInfoOf(spotifySnapshot))
  })

  it('refuses an add-on built before the media session existed', () => {
    expect(() => bindMediaSource({ audioGetState: async () => ({}) })).toThrow(/no media session exports/)
  })
})

describe('loadNativeMediaSource', () => {
  it('loads the add-on from the electron native folder', () => {
    const requireAddon = vi.fn(() => fakeAddon())
    expect(loadNativeMediaSource(requireAddon)?.kind).toBe('native')
    expect(requireAddon).toHaveBeenCalledWith(NATIVE_ADDON_PATH)
  })

  it('gives up quietly when the add-on was not built', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const missing = () => { throw new Error('Cannot find module') }
    expect(loadNativeMediaSource(missing)).toBeNull()
    error.mockRestore()
  })
})
