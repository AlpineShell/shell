import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import PluginsPage from './pluginsPage'
import { ridgePluginRecord } from './ridge/ridgeTestFixtures'

const WIND: PluginSettingDeclaration = { key: 'show-wind', type: 'toggle', label: 'Show wind', default: false }

const SETTINGS_BUTTON = 'Weather settings'

function installBridges(records: PluginRecord[]) {
  Object.assign(window, {
    plugins: {
      list: vi.fn().mockResolvedValue(records),
      openFolder: vi.fn(),
      reload: vi.fn(),
      setEnabled: vi.fn(),
      onDeepInstall: vi.fn(() => () => {}),
      marketplace: {
        list: vi.fn().mockResolvedValue({ base: '', plugins: [] }),
        base: vi.fn().mockResolvedValue(''),
        detail: vi.fn(),
        install: vi.fn(),
        uninstall: vi.fn(),
        openWeb: vi.fn(),
      },
    },
  })
}

async function openPage(records: PluginRecord[]) {
  installBridges(records)
  const onNavigate = vi.fn()
  render(<PluginsPage onNavigate={onNavigate} />)
  await act(async () => {})
  return onNavigate
}

afterEach(() => {
  delete (window as unknown as { plugins?: unknown }).plugins
})

describe('the settings button on the Plugins page', () => {
  it("opens the plugin's settings page", async () => {
    const onNavigate = await openPage([ridgePluginRecord({ contributes: { settings: [WIND] } })])
    fireEvent.click(screen.getByRole('button', { name: SETTINGS_BUTTON }))
    expect(onNavigate).toHaveBeenCalledWith('plugins/com.example.weather')
  })

  it('shows for a plugin that declares only a settings page', async () => {
    await openPage([ridgePluginRecord({ contributes: { settingsPages: [{ label: 'Weather', export: 'WeatherSettings' }] } })])
    expect(screen.getByRole('button', { name: SETTINGS_BUTTON })).toBeTruthy()
  })

  it('stays away from a plugin with nothing to set', async () => {
    await openPage([ridgePluginRecord()])
    expect(screen.queryByRole('button', { name: SETTINGS_BUTTON })).toBeNull()
  })

  it('stays away from a plugin that cannot load', async () => {
    await openPage([ridgePluginRecord({ loadable: false, contributes: { settings: [WIND] } })])
    expect(screen.queryByRole('button', { name: SETTINGS_BUTTON })).toBeNull()
  })
})
