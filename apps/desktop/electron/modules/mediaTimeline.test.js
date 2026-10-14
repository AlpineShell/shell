import { describe, it, expect } from 'vitest'

const { timelineOf, timelineChanged, seekTarget, seekTimeline, settleTimeline } = await import('./mediaTimeline.js')

const playing = { title: 'COPY WASTE', playing: true, positionMs: 110508, durationMs: 131706, timelineUpdatedAt: 1791967940196, canSeek: true }

describe('timelineOf', () => {
  it('reads where the track is, how long it runs, when that was measured and whether it can seek', () => {
    expect(timelineOf(playing)).toEqual({ positionMs: 110508, durationMs: 131706, updatedAt: 1791967940196, playing: true, canSeek: true })
  })

  it('has no timeline when nothing is playing or the app reports no length', () => {
    expect(timelineOf({ ...playing, title: null })).toBeNull()
    expect(timelineOf({ ...playing, durationMs: 0 })).toBeNull()
    expect(timelineOf(null)).toBeNull()
  })

  it('keeps the position inside the track', () => {
    expect(timelineOf({ ...playing, positionMs: -40 }).positionMs).toBe(0)
    expect(timelineOf({ ...playing, positionMs: 999999 }).positionMs).toBe(131706)
  })
})

describe('timelineChanged', () => {
  const timeline = timelineOf(playing)

  it('stays quiet while the app has not measured again', () => {
    expect(timelineChanged(timeline, { ...timeline })).toBe(false)
  })

  it('speaks up when the app measures again, seeks, pauses, changes track or stops allowing seeks', () => {
    expect(timelineChanged(timeline, { ...timeline, updatedAt: timeline.updatedAt + 1000 })).toBe(true)
    expect(timelineChanged(timeline, { ...timeline, positionMs: 0 })).toBe(true)
    expect(timelineChanged(timeline, { ...timeline, playing: false })).toBe(true)
    expect(timelineChanged(timeline, { ...timeline, durationMs: 200000 })).toBe(true)
    expect(timelineChanged(timeline, { ...timeline, canSeek: false })).toBe(true)
  })

  it('speaks up when a timeline appears or goes away', () => {
    expect(timelineChanged(null, timeline)).toBe(true)
    expect(timelineChanged(timeline, null)).toBe(true)
    expect(timelineChanged(null, null)).toBe(false)
  })
})

describe('seekTarget', () => {
  const timeline = timelineOf(playing)

  it('rounds the position the slider asked for', () => {
    expect(seekTarget(timeline, 4000.6)).toBe(4001)
  })

  it('keeps it inside the track', () => {
    expect(seekTarget(timeline, -5)).toBe(0)
    expect(seekTarget(timeline, 10_000_000)).toBe(131706)
  })

  it('refuses when the app does not allow seeking or the position is not a number', () => {
    expect(seekTarget({ ...timeline, canSeek: false }, 4000)).toBeNull()
    expect(seekTarget(null, 4000)).toBeNull()
    expect(seekTarget(timeline, Number.NaN)).toBeNull()
  })
})

describe('settleTimeline after a seek', () => {
  const measured = timelineOf(playing)
  const seeked = seekTimeline(measured, 30000, 1791967950000)

  it('keeps the seeked position while the app still reports the measurement from before the seek', () => {
    expect(settleTimeline(seeked, measured, measured.updatedAt)).toEqual({ timeline: seeked, seekBase: measured.updatedAt })
  })

  it('takes the app at its word again once it measures anew', () => {
    const fresh = { ...measured, positionMs: 31000, updatedAt: measured.updatedAt + 9000 }
    expect(settleTimeline(seeked, fresh, measured.updatedAt)).toEqual({ timeline: fresh, seekBase: null })
  })

  it('takes the app at its word when it pauses or changes track', () => {
    expect(settleTimeline(seeked, { ...measured, playing: false }, measured.updatedAt).seekBase).toBeNull()
    expect(settleTimeline(seeked, null, measured.updatedAt)).toEqual({ timeline: null, seekBase: null })
  })

  it('passes measurements straight through when nothing was seeked', () => {
    expect(settleTimeline(measured, measured, null)).toEqual({ timeline: measured, seekBase: null })
  })
})
