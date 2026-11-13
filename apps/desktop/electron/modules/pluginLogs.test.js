import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import path from 'path'
import { pathToFileURL } from 'url'
import { createRequire } from 'module'

const nodeRequire = createRequire(import.meta.url)

const pluginLogsModule = nodeRequire('./pluginLogs.js')
const { pluginLogs } = nodeRequire('../pluginLogStore.js')
const { setAppLocation, setTrustedWindowsAccessor, guardShellSender, SETTINGS_WINDOW, UNTRUSTED_SENDER } = nodeRequire('../trustedSenders.js')

const WEATHER = 'com.example.weather'
const INDEX_PATH = path.resolve(path.join(path.sep, 'Programs', 'Alpine Shell', 'resources', 'app.asar', 'dist', 'index.html'))
const INDEX_URL = pathToFileURL(INDEX_PATH).href

const settingsWindow = { webContents: { id: 4 }, isDestroyed: () => false }
const fromSettings = { sender: settingsWindow.webContents }
const fromTopbar = { sender: { id: 5 } }

const handlers = pluginLogsModule.handlers

const CRASH_STACK = [
  "TypeError: Cannot read properties of undefined (reading 'temp')",
  '    at Forecast (alpine-plugin://com.example.weather/index.js:12:30)',
  '    at renderWithHooks (index.js:1:1)',
  '    at updateFunctionComponent (index.js:2:2)',
  '    at beginWork (index.js:3:3)',
].join('\n')

beforeEach(() => {
  setTrustedWindowsAccessor(() => ({ [SETTINGS_WINDOW]: settingsWindow }))
})

afterEach(() => {
  pluginLogs.forget(WEATHER)
})

describe('a plugin widget that crashed', () => {
  it('is logged with its message and the first stack frames', () => {
    expect(handlers['plugins/report-widget-error'](fromTopbar, { id: WEATHER, message: "Cannot read properties of undefined (reading 'temp')", stack: CRASH_STACK })).toBe(true)
    const [line] = pluginLogs.list(WEATHER)
    expect(line.source).toBe('widget')
    expect(line.level).toBe('error')
    expect(line.message).toBe(
      [
        "Cannot read properties of undefined (reading 'temp')",
        'at Forecast (alpine-plugin://com.example.weather/index.js:12:30)',
        'at renderWithHooks (index.js:1:1)',
        'at updateFunctionComponent (index.js:2:2)',
      ].join('\n'),
    )
  })

  it('marks the plugin as stopped with an error', () => {
    handlers['plugins/report-widget-error'](fromTopbar, { id: WEATHER, message: 'boom' })
    expect(pluginLogs.runtimeError(WEATHER)).toBe('The widget stopped with an error.')
  })

  it('is refused without a plugin id', () => {
    expect(handlers['plugins/report-widget-error'](fromTopbar, { id: '../weather', message: 'boom' })).toBe(false)
    expect(handlers['plugins/report-widget-error'](fromTopbar, null)).toBe(false)
  })

  it('tells the windows once, so the Plugins page can show it', () => {
    const broadcast = vi.fn()
    pluginLogsModule.start(broadcast)
    handlers['plugins/report-widget-error'](fromTopbar, { id: WEATHER, message: 'boom' })
    handlers['plugins/report-widget-error'](fromTopbar, { id: WEATHER, message: 'boom again' })
    expect(broadcast).toHaveBeenCalledTimes(1)
    expect(broadcast).toHaveBeenCalledWith('plugins/runtime-error', { id: WEATHER })
  })

  it('is taken from a shell page and never from a plugin window', () => {
    setAppLocation({ indexPath: INDEX_PATH, devServerUrl: null })
    const refusals = vi.spyOn(console, 'error').mockImplementation(() => {})
    const guarded = guardShellSender('plugins/report-widget-error', handlers['plugins/report-widget-error'])
    const report = { id: WEATHER, message: 'boom' }
    expect(guarded({ ...fromTopbar, senderFrame: { url: `${INDEX_URL}?mode=topbar` } }, report)).toBe(true)
    expect(() => guarded({ sender: { id: 9 }, senderFrame: { url: `alpine-plugin://${WEATHER}/window.html` } }, report)).toThrow(UNTRUSTED_SENDER)
    expect(refusals).toHaveBeenCalledTimes(1)
    refusals.mockRestore()
  })
})

describe('reading and clearing a plugin log', () => {
  it('hands the settings window the lines of one plugin', () => {
    pluginLogs.add(WEATHER, { source: 'backend', level: 'info', message: 'started' })
    expect(handlers['plugins/logs'](fromSettings, WEATHER).map((line) => line.message)).toEqual(['started'])
    expect(handlers['plugins/logs'](fromSettings, 42)).toEqual([])
  })

  it('clears the lines from the settings window', () => {
    pluginLogs.add(WEATHER, { source: 'backend', level: 'info', message: 'started' })
    handlers['plugins/clear-logs'](fromSettings, WEATHER)
    expect(pluginLogs.list(WEATHER)).toEqual([])
  })

  it('answers no other window', () => {
    pluginLogs.add(WEATHER, { source: 'backend', level: 'info', message: 'started' })
    expect(() => handlers['plugins/logs'](fromTopbar, WEATHER)).toThrow(UNTRUSTED_SENDER)
    expect(() => handlers['plugins/clear-logs'](fromTopbar, WEATHER)).toThrow(UNTRUSTED_SENDER)
    expect(pluginLogs.list(WEATHER)).toHaveLength(1)
  })
})
