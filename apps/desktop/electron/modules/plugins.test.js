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

const PLUGIN_ID = 'com.example.weather'
const pluginDir = () => path.join(userDataDir, 'plugins', PLUGIN_ID)

beforeEach(() => {
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alpine-plugins-'))
  fs.mkdirSync(pluginDir(), { recursive: true })
  fs.writeFileSync(path.join(pluginDir(), 'plugin.json'), JSON.stringify({ id: PLUGIN_ID, name: 'Weather', version: '1.0.0' }))
})

afterEach(() => {
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
    const result = await plugins.handlers['plugins/marketplace-uninstall'](null, PLUGIN_ID)
    expect(result).toEqual({ ok: true, id: PLUGIN_ID })
    expect(stopper).toHaveBeenCalledWith(PLUGIN_ID, expect.any(Function))
    expect(folderPresent).toEqual([true])
    expect(fs.existsSync(pluginDir())).toBe(false)
  })
})

