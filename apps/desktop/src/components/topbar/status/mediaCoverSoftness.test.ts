import { describe, it, expect } from 'vitest'
import { coverBlurPx, MAX_COVER_BLUR } from './mediaCoverSoftness'

const POPUP_COVER = { width: 400, height: 138 }

describe('coverBlurPx', () => {
  it('keeps a cover sharp when it has the pixels the screen needs', () => {
    expect(coverBlurPx({ width: 1000, height: 1000 }, POPUP_COVER, 1.5)).toBe(0)
  })

  it('softens a small thumbnail stretched across the popup', () => {
    expect(coverBlurPx({ width: 150, height: 83 }, POPUP_COVER, 1.5)).toBeGreaterThan(0)
  })

  it('softens a cover more the further it is stretched', () => {
    const spotify = coverBlurPx({ width: 300, height: 300 }, POPUP_COVER, 1.5)
    const chrome = coverBlurPx({ width: 150, height: 83 }, POPUP_COVER, 1.5)
    expect(chrome).toBeGreaterThan(spotify)
  })

  it('never softens past the cap', () => {
    expect(coverBlurPx({ width: 16, height: 16 }, POPUP_COVER, 2)).toBe(MAX_COVER_BLUR)
  })

  it('leaves a cover alone until its size is known', () => {
    expect(coverBlurPx(null, POPUP_COVER, 1.5)).toBe(0)
    expect(coverBlurPx({ width: 0, height: 0 }, POPUP_COVER, 1.5)).toBe(0)
  })
})
