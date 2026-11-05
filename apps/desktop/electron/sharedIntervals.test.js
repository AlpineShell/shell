import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createSharedIntervals } from './sharedIntervals.js'

async function advance(ms) {
  await vi.advanceTimersByTimeAsync(ms)
}

describe('createSharedIntervals', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('runs every callback on one timer at the shared interval', async () => {
    const intervals = createSharedIntervals()
    const first = vi.fn()
    const second = vi.fn()
    intervals.add(1000, first)
    intervals.add(1000, second)

    await advance(999)
    expect(first).not.toHaveBeenCalled()
    await advance(1)

    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)
    expect(intervals.activeTimerCount()).toBe(1)
    expect(vi.getTimerCount()).toBe(1)
  })

  it('keeps a separate timer for a different interval', () => {
    const intervals = createSharedIntervals()
    intervals.add(1000, vi.fn())
    intervals.add(5000, vi.fn())

    expect(intervals.activeTimerCount()).toBe(2)
  })

  it('stops the timer once the last callback is removed', async () => {
    const intervals = createSharedIntervals()
    const first = vi.fn()
    const removeFirst = intervals.add(1000, first)
    const removeSecond = intervals.add(1000, vi.fn())

    removeFirst()
    await advance(1000)
    expect(first).not.toHaveBeenCalled()
    expect(intervals.activeTimerCount()).toBe(1)

    removeSecond()
    expect(intervals.activeTimerCount()).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('ignores removing the same callback twice', () => {
    const intervals = createSharedIntervals()
    const remove = intervals.add(1000, vi.fn())
    intervals.add(1000, vi.fn())

    remove()
    remove()

    expect(intervals.activeTimerCount()).toBe(1)
  })

  it('skips a callback another callback removed in the same tick', async () => {
    const intervals = createSharedIntervals()
    const removed = vi.fn()
    let removeLater = () => {}
    intervals.add(1000, () => removeLater())
    removeLater = intervals.add(1000, removed)

    await advance(1000)

    expect(removed).not.toHaveBeenCalled()
  })

  it('still runs the other callbacks when one throws', async () => {
    const intervals = createSharedIntervals()
    const after = vi.fn()
    const failure = new Error('watcher failed')
    const uncaught = []
    const originalQueueMicrotask = globalThis.queueMicrotask
    globalThis.queueMicrotask = (task) => originalQueueMicrotask(() => {
      try {
        task()
      } catch (e) {
        uncaught.push(e)
      }
    })
    try {
      intervals.add(1000, () => { throw failure })
      intervals.add(1000, after)

      await advance(1000)
    } finally {
      globalThis.queueMicrotask = originalQueueMicrotask
    }

    expect(after).toHaveBeenCalledTimes(1)
    expect(uncaught).toEqual([failure])
  })
})
