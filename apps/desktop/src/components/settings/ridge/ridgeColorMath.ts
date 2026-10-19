const HEX_PATTERN = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i

const FULL_TURN = 360

const SMALL_SHADE_STEP = 0.01

const LARGE_SHADE_STEP = 0.1

const SMALL_HUE_STEP = 1

const LARGE_HUE_STEP = 10

export function toHex({ r, g, b }: RidgeRgb): string {
  return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
}

function expandShorthand(digits: string): string {
  return digits.length === 3 ? [...digits].map((digit) => digit + digit).join('') : digits
}

export function parseHex(text: string): RidgeRgb | null {
  const match = HEX_PATTERN.exec(text.trim())
  if (!match) return null
  const digits = expandShorthand(match[1])
  const channel = (start: number) => Number.parseInt(digits.slice(start, start + 2), 16)
  return { r: channel(0), g: channel(2), b: channel(4) }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function hueSector(red: number, green: number, blue: number, max: number, chroma: number): number {
  if (max === red) return ((green - blue) / chroma + 6) % 6
  if (max === green) return (blue - red) / chroma + 2
  return (red - green) / chroma + 4
}

export function rgbToHsv({ r, g, b }: RidgeRgb, fallbackHue: number): RidgeHsv {
  const red = r / 255
  const green = g / 255
  const blue = b / 255
  const max = Math.max(red, green, blue)
  const chroma = max - Math.min(red, green, blue)
  return {
    h: chroma === 0 ? fallbackHue : hueSector(red, green, blue, max, chroma) * 60,
    s: max === 0 ? 0 : chroma / max,
    v: max,
  }
}

export function hsvToRgb({ h, s, v }: RidgeHsv): RidgeRgb {
  const channel = (offset: number) => {
    const position = (offset + h / 60) % 6
    return Math.round(255 * (v - v * s * clamp(Math.min(position, 4 - position), 0, 1)))
  }
  return { r: channel(5), g: channel(3), b: channel(1) }
}

export function pureHue(hue: number): RidgeRgb {
  return hsvToRgb({ h: hue, s: 1, v: 1 })
}

export function fractionAlong(pointer: number, start: number, length: number): number {
  if (length <= 0) return 0
  return clamp((pointer - start) / length, 0, 1)
}

export function shadeAt(hue: number, x: number, y: number): RidgeHsv {
  return { h: hue, s: x, v: 1 - y }
}

export function steppedShade(hsv: RidgeHsv, key: string, large: boolean): RidgeHsv | null {
  const step = large ? LARGE_SHADE_STEP : SMALL_SHADE_STEP
  if (key === 'ArrowLeft') return { ...hsv, s: clamp(hsv.s - step, 0, 1) }
  if (key === 'ArrowRight') return { ...hsv, s: clamp(hsv.s + step, 0, 1) }
  if (key === 'ArrowDown') return { ...hsv, v: clamp(hsv.v - step, 0, 1) }
  if (key === 'ArrowUp') return { ...hsv, v: clamp(hsv.v + step, 0, 1) }
  return null
}

export function steppedHue(hue: number, key: string, large: boolean): number | null {
  const step = large ? LARGE_HUE_STEP : SMALL_HUE_STEP
  if (key === 'ArrowLeft' || key === 'ArrowDown') return clamp(hue - step, 0, FULL_TURN)
  if (key === 'ArrowRight' || key === 'ArrowUp') return clamp(hue + step, 0, FULL_TURN)
  if (key === 'Home') return 0
  if (key === 'End') return FULL_TURN
  return null
}

export function hueAt(fraction: number): number {
  return fraction * FULL_TURN
}

export function hueFraction(hue: number): number {
  return hue / FULL_TURN
}
