import { describe, expect, it } from 'vitest'
import { parseRootReloadCount, planRootReload } from './rootReload'

describe('parseRootReloadCount', () => {
  it('reads a stored count', () => {
    expect(parseRootReloadCount('2')).toBe(2)
  })

  it('treats a missing or unreadable count as none', () => {
    expect(parseRootReloadCount(null)).toBe(0)
    expect(parseRootReloadCount('')).toBe(0)
    expect(parseRootReloadCount('many')).toBe(0)
    expect(parseRootReloadCount('-1')).toBe(0)
    expect(parseRootReloadCount('1.5')).toBe(0)
  })
})

describe('planRootReload', () => {
  it('reloads after a second the first time', () => {
    expect(planRootReload(0)).toEqual({ reload: true, delayMs: 1000 })
  })

  it('waits twice as long before each further reload', () => {
    expect(planRootReload(1).delayMs).toBe(2000)
    expect(planRootReload(2).delayMs).toBe(4000)
  })

  it('stops reloading a view that keeps failing', () => {
    expect(planRootReload(3)).toEqual({ reload: false, delayMs: 0 })
    expect(planRootReload(10).reload).toBe(false)
  })
})
