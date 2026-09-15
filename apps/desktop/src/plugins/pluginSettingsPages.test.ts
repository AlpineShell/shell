import { describe, expect, it } from 'vitest'
import { ridgePluginRecord } from '../components/settings/ridge/ridgeTestFixtures'
import { pluginIdFromSettingsRoute, pluginSettingsPage, pluginSettingsPages, pluginSettingsRoute } from './pluginSettingsPages'

const WEATHER = 'com.example.weather'

const WIND: PluginSettingDeclaration = { key: 'show-wind', type: 'toggle', label: 'Show wind', default: false }

describe('pluginSettingsPage', () => {
  it('gives a plugin that declares only settings a page named after it', () => {
    expect(pluginSettingsPage(ridgePluginRecord({ contributes: { settings: [WIND] } }))).toEqual({
      pluginId: WEATHER,
      pluginName: 'Weather',
      route: `plugins/${WEATHER}`,
      label: 'Weather',
      iconUrl: null,
      topLevel: false,
      exportName: null,
      entry: 'index.js',
      enabled: true,
      settings: [WIND],
    })
  })

  it('takes the label, icon, export and sidebar place from the page the plugin declares', () => {
    const record = ridgePluginRecord({
      contributes: { settingsPages: [{ label: 'Forecast', icon: 'gear.png', export: 'WeatherSettings', topLevel: true }] },
    })
    expect(pluginSettingsPage(record)).toMatchObject({
      label: 'Forecast',
      iconUrl: `alpine-plugin://${WEATHER}/gear.png`,
      exportName: 'WeatherSettings',
      topLevel: true,
      settings: [],
    })
  })

  it('shows the plugin logo for a lucide icon, as the rest of the settings window does', () => {
    const record = ridgePluginRecord({ icon: 'logo.png', contributes: { settingsPages: [{ label: 'Weather', icon: 'lucide:CloudSun' }] } })
    expect(pluginSettingsPage(record)?.iconUrl).toBe(`alpine-plugin://${WEATHER}/logo.png`)
  })

  it('loads the page component from the renderer the manifest names', () => {
    const record = ridgePluginRecord({ renderer: 'dist/renderer.js', contributes: { settingsPages: [{ label: 'Weather', export: 'WeatherSettings' }] } })
    expect(pluginSettingsPage(record)?.entry).toBe('dist/renderer.js')
  })

  it('gives no page to a plugin with neither settings nor a settings page', () => {
    expect(pluginSettingsPage(ridgePluginRecord())).toBeNull()
  })

  it('gives no page to a plugin that cannot load', () => {
    expect(pluginSettingsPage(ridgePluginRecord({ loadable: false, contributes: { settings: [WIND] } }))).toBeNull()
  })

  it('keeps the page of a disabled plugin, marked as disabled', () => {
    expect(pluginSettingsPage(ridgePluginRecord({ enabled: false, contributes: { settings: [WIND] } }))?.enabled).toBe(false)
  })

  it('lists a page for only the plugins that have one', () => {
    const records = [ridgePluginRecord(), ridgePluginRecord({ id: 'com.example.notes', name: 'Notes', contributes: { settings: [WIND] } })]
    expect(pluginSettingsPages(records).map((page) => page.pluginId)).toEqual(['com.example.notes'])
  })
})

describe('plugin settings routes', () => {
  it('reads the plugin id back from its route', () => {
    expect(pluginIdFromSettingsRoute(pluginSettingsRoute(WEATHER))).toBe(WEATHER)
  })

  it.each(['plugins', 'plugins/', 'ridge', `plugins/${WEATHER}/more`])('reads no plugin from %s', (route) => {
    expect(pluginIdFromSettingsRoute(route)).toBeNull()
  })
})
