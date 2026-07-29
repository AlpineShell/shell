import { describe, it, expect } from 'vitest'
import { surfaceFillPath, barBorderPath } from './surfaceShape'

const centered = {
  centerX: 500,
  bodyWidth: 200,
  height: 40,
  barBottom: 0,
  screenWidth: 1000,
  anchor: 'center' as const,
}

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
    expect(barBorderPath(centered, false, false)).toBe('M0 0 L1000 0')
  })

  it('breaks the line around the surface when not outlining it', () => {
    expect(barBorderPath(centered, true, false)).toBe('M0 0 L386 0 M614 0 L1000 0')
  })

  it('traces the surface outline and rejoins the bar edges', () => {
    const path = barBorderPath(centered, true, true)
    expect(path.startsWith('M0 0 L386 0')).toBe(true)
    expect(path.endsWith('L1000 0')).toBe(true)
  })
})
