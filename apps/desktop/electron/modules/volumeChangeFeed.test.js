import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import volumeChangeFeed from './volumeChangeFeed.js'

const { createVolumeChangeFeed } = volumeChangeFeed

const SETTLE_MS = 1500
const DEVICE_CHANGE_DELAY_MS = 100

function fakeFeed({ lastSetAt = -Infinity, state = { volume: 30, muted: false } } = {}) {
  const clock = { lastSetAt }
  const dependencies = {
    settleMs: SETTLE_MS,
    deviceChangeDelayMs: DEVICE_CHANGE_DELAY_MS,
    millisSinceLastSet: () => Date.now() - clock.lastSetAt,
    readState: vi.fn(async () => state),
    publishState: vi.fn(),
    refreshDevices: vi.fn(async () => {}),
  }
  return { feed: createVolumeChangeFeed(dependencies), dependencies, clock }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(100_000)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('createVolumeChangeFeed', () => {
  it('publishes a pushed change at once when nothing was set recently', () => {
    const { feed, dependencies } = fakeFeed()
    feed.onVolumeChanged({ volume: 55, muted: false })
    expect(dependencies.publishState).toHaveBeenCalledWith({ volume: 55, muted: false })
    expect(dependencies.readState).not.toHaveBeenCalled()
  })

  it('holds pushed changes while a set settles, then publishes one fresh read', async () => {
    const { feed, dependencies } = fakeFeed({ lastSetAt: Date.now() })
    feed.onVolumeChanged({ volume: 41, muted: false })
    feed.onVolumeChanged({ volume: 42, muted: false })
    expect(dependencies.publishState).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(SETTLE_MS)
    expect(dependencies.readState).toHaveBeenCalledTimes(1)
    expect(dependencies.publishState).toHaveBeenCalledTimes(1)
    expect(dependencies.publishState).toHaveBeenCalledWith({ volume: 30, muted: false })
  })

  it('keeps waiting while the slider is still being dragged', async () => {
    const { feed, dependencies, clock } = fakeFeed({ lastSetAt: Date.now() })
    feed.onVolumeChanged({ volume: 41, muted: false })
    await vi.advanceTimersByTimeAsync(SETTLE_MS - 100)
    clock.lastSetAt = Date.now()
    await vi.advanceTimersByTimeAsync(200)
    expect(dependencies.publishState).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(SETTLE_MS)
    expect(dependencies.publishState).toHaveBeenCalledTimes(1)
  })

  it('coalesces a burst of device notifications into one refresh and state read', async () => {
    const { feed, dependencies } = fakeFeed()
    feed.onDevicesChanged()
    feed.onDevicesChanged()
    feed.onDevicesChanged()
    await vi.advanceTimersByTimeAsync(DEVICE_CHANGE_DELAY_MS)
    expect(dependencies.refreshDevices).toHaveBeenCalledTimes(1)
    expect(dependencies.readState).toHaveBeenCalledTimes(1)
    expect(dependencies.publishState).toHaveBeenCalledWith({ volume: 30, muted: false })
  })
})
