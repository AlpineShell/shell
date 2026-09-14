import { afterEach, describe, expect, it, vi, type Mock } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { ridgePluginRecord } from '../components/settings/ridge/ridgeTestFixtures'
import { useRidgePluginWidgets } from './useRidgePluginWidgets'

const WEATHER = ridgePluginRecord({ contributes: { topbarWidgets: [{ slot: 'left', export: 'Forecast' }] } })
const NOTES = ridgePluginRecord({ id: 'com.example.notes', name: 'Notes', contributes: { topbarWidgets: [{ slot: 'right' }] } })

function stubPlugins(list: Mock) {
  const reloadListeners: (() => void)[] = []
  const stopListening = vi.fn()
  const onReload = (callback: () => void) => {
    reloadListeners.push(callback)
    return stopListening
  }
  Object.assign(window, { plugins: { list, onReload } })
  return { reload: () => reloadListeners.forEach((listener) => listener()), stopListening }
}

function pluginNames(widgets: RidgePluginWidget[]): string[] {
  return widgets.map((widget) => widget.pluginName)
}

afterEach(() => {
  delete (window as unknown as { plugins?: unknown }).plugins
})

describe('useRidgePluginWidgets', () => {
  it('splits the placeholders between the left and right plugin groups', async () => {
    stubPlugins(vi.fn().mockResolvedValue([WEATHER, NOTES]))
    const { result } = renderHook(() => useRidgePluginWidgets())
    await act(async () => {})
    expect(result.current.left.map((widget) => widget.id)).toEqual(['com.example.weather:Forecast'])
    expect(result.current.right.map((widget) => widget.id)).toEqual(['com.example.notes:default'])
  })

  it('reads the plugin list again when plugins reload', async () => {
    const list = vi.fn().mockResolvedValueOnce([WEATHER]).mockResolvedValueOnce([WEATHER, NOTES])
    const plugins = stubPlugins(list)
    const { result } = renderHook(() => useRidgePluginWidgets())
    await act(async () => {})
    expect(pluginNames(result.current.right)).toEqual([])
    await act(async () => plugins.reload())
    expect(list).toHaveBeenCalledTimes(2)
    expect(pluginNames(result.current.right)).toEqual(['Notes'])
  })

  it('keeps the widgets it has when a reload cannot read the list', async () => {
    const list = vi.fn().mockResolvedValueOnce([WEATHER]).mockRejectedValueOnce(new Error('plugin host restarting'))
    const plugins = stubPlugins(list)
    const { result } = renderHook(() => useRidgePluginWidgets())
    await act(async () => {})
    await act(async () => plugins.reload())
    expect(list).toHaveBeenCalledTimes(2)
    expect(pluginNames(result.current.left)).toEqual(['Weather'])
  })

  it('stops listening for reloads when unmounted', () => {
    const plugins = stubPlugins(vi.fn().mockResolvedValue([]))
    const { unmount } = renderHook(() => useRidgePluginWidgets())
    unmount()
    expect(plugins.stopListening).toHaveBeenCalledTimes(1)
  })
})
