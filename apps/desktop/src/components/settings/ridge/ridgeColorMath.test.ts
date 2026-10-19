import { describe, expect, it } from 'vitest'
import {
  fractionAlong,
  hsvToRgb,
  hueAt,
  hueFraction,
  parseHex,
  pureHue,
  rgbToHsv,
  shadeAt,
  steppedHue,
  steppedShade,
  toHex,
} from './ridgeColorMath'

const NAVY: RidgeRgb = { r: 30, g: 40, b: 60 }
const MID_GREY: RidgeRgb = { r: 128, g: 128, b: 128 }

describe('hex colors', () => {
  it('writes a color as six lowercase digits', () => {
    expect(toHex({ r: 10, g: 171, b: 255 })).toBe('#0aabff')
  })

  it('reads six digits with or without the hash', () => {
    expect(parseHex('#1e283c')).toEqual(NAVY)
    expect(parseHex('1E283C')).toEqual(NAVY)
  })

  it('reads three-digit shorthand', () => {
    expect(parseHex('#f80')).toEqual({ r: 255, g: 136, b: 0 })
  })

  it('ignores surrounding spaces', () => {
    expect(parseHex('  #1e283c ')).toEqual(NAVY)
  })

  it('refuses anything that is not a whole hex color', () => {
    expect(parseHex('')).toBeNull()
    expect(parseHex('#1e28')).toBeNull()
    expect(parseHex('#1e283g')).toBeNull()
    expect(parseHex('##1e283c')).toBeNull()
  })
})

describe('hsv conversion', () => {
  it('turns the primaries into their hues at full saturation and brightness', () => {
    expect(rgbToHsv({ r: 255, g: 0, b: 0 }, 0)).toEqual({ h: 0, s: 1, v: 1 })
    expect(rgbToHsv({ r: 0, g: 255, b: 0 }, 0)).toEqual({ h: 120, s: 1, v: 1 })
    expect(rgbToHsv({ r: 0, g: 0, b: 255 }, 0)).toEqual({ h: 240, s: 1, v: 1 })
  })

  it('keeps the hue it was given for a grey, which has none of its own', () => {
    expect(rgbToHsv(MID_GREY, 200)).toEqual({ h: 200, s: 0, v: 128 / 255 })
  })

  it('gives black no saturation', () => {
    expect(rgbToHsv({ r: 0, g: 0, b: 0 }, 45)).toEqual({ h: 45, s: 0, v: 0 })
  })

  it('wraps a magenta-side red into the top of the circle', () => {
    expect(rgbToHsv({ r: 255, g: 0, b: 128 }, 0).h).toBeCloseTo(329.9, 1)
  })

  it('returns every color it converts to hsv', () => {
    for (const color of [NAVY, MID_GREY, { r: 245, g: 235, b: 228 }, { r: 255, g: 0, b: 128 }, { r: 3, g: 250, b: 97 }]) {
      expect(hsvToRgb(rgbToHsv(color, 0))).toEqual(color)
    }
  })

  it('treats a full turn of the hue as red again', () => {
    expect(hsvToRgb({ h: 360, s: 1, v: 1 })).toEqual({ r: 255, g: 0, b: 0 })
  })

  it('paints a hue at full strength', () => {
    expect(pureHue(60)).toEqual({ r: 255, g: 255, b: 0 })
  })
})

describe('pointer positions', () => {
  it('measures how far along a box the pointer is', () => {
    expect(fractionAlong(150, 100, 200)).toBe(0.25)
  })

  it('holds a pointer dragged past either edge at that edge', () => {
    expect(fractionAlong(50, 100, 200)).toBe(0)
    expect(fractionAlong(400, 100, 200)).toBe(1)
  })

  it('answers zero for a box with no size', () => {
    expect(fractionAlong(150, 100, 0)).toBe(0)
  })

  it('reads saturation across and brightness down the shade field', () => {
    expect(shadeAt(210, 0.25, 0.75)).toEqual({ h: 210, s: 0.25, v: 0.25 })
  })

  it('spreads the hue across the whole slider', () => {
    expect(hueAt(0.5)).toBe(180)
    expect(hueFraction(90)).toBe(0.25)
  })
})

describe('keyboard steps', () => {
  const shade: RidgeHsv = { h: 30, s: 0.5, v: 0.5 }

  it('moves saturation sideways and brightness up and down', () => {
    expect(steppedShade(shade, 'ArrowRight', false)).toEqual({ h: 30, s: 0.51, v: 0.5 })
    expect(steppedShade(shade, 'ArrowLeft', false)).toEqual({ h: 30, s: 0.49, v: 0.5 })
    expect(steppedShade(shade, 'ArrowUp', false)).toEqual({ h: 30, s: 0.5, v: 0.51 })
    expect(steppedShade(shade, 'ArrowDown', false)).toEqual({ h: 30, s: 0.5, v: 0.49 })
  })

  it('takes larger steps with Shift', () => {
    expect(steppedShade(shade, 'ArrowRight', true)).toEqual({ h: 30, s: 0.6, v: 0.5 })
  })

  it('stops a shade at the edge of the field', () => {
    expect(steppedShade({ h: 30, s: 1, v: 0 }, 'ArrowRight', true)).toEqual({ h: 30, s: 1, v: 0 })
    expect(steppedShade({ h: 30, s: 1, v: 0 }, 'ArrowDown', true)).toEqual({ h: 30, s: 1, v: 0 })
  })

  it('ignores a key that does not move the shade', () => {
    expect(steppedShade(shade, 'Enter', false)).toBeNull()
  })

  it('steps the hue by one degree, or ten with Shift', () => {
    expect(steppedHue(100, 'ArrowRight', false)).toBe(101)
    expect(steppedHue(100, 'ArrowDown', false)).toBe(99)
    expect(steppedHue(100, 'ArrowUp', true)).toBe(110)
    expect(steppedHue(100, 'ArrowLeft', true)).toBe(90)
  })

  it('jumps the hue to either end with Home and End', () => {
    expect(steppedHue(100, 'Home', false)).toBe(0)
    expect(steppedHue(100, 'End', false)).toBe(360)
  })

  it('stops the hue at either end of the slider', () => {
    expect(steppedHue(355, 'ArrowRight', true)).toBe(360)
    expect(steppedHue(4, 'ArrowLeft', true)).toBe(0)
  })

  it('ignores a key that does not move the hue', () => {
    expect(steppedHue(100, 'Tab', false)).toBeNull()
  })
})
