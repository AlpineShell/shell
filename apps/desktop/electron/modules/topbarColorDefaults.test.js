import { describe, expect, it } from 'vitest'
import { createRequire } from 'module'

const nodeRequire = createRequire(import.meta.url)
const { DEFAULT_TOPBAR_COLOR, storedOverride } = nodeRequire('./topbarColorDefaults.js')

describe('storedOverride', () => {
  it('gives a fresh install the dark grey Ridge on every wallpaper', () => {
    expect(storedOverride(undefined)).toEqual({ r: 32, g: 32, b: 32, darkText: false })
  })

  it('gives the default to a store that never saved a colour choice', () => {
    expect(storedOverride({ showSearchIcon: true })).toBe(DEFAULT_TOPBAR_COLOR)
  })

  it('keeps following the wallpaper for someone who chose Automatic', () => {
    expect(storedOverride({ color: null, showSearchIcon: false })).toBeNull()
  })

  it('keeps a colour someone picked', () => {
    const picked = { r: 200, g: 120, b: 40, darkText: true }
    expect(storedOverride({ color: picked })).toBe(picked)
  })

  it.each([[{ color: { r: '32' } }], [{ color: 'dark' }], [{ color: {} }]])('treats a damaged colour %j as Automatic', (data) => {
    expect(storedOverride(data)).toBeNull()
  })

  it.each([[null], [5], ['text']])('gives the default to a store that is not an object: %j', (data) => {
    expect(storedOverride(data)).toBe(DEFAULT_TOPBAR_COLOR)
  })
})
