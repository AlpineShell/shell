import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import liveWallpaperWatch from './liveWallpaperWatch.js'

const { createLiveWallpaperWatch, LIVE_WALLPAPER_POLL_MS } = liveWallpaperWatch

function watchWith(readings) {
  const onChange = vi.fn()
  const isAttached = vi.fn(() => readings.shift() ?? false)
  return { watch: createLiveWallpaperWatch({ isAttached, onChange }), onChange, isAttached }
}

describe('createLiveWallpaperWatch', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('reports nothing while no live wallpaper ever attaches', () => {
    const { watch, onChange } = watchWith([false, false, false])
    watch.start()
    vi.advanceTimersByTime(LIVE_WALLPAPER_POLL_MS * 2)
    expect(onChange).not.toHaveBeenCalled()
    expect(watch.isAttached()).toBe(false)
  })

  it('reports a wallpaper that is already attached when the watch starts', () => {
    const { watch, onChange } = watchWith([true])
    watch.start()
    expect(onChange).toHaveBeenCalledWith(true)
    expect(watch.isAttached()).toBe(true)
  })

  it('reports an attach and a later detach once each', () => {
    const { watch, onChange } = watchWith([false, true, true, false, false])
    watch.start()
    vi.advanceTimersByTime(LIVE_WALLPAPER_POLL_MS * 4)
    expect(onChange.mock.calls).toEqual([[true], [false]])
  })

  it('keeps the last known state when a check throws', () => {
    const onChange = vi.fn()
    const readings = [true, 'throw', true]
    const isAttached = () => {
      const next = readings.shift()
      if (next === 'throw') throw new Error('window gone')
      return next
    }
    const watch = createLiveWallpaperWatch({ isAttached, onChange })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    watch.start()
    vi.advanceTimersByTime(LIVE_WALLPAPER_POLL_MS * 2)
    expect(onChange.mock.calls).toEqual([[true]])
  })

  it('stops polling once stopped', () => {
    const { watch, isAttached } = watchWith([false, false, false])
    watch.start()
    watch.stop()
    vi.advanceTimersByTime(LIVE_WALLPAPER_POLL_MS * 3)
    expect(isAttached).toHaveBeenCalledTimes(1)
  })

  it('does not start a second poll when started twice', () => {
    const { watch, isAttached } = watchWith([false, false, false, false])
    watch.start()
    watch.start()
    vi.advanceTimersByTime(LIVE_WALLPAPER_POLL_MS)
    expect(isAttached).toHaveBeenCalledTimes(2)
  })
})
