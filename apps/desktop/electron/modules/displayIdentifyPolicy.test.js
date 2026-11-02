import { describe, expect, it } from 'vitest'
import displayIdentifyPolicy from './displayIdentifyPolicy.js'

const { planIdentifyBadges, badgeBoundsWithin } = displayIdentifyPolicy

const identity = (rect) => ({ ...rect })
const halfScale = (rect) => ({ x: rect.x / 2, y: rect.y / 2, width: rect.width / 2, height: rect.height / 2 })

const twoDisplays = [
  { id: '\\\\.\\DISPLAY1', x: 0, y: 0, width: 1920, height: 1080 },
  { id: '\\\\.\\DISPLAY2', x: 1920, y: -200, width: 2560, height: 1440 },
]

describe('planIdentifyBadges', () => {
  it('numbers the displays in the order settings lists them', () => {
    const badges = planIdentifyBadges(twoDisplays, identity)
    expect(badges.map(({ displayId, number }) => ({ displayId, number }))).toEqual([
      { displayId: '\\\\.\\DISPLAY1', number: 1 },
      { displayId: '\\\\.\\DISPLAY2', number: 2 },
    ])
  })

  it('places each badge in the bottom-left corner of its own display', () => {
    const [first, second] = planIdentifyBadges(twoDisplays, identity)
    expect(first.bounds).toEqual({ x: 40, y: 1080 - 40 - 132, width: 132, height: 132 })
    expect(second.bounds).toEqual({ x: 1920 + 40, y: -200 + 1440 - 40 - 132, width: 132, height: 132 })
  })

  it('positions badges in the converted coordinates', () => {
    const [, second] = planIdentifyBadges(twoDisplays, halfScale)
    expect(second.bounds).toEqual({ x: 960 + 40, y: -100 + 720 - 40 - 132, width: 132, height: 132 })
  })

  it('keeps the number of a display when one before it cannot be converted', () => {
    const badges = planIdentifyBadges(twoDisplays, (rect) => (rect.x === 0 ? null : rect))
    expect(badges.map((badge) => badge.number)).toEqual([2])
  })

  it('skips a display without a size', () => {
    const badges = planIdentifyBadges([{ id: 'x', x: 0, y: 0, width: 0, height: 0 }, twoDisplays[0]], identity)
    expect(badges.map((badge) => badge.number)).toEqual([2])
  })

  it('returns nothing for a missing list', () => {
    expect(planIdentifyBadges(null, identity)).toEqual([])
  })
})

describe('badgeBoundsWithin', () => {
  it('shrinks the badge to fit a display smaller than it', () => {
    expect(badgeBoundsWithin({ x: 0, y: 0, width: 100, height: 80 })).toEqual({ x: 0, y: 0, width: 80, height: 80 })
  })
})
