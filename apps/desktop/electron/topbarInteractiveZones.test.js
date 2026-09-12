import { describe, it, expect } from 'vitest'
import topbarInteractiveZones from './topbarInteractiveZones.js'

const { MAX_INTERACTIVE_ZONES, sanitizeInteractiveZones, isCursorInInteractiveZone } = topbarInteractiveZones

const BAR_WIDTH = 1920

function takesClicksAt(positions, zones, width = BAR_WIDTH) {
  return positions.map((localX) => isCursorInInteractiveZone(localX, zones, width))
}

describe('isCursorInInteractiveZone', () => {
  it('uses the fixed zones until the bar reports its clusters', () => {
    expect(takesClicksAt([0, 299, 900, 1019, 1320, 1919], null)).toEqual([true, true, true, true, true, true])
    expect(takesClicksAt([300, 899, 1020, 1319], null)).toEqual([false, false, false, false])
  })

  it('centres the fixed middle zone on the bar it is given', () => {
    expect(takesClicksAt([1220, 1339], null, 2560)).toEqual([true, true])
    expect(takesClicksAt([960, 1219, 1340], null, 2560)).toEqual([false, false, false])
  })

  it('takes no clicks anywhere once the bar reports no clusters', () => {
    expect(takesClicksAt([0, 150, 960, 1500, 1919], [])).toEqual([false, false, false, false, false])
  })

  it('takes clicks inside a reported span, its left edge in and its right edge out', () => {
    const zones = [{ left: 0, right: 98 }, { left: 1492, right: 1908 }]
    expect(takesClicksAt([0, 97, 1492, 1907], zones)).toEqual([true, true, true, true])
    expect(takesClicksAt([98, 960, 1491, 1908, 1919], zones)).toEqual([false, false, false, false, false])
  })

  it('reaches a cluster that grew past the fixed zones and drops the zones it left', () => {
    const clockMovedToCentre = [{ left: 0, right: 98 }, { left: 820, right: 1100 }]
    expect(takesClicksAt([850, 1050], clockMovedToCentre)).toEqual([true, true])
    expect(takesClicksAt([200, 1800], clockMovedToCentre)).toEqual([false, false])
  })
})

describe('sanitizeInteractiveZones', () => {
  it('keeps well-formed spans as they are', () => {
    const zones = [{ left: 0, right: 98 }, { left: 892, right: 1028 }, { left: 1492, right: 1908 }]
    expect(sanitizeInteractiveZones(zones, BAR_WIDTH)).toEqual(zones)
  })

  it('keeps an empty report, which means no zones at all', () => {
    expect(sanitizeInteractiveZones([], BAR_WIDTH)).toEqual([])
  })

  it('treats anything but a list as no report, so the fixed zones stay', () => {
    for (const junk of [null, undefined, 'left', 42, { left: 0, right: 98 }]) {
      expect(sanitizeInteractiveZones(junk, BAR_WIDTH)).toBeNull()
    }
  })

  it('drops a span whose edges are not finite numbers', () => {
    const valid = { left: 892, right: 1028 }
    const junkSpans = [
      null,
      'span',
      7,
      { left: Number.NaN, right: 40 },
      { left: 0, right: Number.POSITIVE_INFINITY },
      { left: '0', right: 40 },
      { right: 40 },
    ]
    for (const junk of junkSpans) {
      expect(sanitizeInteractiveZones([junk, valid], BAR_WIDTH)).toEqual([valid])
    }
  })

  it('clamps spans to the bar', () => {
    expect(sanitizeInteractiveZones([{ left: -8, right: 98 }, { left: 1880, right: 1940 }], BAR_WIDTH)).toEqual([
      { left: 0, right: 98 },
      { left: 1880, right: 1920 },
    ])
  })

  it('drops spans that are empty, reversed or wholly off the bar', () => {
    expect(
      sanitizeInteractiveZones([{ left: 40, right: 40 }, { left: 98, right: 0 }, { left: 2000, right: 2100 }], BAR_WIDTH)
    ).toEqual([])
  })

  it('keeps only the edges of a span', () => {
    expect(sanitizeInteractiveZones([{ left: 0, right: 98, top: 0, label: 'left' }], BAR_WIDTH)).toEqual([
      { left: 0, right: 98 },
    ])
  })

  it('reads at most one span per cluster', () => {
    const zones = [0, 1, 2, 3, 4].map((index) => ({ left: index * 100, right: index * 100 + 50 }))
    expect(MAX_INTERACTIVE_ZONES).toBe(3)
    expect(sanitizeInteractiveZones(zones, BAR_WIDTH)).toEqual(zones.slice(0, MAX_INTERACTIVE_ZONES))
  })

  it('turns a report of junk spans into no zones rather than the fixed ones', () => {
    const zones = sanitizeInteractiveZones([{ left: 'a', right: 'b' }], BAR_WIDTH)
    expect(zones).toEqual([])
    expect(takesClicksAt([0, 960, 1919], zones)).toEqual([false, false, false])
  })
})
