import { describe, it, expect, vi } from 'vitest'
import touchpadNative from './touchpadNative.js'

const { NATIVE_ADDON_PATH, bindTouchpad, loadNativeTouchpad } = touchpadNative

const REPORT = { contactCount: 1, contacts: [{ id: 0, touching: true, x: 0.5, y: 0.5 }] }

describe('bindTouchpad', () => {
  it('hands reports and failures to their own callbacks', () => {
    const addon = { touchpadWatch: vi.fn() }
    const onReport = vi.fn()
    const onFailure = vi.fn()
    bindTouchpad(addon).watch(onReport, onFailure)
    const listener = addon.touchpadWatch.mock.calls[0][0]
    listener(null, REPORT)
    listener(new Error('gone'), undefined)
    expect(onReport).toHaveBeenCalledWith(REPORT)
    expect(onFailure).toHaveBeenCalledWith(new Error('gone'))
  })

  it('reports a watch that cannot start', () => {
    const onFailure = vi.fn()
    const addon = { touchpadWatch: () => { throw new Error('no window') } }
    bindTouchpad(addon).watch(vi.fn(), onFailure)
    expect(onFailure).toHaveBeenCalledWith(new Error('no window'))
  })

  it('refuses an add-on built before the touchpad exports', () => {
    expect(() => bindTouchpad({})).toThrow('no touchpad exports')
  })
})

describe('loadNativeTouchpad', () => {
  it('loads the add-on from the electron native folder', () => {
    const requireAddon = vi.fn(() => ({ touchpadWatch: vi.fn() }))
    expect(loadNativeTouchpad(requireAddon)?.kind).toBe('native')
    expect(requireAddon).toHaveBeenCalledWith(NATIVE_ADDON_PATH)
  })

  it('gives up quietly when the add-on is missing or too old', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(loadNativeTouchpad(() => { throw new Error('Cannot find module') })).toBeNull()
    expect(loadNativeTouchpad(() => ({}))).toBeNull()
    error.mockRestore()
  })
})
