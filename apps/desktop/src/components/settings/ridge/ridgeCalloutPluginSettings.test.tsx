import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { liveRidgePreviewData, ridgePluginWidget } from './ridgeTestFixtures'

let RidgeCallout: typeof import('./ridgeCallout').default

const WEATHER = 'com.example.weather'

const FAHRENHEIT: PluginSettingDeclaration = {
  key: 'fahrenheit',
  type: 'toggle',
  label: 'Fahrenheit',
  info: 'Shows the temperature in degrees Fahrenheit.',
  default: false,
}

const REFRESH: PluginSettingDeclaration = { key: 'refresh', type: 'slider', label: 'Refresh every', default: 10, min: 5, max: 60, step: 5, unit: 'min' }

const COMPACT: PluginSettingDeclaration = { key: 'compact', type: 'toggle', label: 'Compact', default: true }

function widget(pluginName: string, pluginSettings: PluginSettingDeclaration[]): RidgePluginWidget {
  return { ...ridgePluginWidget('right', pluginName), pluginSettings }
}

function withRightPlugins(right: RidgePluginWidget[]): RidgePreviewData {
  const live = liveRidgePreviewData()
  return { ...live, plugins: { ...live.plugins, right } }
}

function installSettingsBridge(stored: Record<string, PluginSettingValues>) {
  const get = vi.fn((pluginId: string) => Promise.resolve(stored[pluginId] ?? {}))
  const set = vi.fn(
    (pluginId: string, key: string, value: PluginSettingValue): Promise<PluginSettingWriteResult> =>
      Promise.resolve({ ok: true, values: { ...stored[pluginId], [key]: value } })
  )
  Object.assign(window, { plugins: { settings: { get, set, onChanged: vi.fn(() => () => {}) } } })
  return { get, set }
}

async function renderPluginCallout(previewData: RidgePreviewData) {
  render(
    <RidgeCallout
      item={{ id: 'plugins-right', slot: 'right', order: 0, visible: true }}
      previewData={previewData}
      highlightedSetting={null}
      canStepEarlier
      canStepLater
      onStep={vi.fn()}
      onHide={vi.fn()}
      onNavigate={vi.fn()}
      onClose={vi.fn()}
    />
  )
  await act(async () => {})
}

beforeEach(async () => {
  vi.resetModules()
  RidgeCallout = (await import('./ridgeCallout')).default
})

afterEach(() => {
  delete (window as unknown as { plugins?: unknown }).plugins
})

describe('the settings a plugin adds to its Ridge callout', () => {
  it('draws a row for each setting of the plugin on that side, with the stored value', async () => {
    installSettingsBridge({ [WEATHER]: { fahrenheit: true, refresh: 10 } })
    await renderPluginCallout(withRightPlugins([widget('Weather', [FAHRENHEIT, REFRESH])]))
    expect(document.querySelectorAll('[data-setting]')).toHaveLength(2)
    expect(screen.getByRole('switch', { name: 'Fahrenheit' }).getAttribute('aria-checked')).toBe('true')
  })

  it('keeps the description behind the info icon', async () => {
    installSettingsBridge({ [WEATHER]: { fahrenheit: false } })
    await renderPluginCallout(withRightPlugins([widget('Weather', [FAHRENHEIT])]))
    expect(screen.getByRole('img', { name: FAHRENHEIT.info })).toBeTruthy()
  })

  it('writes a change through the plugin settings bridge', async () => {
    const { set } = installSettingsBridge({ [WEATHER]: { fahrenheit: false } })
    await renderPluginCallout(withRightPlugins([widget('Weather', [FAHRENHEIT])]))
    fireEvent.click(screen.getByRole('switch', { name: 'Fahrenheit' }))
    await act(async () => {})
    expect(set).toHaveBeenCalledWith(WEATHER, 'fahrenheit', true)
  })

  it('gives each plugin a titled section of its own when several share the side', async () => {
    installSettingsBridge({ [WEATHER]: { fahrenheit: false }, 'com.example.notes': { compact: true } })
    await renderPluginCallout(withRightPlugins([widget('Weather', [FAHRENHEIT]), widget('Notes', [COMPACT])]))
    const weather = screen.getByRole('group', { name: 'Weather' })
    const notes = screen.getByRole('group', { name: 'Notes' })
    expect(within(weather).getByRole('heading', { name: 'Weather' })).toBeTruthy()
    expect(within(weather).getByRole('switch', { name: 'Fahrenheit' })).toBeTruthy()
    expect(within(notes).getByRole('switch', { name: 'Compact' })).toBeTruthy()
  })

  it('lists a plugin once, however many widgets it has on the side', async () => {
    installSettingsBridge({ [WEATHER]: { fahrenheit: false } })
    const second = { ...widget('Weather', [FAHRENHEIT]), id: `${WEATHER}:Radar` }
    await renderPluginCallout(withRightPlugins([widget('Weather', [FAHRENHEIT]), second]))
    expect(screen.getAllByRole('switch', { name: 'Fahrenheit' })).toHaveLength(1)
  })

  it('titles nothing when only one of the plugins on the side has settings', async () => {
    installSettingsBridge({ [WEATHER]: { fahrenheit: false } })
    await renderPluginCallout(withRightPlugins([widget('Weather', [FAHRENHEIT]), widget('Notes', [])]))
    expect(screen.queryByRole('group')).toBeNull()
    expect(screen.getByRole('switch', { name: 'Fahrenheit' })).toBeTruthy()
  })

  it('adds nothing when no plugin on the side declares settings', async () => {
    const { get } = installSettingsBridge({})
    await renderPluginCallout(withRightPlugins([widget('Weather', [])]))
    expect(document.querySelectorAll('[data-setting]')).toHaveLength(0)
    expect(get).not.toHaveBeenCalled()
  })
})
