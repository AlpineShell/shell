import { describe, it, expect } from 'vitest'
import windowCoverageGeometry from './windowCoverageGeometry.js'

const { displayCoverage, sameCoverage } = windowCoverageGeometry

const PRIMARY = { x: 0, y: 0, width: 3440, height: 1440 }
const SECONDARY_SCALED = { x: 3440, y: 0, width: 2880, height: 1800 }

const LEFT_TILE = { left: 12, top: 36, right: 1717, bottom: 1429 }
const RIGHT_TILE = { left: 1724, top: 36, right: 3429, bottom: 1429 }
const MAXIMIZED = { left: 0, top: 24, right: 3440, bottom: 1440 }

describe('displayCoverage', () => {
  it('keeps each window frame on an unscaled display as it is', () => {
    expect(displayCoverage([LEFT_TILE, RIGHT_TILE], PRIMARY, 1)).toEqual([LEFT_TILE, RIGHT_TILE])
  })

  it('measures from the display origin in its own scaled points', () => {
    const frame = { left: 3440 + 300, top: 36, right: 3440 + 1500, bottom: 1200 }
    expect(displayCoverage([frame], SECONDARY_SCALED, 1.5)).toEqual([{ left: 200, top: 24, right: 1000, bottom: 800 }])
  })

  it('rounds fractional edges outward so a touching window still reaches the Ridge edge', () => {
    const frame = { left: 3440 + 1, top: 37, right: 3440 + 902, bottom: 901 }
    expect(displayCoverage([frame], SECONDARY_SCALED, 1.5)).toEqual([{ left: 0, top: 24, right: 602, bottom: 601 }])
  })

  it('keeps only the part of a window that lies on the display', () => {
    const straddling = { left: 3000, top: 100, right: 4000, bottom: 600 }
    expect(displayCoverage([straddling], PRIMARY, 1)).toEqual([{ left: 3000, top: 100, right: 3440, bottom: 600 }])
  })

  it('drops windows on other displays', () => {
    const elsewhere = { left: 3500, top: 100, right: 4000, bottom: 600 }
    expect(displayCoverage([elsewhere], PRIMARY, 1)).toEqual([])
  })

  it('drops windows without any area', () => {
    const collapsed = { left: 500, top: 500, right: 500, bottom: 900 }
    expect(displayCoverage([collapsed], PRIMARY, 1)).toEqual([])
  })

  it('drops a window hidden inside a larger one, which adds nothing to the covered area', () => {
    expect(displayCoverage([LEFT_TILE, MAXIMIZED, RIGHT_TILE], PRIMARY, 1)).toEqual([MAXIMIZED])
  })

  it('keeps a single copy of windows stacked in the same place', () => {
    expect(displayCoverage([LEFT_TILE, { ...LEFT_TILE }], PRIMARY, 1)).toEqual([LEFT_TILE])
  })

  it('orders rectangles by position so a change of focus alone reads as no change', () => {
    expect(displayCoverage([RIGHT_TILE, LEFT_TILE], PRIMARY, 1)).toEqual(displayCoverage([LEFT_TILE, RIGHT_TILE], PRIMARY, 1))
  })
})

describe('sameCoverage', () => {
  it('matches equal rectangles in the same order', () => {
    expect(sameCoverage([LEFT_TILE, RIGHT_TILE], [{ ...LEFT_TILE }, { ...RIGHT_TILE }])).toBe(true)
  })

  it('matches two empty coverages', () => {
    expect(sameCoverage([], [])).toBe(true)
  })

  it('notices a moved window', () => {
    expect(sameCoverage([LEFT_TILE], [{ ...LEFT_TILE, top: 40 }])).toBe(false)
  })

  it('notices a window that appeared', () => {
    expect(sameCoverage([LEFT_TILE], [LEFT_TILE, RIGHT_TILE])).toBe(false)
  })

  it('treats a display measured for the first time as changed', () => {
    expect(sameCoverage(undefined, [])).toBe(false)
  })
})
