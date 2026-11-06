import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { sameCoverage, useWindowCoverage } from './useWindowCoverage'

const THIS_DISPLAY = Number(new URLSearchParams(window.location.search).get('displayId'))
const OTHER_DISPLAY = THIS_DISPLAY + 1
const EDITOR: TopbarRegionBounds = { left: 0, top: 24, right: 800, bottom: 900 }
const BROWSER: TopbarRegionBounds = { left: 800, top: 24, right: 1600, bottom: 900 }

let pushCoverage: (coverage: DisplayWindowCoverage[]) => void = () => {}

function coverage(thisDisplay: TopbarRegionBounds[], otherDisplay: TopbarRegionBounds[] = []): DisplayWindowCoverage[] {
  return [
    { displayId: OTHER_DISPLAY, rects: otherDisplay.map((rect) => ({ ...rect })) },
    { displayId: THIS_DISPLAY, rects: thisDisplay.map((rect) => ({ ...rect })) },
  ]
}

beforeEach(() => {
  Object.assign(window, {
    topbar: {
      windowCoverage: () => Promise.resolve(coverage([EDITOR])),
      onWindowCoverageChanged: (callback: (data: DisplayWindowCoverage[]) => void) => {
        pushCoverage = callback
        return () => {}
      },
    },
  })
})

describe('sameCoverage', () => {
  it('compares the rects edge by edge, in order', () => {
    expect(sameCoverage([EDITOR], [{ ...EDITOR }])).toBe(true)
    expect(sameCoverage([EDITOR, BROWSER], [BROWSER, EDITOR])).toBe(false)
    expect(sameCoverage([EDITOR], [{ ...EDITOR, right: 801 }])).toBe(false)
    expect(sameCoverage([EDITOR], [])).toBe(false)
    expect(sameCoverage([], [])).toBe(true)
  })
})

describe('useWindowCoverage', () => {
  it('keeps the same array while the rects on this display stay the same', async () => {
    const { result } = renderHook(() => useWindowCoverage())
    await waitFor(() => expect(result.current).toEqual([EDITOR]))
    const first = result.current

    act(() => pushCoverage(coverage([EDITOR], [BROWSER])))
    expect(result.current).toBe(first)

    act(() => pushCoverage(coverage([EDITOR])))
    expect(result.current).toBe(first)
  })

  it('hands out the new rects when a window on this display moves', async () => {
    const { result } = renderHook(() => useWindowCoverage())
    await waitFor(() => expect(result.current).toEqual([EDITOR]))

    act(() => pushCoverage(coverage([EDITOR, BROWSER])))
    expect(result.current).toEqual([EDITOR, BROWSER])
  })
})
