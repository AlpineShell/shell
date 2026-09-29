import { describe, it, expect } from 'vitest'
import altTabPolicy from './altTabPolicy.js'

const { THUMBNAIL_STALE_MS, initialSelection, planSwitcherAfterBuild, isThumbnailStale } = altTabPolicy

function built(overrides) {
  return { isLatestBuild: true, windowCount: 4, altHeld: true, pendingSteps: 0, ...overrides }
}

describe('initialSelection', () => {
  it('starts on the previous window, like Windows', () => {
    expect(initialSelection(4, 0)).toBe(1)
  })

  it('stays on the only window when there is one', () => {
    expect(initialSelection(1, 0)).toBe(0)
    expect(initialSelection(1, 3)).toBe(0)
  })

  it('applies Tab presses that arrived while the list was being built', () => {
    expect(initialSelection(4, 2)).toBe(3)
    expect(initialSelection(4, 3)).toBe(0)
  })

  it('wraps backwards for Shift+Tab presses', () => {
    expect(initialSelection(4, -1)).toBe(0)
    expect(initialSelection(4, -2)).toBe(3)
    expect(initialSelection(3, -7)).toBe(0)
  })

  it('has nothing to select in an empty list', () => {
    expect(initialSelection(0, 2)).toBe(0)
  })
})

describe('planSwitcherAfterBuild', () => {
  it('shows the switcher while Alt is still held', () => {
    expect(planSwitcherAfterBuild(built())).toEqual({ action: 'show', index: 1 })
  })

  it('switches straight to the previous window when Alt was released during the build', () => {
    expect(planSwitcherAfterBuild(built({ altHeld: false }))).toEqual({ action: 'switch', index: 1 })
  })

  it('switches to the window the extra Tab presses reached when Alt was released', () => {
    expect(planSwitcherAfterBuild(built({ altHeld: false, pendingSteps: 1 }))).toEqual({ action: 'switch', index: 2 })
  })

  it('drops a build that a later press, Esc or a hide has replaced', () => {
    expect(planSwitcherAfterBuild(built({ isLatestBuild: false }))).toEqual({ action: 'drop' })
    expect(planSwitcherAfterBuild(built({ isLatestBuild: false, altHeld: false }))).toEqual({ action: 'drop' })
  })

  it('drops a build that found no windows', () => {
    expect(planSwitcherAfterBuild(built({ windowCount: 0 }))).toEqual({ action: 'drop' })
    expect(planSwitcherAfterBuild(built({ windowCount: 0, altHeld: false }))).toEqual({ action: 'drop' })
  })
})

describe('isThumbnailStale', () => {
  const now = 1_000_000

  it('is stale when the window was never captured', () => {
    expect(isThumbnailStale(undefined, now)).toBe(true)
    expect(isThumbnailStale(null, now)).toBe(true)
  })

  it('is fresh right after a capture', () => {
    expect(isThumbnailStale({ url: 'data:', ts: now }, now)).toBe(false)
    expect(isThumbnailStale({ url: 'data:', ts: now - THUMBNAIL_STALE_MS + 1 }, now)).toBe(false)
  })

  it('goes stale once the capture is old enough', () => {
    expect(isThumbnailStale({ url: 'data:', ts: now - THUMBNAIL_STALE_MS }, now)).toBe(true)
    expect(isThumbnailStale({ url: 'data:', ts: now - THUMBNAIL_STALE_MS * 4 }, now)).toBe(true)
  })

  it('takes a custom age limit', () => {
    expect(isThumbnailStale({ url: 'data:', ts: now - 500 }, now, 1000)).toBe(false)
    expect(isThumbnailStale({ url: 'data:', ts: now - 1000 }, now, 1000)).toBe(true)
  })
})
