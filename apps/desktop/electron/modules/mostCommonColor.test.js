import { describe, it, expect } from 'vitest'
import mostCommonColorModule from './mostCommonColor.js'

const { mostCommonColor } = mostCommonColorModule

function bgraStrip(colors) {
  const pixels = Buffer.alloc(colors.length * 4)
  colors.forEach(({ r, g, b }, index) => {
    pixels[index * 4] = b
    pixels[index * 4 + 1] = g
    pixels[index * 4 + 2] = r
    pixels[index * 4 + 3] = 255
  })
  return pixels
}

const BLACK = { r: 0, g: 0, b: 0 }
const WHITE = { r: 255, g: 255, b: 255 }

describe('mostCommonColor', () => {
  it('picks the colour most of the strip shows, not the one in the middle', () => {
    const strip = [...Array(40).fill(BLACK), ...Array(10).fill(WHITE), ...Array(40).fill(BLACK)]
    expect(mostCommonColor(bgraStrip(strip))).toEqual(BLACK)
  })

  it('averages near-identical shades into one colour', () => {
    const strip = [{ r: 32, g: 32, b: 36 }, { r: 34, g: 34, b: 38 }, WHITE]
    expect(mostCommonColor(bgraStrip(strip))).toEqual({ r: 33, g: 33, b: 37 })
  })

  it('returns null for an empty strip', () => {
    expect(mostCommonColor(Buffer.alloc(0))).toBeNull()
  })
})
