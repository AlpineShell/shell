import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'

let usePluginSetting: typeof import('./usePluginSetting').usePluginSetting

const WEATHER = 'com.example.weather'
const NOTES = 'com.example.notes'

function stubSettings(initial: Record<string, PluginSettingValues>) {
  const stored: Record<string, PluginSettingValues> = { ...initial }
  const changeListeners: ((change: PluginSettingsChange) => void)[] = []
  const get = vi.fn((pluginId: string) => Promise.resolve(stored[pluginId] ?? {}))
  const set = vi.fn((pluginId: string, key: string, value: PluginSettingValue): Promise<PluginSettingWriteResult> => {
    stored[pluginId] = { ...stored[pluginId], [key]: value }
    return Promise.resolve({ ok: true, values: stored[pluginId] })
  })
  const onChanged = vi.fn((listener: (change: PluginSettingsChange) => void) => {
    changeListeners.push(listener)
    return () => {}
  })
  Object.assign(window, { plugins: { settings: { get, set, onChanged } } })
  return { get, set, broadcast: (change: PluginSettingsChange) => changeListeners.forEach((listener) => listener(change)) }
}

async function settle() {
  await act(async () => {})
}

beforeEach(async () => {
  vi.resetModules()
  usePluginSetting = (await import('./usePluginSetting')).usePluginSetting
})

afterEach(() => {
  delete (window as unknown as { plugins?: unknown }).plugins
  delete (window as unknown as { alpine?: unknown }).alpine
})

describe('usePluginSetting', () => {
  it('reads the value the host holds for the plugin it names', async () => {
    const bridge = stubSettings({ [WEATHER]: { unit: 'f' } })
    const { result } = renderHook(() => usePluginSetting(WEATHER, 'unit'))
    await settle()
    expect(bridge.get).toHaveBeenCalledWith(WEATHER)
    expect(result.current[0]).toBe('f')
  })

  it('writes through the host and shows the new value at once', async () => {
    const bridge = stubSettings({ [WEATHER]: { unit: 'c' } })
    const { result } = renderHook(() => usePluginSetting(WEATHER, 'unit'))
    await settle()
    act(() => result.current[1]('f'))
    expect(result.current[0]).toBe('f')
    await settle()
    expect(bridge.set).toHaveBeenCalledWith(WEATHER, 'unit', 'f')
  })

  it('follows a change made in another window', async () => {
    const bridge = stubSettings({ [WEATHER]: { unit: 'c' } })
    const { result } = renderHook(() => usePluginSetting(WEATHER, 'unit'))
    await settle()
    act(() => bridge.broadcast({ pluginId: WEATHER, values: { unit: 'f' } }))
    expect(result.current[0]).toBe('f')
  })

  it('keeps its value when another plugin changes', async () => {
    const bridge = stubSettings({ [WEATHER]: { unit: 'c' } })
    const { result } = renderHook(() => usePluginSetting(WEATHER, 'unit'))
    await settle()
    act(() => bridge.broadcast({ pluginId: NOTES, values: { unit: 'f' } }))
    expect(result.current[0]).toBe('c')
  })

  it('puts the old value back when the host refuses the write', async () => {
    const bridge = stubSettings({ [WEATHER]: { unit: 'c' } })
    bridge.set.mockResolvedValueOnce({ ok: false, error: 'That value is not one this setting takes.' })
    const { result } = renderHook(() => usePluginSetting(WEATHER, 'unit'))
    await settle()
    act(() => result.current[1]('kelvin'))
    await settle()
    expect(result.current[0]).toBe('c')
  })

  it('reads a plugin once, however many of its settings are in use', async () => {
    const bridge = stubSettings({ [WEATHER]: { unit: 'c', wind: true } })
    const { result } = renderHook(() => [usePluginSetting(WEATHER, 'unit')[0], usePluginSetting(WEATHER, 'wind')[0]])
    await settle()
    expect(bridge.get).toHaveBeenCalledTimes(1)
    expect(result.current).toEqual(['c', true])
  })

  it('is offered to plugins on window.alpine', async () => {
    stubSettings({})
    const { installPluginRuntime } = await import('../plugins/pluginRuntime')
    installPluginRuntime()
    expect(window.alpine?.usePluginSetting).toBe(usePluginSetting)
  })
})
