import { describe, expect, it, vi } from 'vitest'
import { createPluginSettings } from './pluginBackendSettings.js'

const INITIAL = { unit: 'c', 'show-wind': false, refresh: 10 }

function settings(initial = INITIAL) {
  const report = vi.fn()
  return { ...createPluginSettings(initial, report), report }
}

describe('ctx.settings.get', () => {
  it('answers with the values the backend started with', () => {
    const { api } = settings()
    expect(api.get('unit')).toBe('c')
    expect(api.get('show-wind')).toBe(false)
    expect(api.get('refresh')).toBe(10)
  })

  it('answers undefined for a key the plugin does not declare, even one every object has', () => {
    const { api } = settings()
    expect(api.get('retired')).toBeUndefined()
    expect(api.get('toString')).toBeUndefined()
  })

  it('starts empty when the host sent no values', () => {
    expect(createPluginSettings(undefined, vi.fn()).api.get('unit')).toBeUndefined()
  })

  it('answers with the new value once the host sends one', () => {
    const { api, apply } = settings()
    apply({ ...INITIAL, unit: 'f' })
    expect(api.get('unit')).toBe('f')
  })
})

describe('ctx.settings.onChange', () => {
  it('tells a listener about each key that changed, and no other', () => {
    const { api, apply } = settings()
    const listener = vi.fn()
    api.onChange(listener)
    apply({ unit: 'f', 'show-wind': true, refresh: 10 })
    expect(listener.mock.calls).toEqual([
      ['unit', 'f'],
      ['show-wind', true],
    ])
  })

  it('stays quiet when the host sends the same values again', () => {
    const { api, apply } = settings()
    const listener = vi.fn()
    api.onChange(listener)
    apply({ ...INITIAL })
    expect(listener).not.toHaveBeenCalled()
  })

  it('stops telling a listener that unsubscribed', () => {
    const { api, apply } = settings()
    const listener = vi.fn()
    const unsubscribe = api.onChange(listener)
    unsubscribe()
    apply({ ...INITIAL, unit: 'f' })
    expect(listener).not.toHaveBeenCalled()
  })

  it('keeps telling the other listeners when one throws, and reports it', () => {
    const { api, apply, report } = settings()
    const survivor = vi.fn()
    api.onChange(() => {
      throw new Error('boom')
    })
    api.onChange(survivor)
    apply({ ...INITIAL, unit: 'f' })
    expect(survivor).toHaveBeenCalledWith('unit', 'f')
    expect(report).toHaveBeenCalledWith('settings listener threw: boom')
  })

  it('ignores values that are not an object', () => {
    const { api, apply } = settings()
    const listener = vi.fn()
    api.onChange(listener)
    apply(null)
    expect(listener).not.toHaveBeenCalled()
    expect(api.get('unit')).toBe('c')
  })
})
