import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { createRequire } from 'module'

const nodeRequire = createRequire(import.meta.url)
const electronModuleId = nodeRequire.resolve('electron')
const pluginsModuleId = nodeRequire.resolve('./plugins.js')

let userDataDir = ''

nodeRequire.cache[electronModuleId] = {
  id: electronModuleId,
  filename: electronModuleId,
  loaded: true,
  exports: {
    app: { getPath: () => userDataDir, getVersion: () => '1.0.0', isPackaged: false },
    shell: { openPath: () => Promise.resolve(''), openExternal: () => Promise.resolve() },
  },
}

const WEATHER = 'com.example.weather'
const NOTES = 'com.example.notes'

const WEATHER_SETTINGS = [
  {
    key: 'unit',
    type: 'select',
    label: 'Unit',
    default: 'c',
    options: [
      { value: 'c', label: 'Celsius' },
      { value: 'f', label: 'Fahrenheit' },
    ],
  },
  { key: 'show-wind', type: 'toggle', label: 'Show wind', default: false },
  { key: 'refresh', type: 'slider', label: 'Refresh every', default: 10, min: 5, max: 60, step: 5, unit: 'min' },
]

const WEATHER_DEFAULTS = { unit: 'c', 'show-wind': false, refresh: 10 }

function installPlugin(id, contributes) {
  const dir = path.join(userDataDir, 'plugins', id)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'plugin.json'), JSON.stringify({ id, name: id, version: '1.0.0', contributes }))
  fs.writeFileSync(path.join(dir, 'index.js'), 'export default () => null')
}

const storeFile = () => path.join(userDataDir, 'plugin-settings.json')
const writeStore = (contents) => fs.writeFileSync(storeFile(), typeof contents === 'string' ? contents : JSON.stringify(contents))
const readStore = () => JSON.parse(fs.readFileSync(storeFile(), 'utf8'))

async function startModule() {
  vi.resetModules()
  const { default: pluginSettings } = await import('./pluginSettings.js')
  const broadcasts = []
  pluginSettings.start((channel, payload) => broadcasts.push({ channel, payload }))
  return { pluginSettings, broadcasts }
}

const getValues = (pluginSettings, pluginId) => pluginSettings.handlers['plugins/settings-get'](null, pluginId)
const setValue = (pluginSettings, pluginId, key, value) =>
  pluginSettings.handlers['plugins/settings-set'](null, { pluginId, key, value })

beforeEach(() => {
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alpine-plugin-settings-'))
  delete nodeRequire.cache[pluginsModuleId]
  installPlugin(WEATHER, { settings: WEATHER_SETTINGS })
  installPlugin(NOTES, { settings: [{ key: 'compact', type: 'toggle', label: 'Compact', default: true }] })
})

afterEach(() => {
  fs.rmSync(userDataDir, { recursive: true, force: true })
})

describe('reading plugin settings', () => {
  it('answers with the manifest defaults while nothing is stored', async () => {
    const { pluginSettings } = await startModule()
    expect(getValues(pluginSettings, WEATHER)).toEqual(WEATHER_DEFAULTS)
  })

  it('reads back what is stored under the plugin id', async () => {
    writeStore({ [WEATHER]: { unit: 'f', refresh: 30 } })
    const { pluginSettings } = await startModule()
    expect(getValues(pluginSettings, WEATHER)).toEqual({ ...WEATHER_DEFAULTS, unit: 'f', refresh: 30 })
  })

  it('ignores a stored value that no longer validates, falling back to the default', async () => {
    writeStore({ [WEATHER]: { unit: 'kelvin', 'show-wind': 'yes', refresh: 90 } })
    const { pluginSettings } = await startModule()
    expect(getValues(pluginSettings, WEATHER)).toEqual(WEATHER_DEFAULTS)
  })

  it('leaves out stored keys the manifest no longer declares', async () => {
    writeStore({ [WEATHER]: { unit: 'f', retired: true } })
    const { pluginSettings } = await startModule()
    expect(Object.keys(getValues(pluginSettings, WEATHER)).sort()).toEqual(['refresh', 'show-wind', 'unit'])
  })

  it('falls back to the defaults when the store is corrupt', async () => {
    writeStore('{ not json')
    const { pluginSettings } = await startModule()
    expect(getValues(pluginSettings, WEATHER)).toEqual(WEATHER_DEFAULTS)
  })

  it('answers nothing for a plugin that is not installed', async () => {
    const { pluginSettings } = await startModule()
    expect(getValues(pluginSettings, 'com.example.missing')).toEqual({})
    expect(getValues(pluginSettings, undefined)).toEqual({})
  })
})

describe('writing plugin settings', () => {
  it('saves a valid value under the plugin id and answers with every value', async () => {
    const { pluginSettings } = await startModule()
    const result = setValue(pluginSettings, WEATHER, 'unit', 'f')
    expect(result).toEqual({ ok: true, values: { ...WEATHER_DEFAULTS, unit: 'f' } })
    expect(readStore()).toEqual({ [WEATHER]: { unit: 'f' } })
  })

  it('broadcasts the change to every window and tells listeners in the main process', async () => {
    const { pluginSettings, broadcasts } = await startModule()
    const heard = []
    pluginSettings.onSettingsChanged((pluginId, values) => heard.push({ pluginId, values }))
    setValue(pluginSettings, WEATHER, 'show-wind', true)
    const change = { pluginId: WEATHER, values: { ...WEATHER_DEFAULTS, 'show-wind': true } }
    expect(broadcasts).toEqual([{ channel: 'plugins/settings-changed', payload: change }])
    expect(heard).toEqual([change])
  })

  it('stops telling a listener that unsubscribed', async () => {
    const { pluginSettings } = await startModule()
    const listener = vi.fn()
    const unsubscribe = pluginSettings.onSettingsChanged(listener)
    unsubscribe()
    setValue(pluginSettings, WEATHER, 'unit', 'f')
    expect(listener).not.toHaveBeenCalled()
  })

  it('keeps the values of other plugins when saving one', async () => {
    writeStore({ [NOTES]: { compact: false } })
    const { pluginSettings } = await startModule()
    setValue(pluginSettings, WEATHER, 'refresh', 15)
    expect(readStore()).toEqual({ [NOTES]: { compact: false }, [WEATHER]: { refresh: 15 } })
    expect(getValues(pluginSettings, NOTES)).toEqual({ compact: false })
  })

  it('refuses a value the setting does not take, and saves nothing', async () => {
    const { pluginSettings, broadcasts } = await startModule()
    expect(setValue(pluginSettings, WEATHER, 'refresh', 61)).toMatchObject({ ok: false })
    expect(setValue(pluginSettings, WEATHER, 'unit', 'kelvin')).toMatchObject({ ok: false })
    expect(fs.existsSync(storeFile())).toBe(false)
    expect(broadcasts).toEqual([])
  })

  it('refuses a key the manifest does not declare', async () => {
    const { pluginSettings } = await startModule()
    expect(setValue(pluginSettings, WEATHER, 'retired', true)).toEqual({ ok: false, error: 'This plugin has no such setting.' })
    expect(setValue(pluginSettings, 'com.example.missing', 'unit', 'f')).toMatchObject({ ok: false })
  })

  it('gives the next session what the last one saved', async () => {
    const first = await startModule()
    setValue(first.pluginSettings, WEATHER, 'unit', 'f')
    setValue(first.pluginSettings, WEATHER, 'show-wind', true)

    const second = await startModule()

    expect(getValues(second.pluginSettings, WEATHER)).toEqual({ unit: 'f', 'show-wind': true, refresh: 10 })
  })
})
