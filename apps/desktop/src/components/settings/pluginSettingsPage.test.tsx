import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { ridgePluginRecord } from './ridge/ridgeTestFixtures'

vi.mock('../../plugins/loadPlugins', () => ({ loadPluginComponent: vi.fn(), renewPluginModules: vi.fn() }))

let PluginSettingsPage: typeof import('./pluginSettingsPage').default
let loadPluginComponent: Mock

const WEATHER = 'com.example.weather'

const UNIT: PluginSettingDeclaration = {
  key: 'unit',
  type: 'select',
  label: 'Unit',
  default: 'c',
  options: [
    { value: 'c', label: 'Celsius' },
    { value: 'f', label: 'Fahrenheit' },
  ],
}

const WIND: PluginSettingDeclaration = { key: 'show-wind', type: 'toggle', label: 'Show wind', info: 'Adds the wind speed.', default: false }

const THEME: ThemeState = { name: 'dark', background: '#202020' }

const BRIDGE_ROOTS = ['plugins', 'shell']

const PAGE_FAILED = "This plugin's page failed to load."

function weather(overrides: Partial<PluginRecord> = {}): PluginRecord {
  return ridgePluginRecord({
    contributes: { settings: [UNIT, WIND], settingsPages: [{ label: 'Forecast', export: 'WeatherSettings', topLevel: false }] },
    ...overrides,
  })
}

function installBridges(records: PluginRecord[], stored: PluginSettingValues = { unit: 'c', 'show-wind': false }) {
  const set = vi.fn(
    (_pluginId: string, key: string, value: PluginSettingValue): Promise<PluginSettingWriteResult> =>
      Promise.resolve({ ok: true, values: { ...stored, [key]: value } })
  )
  Object.assign(window, {
    plugins: {
      list: vi.fn().mockResolvedValue(records),
      onReload: vi.fn(() => () => {}),
      settings: { get: vi.fn().mockResolvedValue(stored), set, onChanged: vi.fn(() => () => {}) },
    },
    shell: { theme: { initial: THEME, get: vi.fn().mockResolvedValue(THEME), onChanged: vi.fn(() => () => {}) } },
  })
  return { set }
}

async function openPage(pluginId = WEATHER) {
  render(<PluginSettingsPage pluginId={pluginId} />)
  await act(async () => {})
}

function WeatherSettings() {
  return <p>Forecast controls</p>
}

function BrokenSettings(): ReactElement {
  throw new Error('the plugin page blew up')
}

beforeEach(async () => {
  vi.resetModules()
  PluginSettingsPage = (await import('./pluginSettingsPage')).default
  loadPluginComponent = (await import('../../plugins/loadPlugins')).loadPluginComponent as Mock
  loadPluginComponent.mockResolvedValue(null)
})

afterEach(() => {
  vi.restoreAllMocks()
  const globals = window as unknown as Record<string, unknown>
  for (const root of BRIDGE_ROOTS) delete globals[root]
})

describe('a plugin settings page', () => {
  it('heads itself with the label the plugin gives it and draws a row for each setting', async () => {
    installBridges([weather()], { unit: 'c', 'show-wind': true })
    await openPage()
    expect(screen.getByRole('heading', { name: 'Forecast' })).toBeTruthy()
    expect(document.querySelectorAll('[data-setting]')).toHaveLength(2)
    expect(screen.getByRole('switch', { name: 'Show wind' }).getAttribute('aria-checked')).toBe('true')
  })

  it('shows each description under its setting', async () => {
    installBridges([weather()])
    await openPage()
    expect(screen.getByText(WIND.info ?? '')).toBeTruthy()
  })

  it('writes a change through the plugin settings bridge', async () => {
    const { set } = installBridges([weather()])
    await openPage()
    fireEvent.click(screen.getByRole('switch', { name: 'Show wind' }))
    await act(async () => {})
    expect(set).toHaveBeenCalledWith(WEATHER, 'show-wind', true)
  })

  it('renders the component the plugin exports for it, below the rows', async () => {
    installBridges([weather()])
    loadPluginComponent.mockResolvedValue(WeatherSettings)
    await openPage()
    expect(loadPluginComponent).toHaveBeenCalledWith(WEATHER, 'index.js', 'WeatherSettings')
    expect(screen.getByText('Forecast controls')).toBeTruthy()
  })

  it('keeps the settings window up when the plugin page crashes', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    installBridges([weather()])
    loadPluginComponent.mockResolvedValue(BrokenSettings)
    await openPage()
    expect(screen.getByText(PAGE_FAILED)).toBeTruthy()
    expect(screen.getByRole('switch', { name: 'Show wind' })).toBeTruthy()
  })

  it('says so when the renderer has no such export', async () => {
    installBridges([weather()])
    await openPage()
    expect(screen.getByText(PAGE_FAILED)).toBeTruthy()
  })

  it('runs no plugin code for a disabled plugin, but still offers its settings', async () => {
    installBridges([weather({ enabled: false })])
    await openPage()
    expect(loadPluginComponent).not.toHaveBeenCalled()
    expect(screen.getByRole('switch', { name: 'Show wind' })).toBeTruthy()
  })

  it('names a page the plugin did not declare after the plugin, and loads no component for it', async () => {
    installBridges([ridgePluginRecord({ contributes: { settings: [WIND] } })])
    await openPage()
    expect(screen.getByRole('heading', { name: 'Weather' })).toBeTruthy()
    expect(loadPluginComponent).not.toHaveBeenCalled()
  })

  it('says a plugin without settings has none', async () => {
    installBridges([ridgePluginRecord()])
    await openPage()
    expect(screen.getByText('This plugin has no settings.')).toBeTruthy()
  })
})

describe('the plugin settings route', () => {
  it('opens the page of the plugin the route names', async () => {
    const { settingsRouteView } = await import('./settingsRoutes')
    const view = settingsRouteView(`plugins/${WEATHER}`)?.(() => {}) as ReactElement<PluginSettingsPageProps>
    expect(view.props.pluginId).toBe(WEATHER)
  })

  it('leaves the Plugins page and unknown routes as they were', async () => {
    const { SETTINGS_ROUTES, settingsRouteView } = await import('./settingsRoutes')
    expect(settingsRouteView('plugins')).toBe(SETTINGS_ROUTES.plugins)
    expect(settingsRouteView('nowhere')).toBeNull()
  })
})
