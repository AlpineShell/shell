import { describe, it, expect } from 'vitest'
import exposedOwnWindows from './exposedOwnWindows.js'

const { resolveExposedOwnWindows, isExposedOwnWindow } = exposedOwnWindows

const SETTINGS_HWND = 1180576
const PLUGIN_HWND = 918273

describe('resolveExposedOwnWindows', () => {
  it('returns the handles the provider reports', () => {
    expect(resolveExposedOwnWindows(() => [SETTINGS_HWND, PLUGIN_HWND])).toEqual([SETTINGS_HWND, PLUGIN_HWND])
  })

  it('returns nothing when no provider is wired', () => {
    expect(resolveExposedOwnWindows(null)).toEqual([])
    expect(resolveExposedOwnWindows(undefined)).toEqual([])
  })

  it('returns nothing when the provider throws', () => {
    expect(resolveExposedOwnWindows(() => { throw new Error('window gone') })).toEqual([])
  })

  it('returns nothing when the provider answers with a non-array', () => {
    expect(resolveExposedOwnWindows(() => SETTINGS_HWND)).toEqual([])
  })
})

describe('isExposedOwnWindow', () => {
  const provider = () => [SETTINGS_HWND, PLUGIN_HWND]

  it('recognises a listed handle', () => {
    expect(isExposedOwnWindow(SETTINGS_HWND, provider)).toBe(true)
    expect(isExposedOwnWindow(PLUGIN_HWND, provider)).toBe(true)
  })

  it('rejects an unlisted handle', () => {
    expect(isExposedOwnWindow(1835258, provider)).toBe(false)
  })

  it('rejects a null handle even when the list is non-empty', () => {
    expect(isExposedOwnWindow(0, provider)).toBe(false)
  })

  it('rejects everything while the provider is missing', () => {
    expect(isExposedOwnWindow(SETTINGS_HWND, null)).toBe(false)
  })
})
