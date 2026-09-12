import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let highlights: typeof import('./useHighlightedSetting')

const HIGHLIGHT_DURATION = 2500

beforeEach(async () => {
  vi.resetModules()
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  highlights = await import('./useHighlightedSetting')
})

afterEach(() => {
  vi.useRealTimers()
})

describe('highlightedSetting', () => {
  it('holds nothing before a search hit highlights a setting', () => {
    expect(highlights.highlightedSetting()).toBeNull()
  })

  it('holds the highlighted setting until it fades', () => {
    highlights.highlightSetting('clock-time-format')
    vi.advanceTimersByTime(HIGHLIGHT_DURATION - 1)
    expect(highlights.highlightedSetting()).toBe('clock-time-format')

    vi.advanceTimersByTime(1)
    expect(highlights.highlightedSetting()).toBeNull()
  })

  it('gives a highlight that replaces another its own full time', () => {
    highlights.highlightSetting('ridge-item-clock')
    vi.advanceTimersByTime(HIGHLIGHT_DURATION - 1)
    highlights.highlightSetting('ridge-layout-reset')
    vi.advanceTimersByTime(HIGHLIGHT_DURATION - 1)

    expect(highlights.highlightedSetting()).toBe('ridge-layout-reset')
  })
})

describe('onHighlightedSetting', () => {
  it('tells a listener about each highlight and about the fade', () => {
    const listener = vi.fn()
    highlights.onHighlightedSetting(listener)

    highlights.highlightSetting('ridge-item-clock')
    highlights.highlightSetting('clock-time-format')
    vi.advanceTimersByTime(HIGHLIGHT_DURATION)

    expect(listener.mock.calls).toEqual([['ridge-item-clock'], ['clock-time-format'], [null]])
  })

  it('stops telling a listener once it unsubscribes, and keeps telling the others', () => {
    const leaving = vi.fn()
    const staying = vi.fn()
    const unsubscribe = highlights.onHighlightedSetting(leaving)
    highlights.onHighlightedSetting(staying)

    unsubscribe()
    highlights.highlightSetting('ridge-item-clock')

    expect(leaving).not.toHaveBeenCalled()
    expect(staying).toHaveBeenCalledWith('ridge-item-clock')
  })
})
