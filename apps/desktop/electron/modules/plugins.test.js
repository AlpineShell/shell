import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { createRequire } from 'module'

const nodeRequire = createRequire(import.meta.url)
const electronModuleId = nodeRequire.resolve('electron')

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alpine-plugins-'))

nodeRequire.cache[electronModuleId] = {
  id: electronModuleId,
  filename: electronModuleId,
  loaded: true,
  exports: {
    app: { getPath: () => userDataDir, getVersion: () => '1.0.0', isPackaged: false },
    shell: { openPath: () => Promise.resolve(''), openExternal: () => Promise.resolve() },
  },
}

const licenceConfigModuleId = nodeRequire.resolve('../licenceConfig.js')
const realLicenceConfig = nodeRequire('../licenceConfig.js')
let releaseBuild = false

nodeRequire.cache[licenceConfigModuleId] = {
  id: licenceConfigModuleId,
  filename: licenceConfigModuleId,
  loaded: true,
  exports: {
    ...realLicenceConfig,
    loadLicenceConfig: () => ({ ...realLicenceConfig.loadLicenceConfig(), isReleaseBuild: releaseBuild }),
  },
}

const plugins = nodeRequire('./plugins.js')
const { setTrustedWindowsAccessor, SETTINGS_WINDOW, UNTRUSTED_SENDER } = nodeRequire('../trustedSenders.js')

const PLUGIN_ID = 'com.example.weather'
const pluginDir = () => path.join(userDataDir, 'plugins', PLUGIN_ID)
const pluginDataDir = () => path.join(userDataDir, 'plugin-data', PLUGIN_ID)
const settingsWindow = { webContents: { id: 4 }, isDestroyed: () => false }
const topbarWindow = { webContents: { id: 5 }, isDestroyed: () => false }
const fromSettings = { sender: settingsWindow.webContents }
const fromTopbar = { sender: topbarWindow.webContents }
const UPDATE_BUNDLE_KEY = `plugins/${PLUGIN_ID}/1.1.0/${PLUGIN_ID}-1.1.0.alpineplugin`

function serveUnsignedUpdate() {
  const fetchMock = vi.fn(async (url) => {
    if (url.endsWith(`/plugins/${PLUGIN_ID}/latest.json`)) {
      return new Response(JSON.stringify({ id: PLUGIN_ID, version: '1.1.0', url: UPDATE_BUNDLE_KEY, sha256: 'a'.repeat(64), signature: null }))
    }
    if (url.endsWith(UPDATE_BUNDLE_KEY)) return new Response(Buffer.from('unsigned bundle'))
    return new Response(null, { status: 404 })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function bundleRequests(fetchMock) {
  return fetchMock.mock.calls.filter(([url]) => url.endsWith(UPDATE_BUNDLE_KEY))
}

function installedVersion() {
  return JSON.parse(fs.readFileSync(path.join(pluginDir(), 'plugin.json'), 'utf8')).version
}

beforeEach(() => {
  fs.mkdirSync(pluginDir(), { recursive: true })
  fs.writeFileSync(path.join(pluginDir(), 'plugin.json'), JSON.stringify({ id: PLUGIN_ID, name: 'Weather', version: '1.0.0' }))
  setTrustedWindowsAccessor(() => ({ [SETTINGS_WINDOW]: settingsWindow }))
})

afterEach(() => {
  releaseBuild = false
  vi.unstubAllGlobals()
  setTrustedWindowsAccessor(null)
  plugins.setPluginStopper((_id, work) => work())
  for (const entry of fs.readdirSync(userDataDir)) fs.rmSync(path.join(userDataDir, entry), { recursive: true, force: true })
})

afterAll(() => {
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

  it('removes the plugin data folder only once the plugin is stopped and gone', async () => {
    fs.mkdirSync(pluginDataDir(), { recursive: true })
    fs.writeFileSync(path.join(pluginDataDir(), 'state.json'), '{}')
    const dataPresentWhileStopped = []
    plugins.setPluginStopper(async (_id, work) => {
      dataPresentWhileStopped.push(fs.existsSync(pluginDataDir()))
      await work()
    })
    const result = await plugins.handlers['plugins/marketplace-uninstall'](fromSettings, PLUGIN_ID)
    expect(result).toEqual({ ok: true, id: PLUGIN_ID })
    expect(dataPresentWhileStopped).toEqual([true])
    expect(fs.existsSync(pluginDataDir())).toBe(false)
  })

  it('keeps the plugin data folder when the plugin could not be moved out', async () => {
    fs.mkdirSync(pluginDataDir(), { recursive: true })
    plugins.setPluginStopper(async () => {
      throw Object.assign(new Error('resource busy'), { code: 'EBUSY' })
    })
    const result = await plugins.handlers['plugins/marketplace-uninstall'](fromSettings, PLUGIN_ID)
    expect(result).toMatchObject({ ok: false, error: 'remove-failed' })
    expect(fs.existsSync(pluginDataDir())).toBe(true)
    expect(fs.existsSync(pluginDir())).toBe(true)
  })
})

describe('installing through the plugins handlers', () => {
  it('refuses an unsigned bundle in a release build before downloading it', async () => {
    releaseBuild = true
    const fetchMock = serveUnsignedUpdate()
    const result = await plugins.handlers['plugins/marketplace-install'](fromSettings, { id: PLUGIN_ID })
    expect(result).toEqual({ ok: false, error: 'unverified', reason: 'no-signature' })
    expect(bundleRequests(fetchMock)).toHaveLength(0)
    expect(installedVersion()).toBe('1.0.0')
  })

  it('lets a development build download an unsigned bundle', async () => {
    const fetchMock = serveUnsignedUpdate()
    const result = await plugins.handlers['plugins/marketplace-install'](fromSettings, { id: PLUGIN_ID })
    expect(result).toEqual({ ok: false, error: 'digest-mismatch' })
    expect(bundleRequests(fetchMock)).toHaveLength(1)
    expect(installedVersion()).toBe('1.0.0')
  })
})

describe('the plugin data folder', () => {
  it('lives under userData, outside the plugin folder an update replaces', () => {
    expect(plugins.ensurePluginDataDir(PLUGIN_ID)).toBe(pluginDataDir())
    expect(fs.statSync(pluginDataDir()).isDirectory()).toBe(true)
  })

  it('is refused for an id that could leave the data root', () => {
    expect(plugins.ensurePluginDataDir('../escape')).toBeNull()
    expect(plugins.ensurePluginDataDir('')).toBeNull()
    expect(fs.existsSync(path.join(userDataDir, 'escape'))).toBe(false)
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
