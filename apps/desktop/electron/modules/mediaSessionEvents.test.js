import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import mediaSessionEvents from './mediaSessionEvents.js'

const { createEventDrivenMediaSession, RECONCILE_INTERVAL_MS } = mediaSessionEvents

const playingInfo = {
  title: 'COPY WASTE',
  artist: 'Bladee',
  appId: 'Spotify.exe',
  appName: 'Spotify',
  playing: true,
  positionMs: 110508,
  durationMs: 131706,
  timelineUpdatedAt: 1791967940196,
  canSeek: true,
  thumbnailRead: true,
  thumbnail: 'iVBORw0KGgo=',
  thumbnailType: 'image/png',
}

const SPOTIFY_ICON = 'c3BvdGlmeQ=='

function fakeSource() {
  const source = {
    kind: 'native',
    listener: null,
    read: vi.fn(async () => playingInfo),
    control: vi.fn(async () => true),
    seek: vi.fn(async () => true),
    watch: vi.fn(async (listener) => { source.listener = listener }),
    refresh: vi.fn(async () => {}),
    unwatch: vi.fn(async () => {}),
  }
  return source
}

function startedSession(source = fakeSource()) {
  const broadcast = vi.fn()
  const logFailure = vi.fn()
  const getAppIcon = vi.fn(async (appId) => (appId ? SPOTIFY_ICON : null))
  const media = createEventDrivenMediaSession({ source, getAppIcon, logFailure })
  media.start(broadcast)
  return { media, source, broadcast, logFailure, getAppIcon }
}

function sessionBroadcasts(broadcast) {
  return broadcast.mock.calls.filter(([channel]) => channel === 'media/session-changed').map(([, data]) => data)
}

function timelineBroadcasts(broadcast) {
  return broadcast.mock.calls.filter(([channel]) => channel === 'media/timeline-changed').map(([, data]) => data)
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('createEventDrivenMediaSession', () => {
  it('watches the session as soon as it starts', async () => {
    const { source } = startedSession()
    await vi.advanceTimersByTimeAsync(0)
    expect(source.watch).toHaveBeenCalledOnce()
  })

  it('broadcasts the playback with the app icon when the session reports a change', async () => {
    const { source, broadcast } = startedSession()
    await vi.advanceTimersByTimeAsync(0)
    source.listener(playingInfo)
    await vi.advanceTimersByTimeAsync(0)
    expect(sessionBroadcasts(broadcast)).toEqual([{
      title: 'COPY WASTE',
      artist: 'Bladee',
      appName: 'Spotify',
      appIcon: SPOTIFY_ICON,
      playing: true,
      thumbnail: 'iVBORw0KGgo=',
      thumbnailType: 'image/png',
    }])
  })

  it('stays quiet when the session reports what was already shown', async () => {
    const { source, broadcast } = startedSession()
    await vi.advanceTimersByTimeAsync(0)
    source.listener(playingInfo)
    source.listener({ ...playingInfo })
    await vi.advanceTimersByTimeAsync(0)
    expect(sessionBroadcasts(broadcast)).toHaveLength(1)
    expect(timelineBroadcasts(broadcast)).toHaveLength(1)
  })

  it('keeps the thumbnail it has when a change came without one', async () => {
    const { source, broadcast } = startedSession()
    await vi.advanceTimersByTimeAsync(0)
    source.listener(playingInfo)
    source.listener({ ...playingInfo, playing: false, thumbnailRead: false, thumbnail: null, thumbnailType: null })
    await vi.advanceTimersByTimeAsync(0)
    const [, paused] = sessionBroadcasts(broadcast)
    expect(paused).toMatchObject({ playing: false, thumbnail: 'iVBORw0KGgo=', thumbnailType: 'image/png' })
  })

  it('drops the thumbnail when the new track has none', async () => {
    const { source, broadcast } = startedSession()
    await vi.advanceTimersByTimeAsync(0)
    source.listener(playingInfo)
    source.listener({ ...playingInfo, title: 'Next', thumbnail: null, thumbnailType: null })
    await vi.advanceTimersByTimeAsync(0)
    const [, next] = sessionBroadcasts(broadcast)
    expect(next).toMatchObject({ title: 'Next', thumbnail: null, thumbnailType: null })
  })

  it('broadcasts changes in the order the session reported them', async () => {
    const source = fakeSource()
    const broadcast = vi.fn()
    const getAppIcon = vi.fn((appId) => new Promise((resolve) => setTimeout(() => resolve(appId), appId === 'Slow.exe' ? 50 : 0)))
    createEventDrivenMediaSession({ source, getAppIcon, logFailure: vi.fn() }).start(broadcast)
    await vi.advanceTimersByTimeAsync(0)
    source.listener({ ...playingInfo, appId: 'Slow.exe', title: 'First' })
    source.listener({ ...playingInfo, appId: 'Fast.exe', title: 'Second' })
    await vi.advanceTimersByTimeAsync(100)
    expect(sessionBroadcasts(broadcast).map((playback) => playback.title)).toEqual(['First', 'Second'])
  })

  it('broadcasts the timeline when the app measures it again and clears it when the session ends', async () => {
    const { source, broadcast } = startedSession()
    await vi.advanceTimersByTimeAsync(0)
    source.listener(playingInfo)
    source.listener({ ...playingInfo, positionMs: 115000, timelineUpdatedAt: playingInfo.timelineUpdatedAt + 4500 })
    source.listener({ ...playingInfo, title: null, durationMs: 0 })
    await vi.advanceTimersByTimeAsync(0)
    expect(timelineBroadcasts(broadcast).map((timeline) => timeline?.positionMs ?? null)).toEqual([110508, 115000, null])
  })

  it('asks the session to measure again every few seconds', async () => {
    const { source } = startedSession()
    await vi.advanceTimersByTimeAsync(RECONCILE_INTERVAL_MS * 2)
    expect(source.refresh).toHaveBeenCalledTimes(2)
  })

  it('tries watching again when the first watch failed', async () => {
    const source = fakeSource()
    source.watch.mockRejectedValueOnce(new Error('the media thread is not running'))
    const { logFailure } = startedSession(source)
    await vi.advanceTimersByTimeAsync(RECONCILE_INTERVAL_MS)
    expect(logFailure).toHaveBeenCalledOnce()
    expect(source.watch).toHaveBeenCalledTimes(2)
    expect(source.refresh).not.toHaveBeenCalled()
  })

  it('reads the session with its thumbnail when asked', async () => {
    const { media, source } = startedSession()
    expect(await media.handlers['media/session']()).toMatchObject({ title: 'COPY WASTE', appIcon: SPOTIFY_ICON, thumbnail: 'iVBORw0KGgo=' })
    expect(source.read).toHaveBeenCalledWith(true)
  })

  it('answers with no playback when the session cannot be read', async () => {
    const source = fakeSource()
    source.read.mockRejectedValue(new Error('could not reach the media sessions'))
    const { media } = startedSession(source)
    expect(await media.handlers['media/session']()).toEqual({ title: null, artist: null, appName: null, appIcon: null, playing: false, thumbnail: null, thumbnailType: null })
    expect(await media.handlers['media/timeline']()).toBeNull()
  })

  it('reads the timeline without the thumbnail', async () => {
    const { media, source } = startedSession()
    expect(await media.handlers['media/timeline']()).toMatchObject({ positionMs: 110508, durationMs: 131706, canSeek: true })
    expect(source.read).toHaveBeenCalledWith(false)
  })

  it('seeks inside the track and shows the new position until the app measures again', async () => {
    const { media, source, broadcast } = startedSession()
    await vi.advanceTimersByTimeAsync(0)
    await media.handlers['media/timeline']()
    expect(await media.handlers['media/seek'](null, 999999)).toEqual({ success: true })
    expect(source.seek).toHaveBeenCalledWith(131706)
    source.listener(playingInfo)
    await vi.advanceTimersByTimeAsync(0)
    expect(timelineBroadcasts(broadcast).map((timeline) => timeline.positionMs)).toEqual([131706])
  })

  it('refuses to seek before it knows the timeline', async () => {
    const { media, source } = startedSession()
    expect(await media.handlers['media/seek'](null, 4000)).toEqual({ success: false })
    expect(source.seek).not.toHaveBeenCalled()
  })

  it('reports whether the app took a control', async () => {
    const source = fakeSource()
    const { media } = startedSession(source)
    expect(await media.handlers['media/control'](null, 'toggle')).toEqual({ success: true })
    source.control.mockRejectedValueOnce(new Error('the media command did not answer within 5000 ms'))
    expect(await media.handlers['media/control'](null, 'next')).toEqual({ success: false })
    expect(source.control).toHaveBeenLastCalledWith('next')
  })
})
