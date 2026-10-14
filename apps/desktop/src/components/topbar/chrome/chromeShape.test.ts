import { describe, it, expect } from 'vitest'
import { SHOULDER, surfaceFillPath, barBorderPath, windowCoverageClipPath, chromeSurfaceBounds, chromeContentBounds } from './chromeShape'

const surface = {
  centerX: 500,
  bodyWidth: 200,
  height: 40,
  barBottom: 0,
  anchor: 'center' as const,
}

const centered = { ...surface, screenWidth: 1000 }

describe('surfaceFillPath', () => {
  it('produces the expected closed path for a centered surface', () => {
    expect(surfaceFillPath(centered)).toBe(
      'M386 0 L614 0 A14 14 0 0 0 600 14 L600 26 A14 14 0 0 1 586 40 L414 40 A14 14 0 0 1 400 26 L400 14 A14 14 0 0 0 386 0 Z',
    )
  })

  it('always returns a closed path', () => {
    const path = surfaceFillPath(centered)
    expect(path.startsWith('M')).toBe(true)
    expect(path.endsWith(' Z')).toBe(true)
  })

  it('draws both shoulders when centered', () => {
    expect((surfaceFillPath(centered).match(/A/g) || []).length).toBe(4)
  })

  it('drops the left shoulder when anchored left', () => {
    const path = surfaceFillPath({ ...centered, anchor: 'left' })
    expect((path.match(/A/g) || []).length).toBe(3)
    expect(path).toContain('L400 0 Z')
  })

  it('drops the right shoulder when anchored right', () => {
    const path = surfaceFillPath({ ...centered, anchor: 'right' })
    expect((path.match(/A/g) || []).length).toBe(3)
    expect(path.startsWith('M386 0 L600 0')).toBe(true)
  })

  it('clamps radius and shoulder for short surfaces', () => {
    const path = surfaceFillPath({ ...centered, height: 10 })
    expect(path.startsWith('M395 0')).toBe(true)
    expect(path).toContain('A5 5 0 0 0')
  })
})

describe('barBorderPath', () => {
  it('draws a full-width line when there is no surface', () => {
    expect(barBorderPath(centered, false)).toBe('M0 0 L1000 0')
  })

  it('traces the surface outline and rejoins the bar edges', () => {
    expect(barBorderPath(centered, true)).toBe(
      'M0 0 L386 0 A14 14 0 0 1 400 14 L400 26 A14 14 0 0 0 414 40 L586 40 A14 14 0 0 0 600 26 L600 14 A14 14 0 0 1 614 0 L1000 0',
    )
  })

  it('runs straight down the anchored edge instead of rounding a shoulder', () => {
    const path = barBorderPath({ ...centered, anchor: 'left' }, true)
    expect(path.startsWith('M0 0 L400 0 L400 26')).toBe(true)
  })
})

describe('windowCoverageClipPath', () => {
  it('outlines each covered rectangle as its own closed subpath', () => {
    expect(windowCoverageClipPath([
      { left: 0, top: 24, right: 700, bottom: 1080 },
      { left: 720, top: 36, right: 1920, bottom: 1080 },
    ])).toBe('M0 24 H700 V1080 H0 Z M720 36 H1920 V1080 H720 Z')
  })

  it('is empty when no window covers the display', () => {
    expect(windowCoverageClipPath([])).toBe('')
  })
})

describe('chromeSurfaceBounds', () => {
  it('spans shoulder tip to shoulder tip when centered', () => {
    expect(chromeSurfaceBounds(surface)).toEqual({ top: 0, bottom: 40, left: 386, right: 614 })
  })

  it('drops the shoulder on the anchored edge', () => {
    expect(chromeSurfaceBounds({ ...surface, anchor: 'left' })).toEqual({ top: 0, bottom: 40, left: 400, right: 614 })
    expect(chromeSurfaceBounds({ ...surface, anchor: 'right' })).toEqual({ top: 0, bottom: 40, left: 386, right: 600 })
  })

  it('follows the shoulder the painter clamps on a short surface', () => {
    expect(chromeSurfaceBounds({ ...surface, height: 10 })).toEqual({ top: 0, bottom: 10, left: 395, right: 605 })
  })
})

describe('chromeContentBounds', () => {
  it('spans only the body, which is painted for the full height', () => {
    expect(chromeContentBounds(surface)).toEqual({ top: 0, bottom: 40, left: 400, right: 600 })
  })

  it('is unmoved by the anchor, which only drops a shoulder', () => {
    expect(chromeContentBounds({ ...surface, anchor: 'left' })).toEqual(chromeContentBounds(surface))
    expect(chromeContentBounds({ ...surface, anchor: 'right' })).toEqual(chromeContentBounds(surface))
  })

  it('sits one shoulder inside the surface bounds on each unanchored side', () => {
    const bounds = chromeSurfaceBounds(surface)
    const content = chromeContentBounds(surface)
    expect(content.left - bounds.left).toBe(SHOULDER)
    expect(bounds.right - content.right).toBe(SHOULDER)
  })

  it('matches the body edges the fill path runs straight down', () => {
    const content = chromeContentBounds(surface)
    const path = surfaceFillPath(centered)
    expect(path).toContain(`L${content.right} 26`)
    expect(path).toContain(`L${content.left} 14`)
  })
})
