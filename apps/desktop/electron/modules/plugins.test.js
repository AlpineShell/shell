import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { createRequire } from 'module'

const nodeRequire = createRequire(import.meta.url)
const electronModuleId = nodeRequire.resolve('electron')

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

const plugins = nodeRequire('./plugins.js')
const { setTrustedWindowsAccessor, SETTINGS_WINDOW, UNTRUSTED_SENDER } = nodeRequire('../trustedSenders.js')

const PLUGIN_ID = 'com.example.weather'
const pluginDir = () => path.join(userDataDir, 'plugins', PLUGIN_ID)
const settingsWindow = { webContents: { id: 4 }, isDestroyed: () => false }
const topbarWindow = { webContents: { id: 5 }, isDestroyed: () => false }
const fromSettings = { sender: settingsWindow.webContents }
const fromTopbar = { sender: topbarWindow.webContents }

beforeEach(() => {
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alpine-plugins-'))
  fs.mkdirSync(pluginDir(), { recursive: true })
  fs.writeFileSync(path.join(pluginDir(), 'plugin.json'), JSON.stringify({ id: PLUGIN_ID, name: 'Weather', version: '1.0.0' }))
  setTrustedWindowsAccessor(() => ({ [SETTINGS_WINDOW]: settingsWindow }))
})

afterEach(() => {
  setTrustedWindowsAccessor(null)
  plugins.setPluginStopper((_id, work) => work())
  fs.rmSync(userDataDir, { recursive: true, force: true })
})

describe('uninstalling through the plugins handlers', () => {
  it('stops the plugin through the registered stopper before its folder goes away', async () => {
    const folderPresent = []
    const stopper = vi.fn(async (id, work) => {
      folderPresent.push(fs.existsSync(pluginDir()))
      return work()
    })
    plugins.setPluginStopper(stopper)
    const result = await plugins.handlers['plugins/marketplace-uninstall'](fromSettings, PLUGIN_ID)
    expect(result).toEqual({ ok: true, id: PLUGIN_ID })
    expect(stopper).toHaveBeenCalledWith(PLUGIN_ID, expect.any(Function))
    expect(folderPresent).toEqual([true])
    expect(fs.existsSync(pluginDir())).toBe(false)
  })
})

describe('who may install, remove or switch plugins', () => {
  it('answers only the settings window', () => {
    for (const channel of ['plugins/set-enabled', 'plugins/marketplace-install', 'plugins/marketplace-uninstall']) {
      expect(() => plugins.handlers[channel](fromTopbar, PLUGIN_ID)).toThrow(UNTRUSTED_SENDER)
    }
    expect(fs.existsSync(pluginDir())).toBe(true)
    expect(plugins.handlers['plugins/set-enabled'](fromSettings, { id: PLUGIN_ID, enabled: true })).toBe(true)
  })
})
