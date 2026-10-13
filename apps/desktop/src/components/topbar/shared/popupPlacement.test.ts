import { describe, it, expect } from 'vitest'
import { placePopup } from './popupPlacement'

const SCREEN_WIDTH = 1920
const ODD_WIDTH = 141

function bodyEdges(placement: { centerX: number }, bodyWidth: number) {
  return { left: placement.centerX - bodyWidth / 2, right: placement.centerX + bodyWidth / 2 }
}

describe('placePopup', () => {
  it('puts a menu of odd width flush against the left screen edge', () => {
    const placement = placePopup(12, ODD_WIDTH, SCREEN_WIDTH)
    expect(placement.anchor).toBe('left')
    expect(placement.left).toBe(0)
    expect(bodyEdges(placement, ODD_WIDTH).left).toBe(0)
  })

  it('puts a menu of odd width flush against the right screen edge', () => {
    const placement = placePopup(SCREEN_WIDTH - 12, ODD_WIDTH, SCREEN_WIDTH)
    expect(placement.anchor).toBe('right')
    expect(placement.left + ODD_WIDTH).toBe(SCREEN_WIDTH)
    expect(bodyEdges(placement, ODD_WIDTH).right).toBe(SCREEN_WIDTH)
  })

  it('starts a centered menu on a whole pixel', () => {
    const placement = placePopup(800.5, ODD_WIDTH, SCREEN_WIDTH)
    expect(placement.anchor).toBe('center')
    expect(Number.isInteger(placement.left)).toBe(true)
    expect(bodyEdges(placement, ODD_WIDTH).left).toBe(placement.left)
  })
})
