import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { createRequire } from 'module'

const marketplaceKeys = crypto.generateKeyPairSync('ed25519')
process.env.ALPINE_MARKETPLACE_PUBKEY = marketplaceKeys.publicKey.export({ type: 'spki', format: 'pem' }).toString()

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
const { pluginLogs, RUNTIME_ERROR_SUMMARIES } = nodeRequire('../pluginLogStore.js')

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
  delete process.env.ALPINE_MARKETPLACE_PUBKEY
  fs.rmSync(userDataDir, { recursive: true, force: true })
})

const FOLDER_ID = 'com.example.notes'
const folderPluginDir = () => path.join(userDataDir, 'plugins', FOLDER_ID)
const trustFile = () => JSON.parse(fs.readFileSync(path.join(userDataDir, 'plugin-trust.json'), 'utf8'))
const recordOf = (id) => plugins.listPlugins().find((record) => record.id === id)

function dropFolderPlugin() {
  fs.mkdirSync(folderPluginDir(), { recursive: true })
  fs.writeFileSync(path.join(folderPluginDir(), 'plugin.json'), JSON.stringify({ id: FOLDER_ID, name: 'Notes', version: '1.0.0' }))
  fs.writeFileSync(path.join(folderPluginDir(), 'index.js'), 'export {}')
}

function storedZip(files) {
  const locals = []
  const centrals = []
  let offset = 0
  for (const [name, text] of Object.entries(files)) {
    const nameBuf = Buffer.from(name, 'utf8')
    const data = Buffer.from(text, 'utf8')
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(nameBuf.length, 28)
    central.writeUInt32LE(offset, 42)
    locals.push(local, nameBuf, data)
    centrals.push(central, nameBuf)
    offset += local.length + nameBuf.length + data.length
  }
  const directory = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(Object.keys(files).length, 8)
  end.writeUInt16LE(Object.keys(files).length, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, directory, end])
}

function serveStoreBundle(id, version) {
  const bundle = storedZip({ 'plugin.json': JSON.stringify({ id, name: 'Notes', version }), 'index.js': 'export {}' })
  const sha256 = crypto.createHash('sha256').update(bundle).digest('hex')
  const key = `plugins/${id}/${version}/${id}-${version}.alpineplugin`
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url) => {
      if (url.endsWith(`/plugins/${id}/latest.json`)) return new Response(JSON.stringify({ id, version, url: key, sha256, signature: null }))
      if (url.endsWith(key)) return new Response(bundle)
      return new Response(null, { status: 404 })
    }),
  )
  return sha256
}

function signedRevocations(revoked, issuedAt) {
  const sorted = (value) =>
    Array.isArray(value)
      ? value.map(sorted)
      : value && typeof value === 'object'
        ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, sorted(value[key])]))
        : value
  const doc = { version: 1, issuedAt, revoked }
  const signature = crypto.sign(null, Buffer.from(JSON.stringify(sorted(doc)), 'utf8'), marketplaceKeys.privateKey).toString('base64')
  return { ...doc, signature }
}

function serveRevocations(doc) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url) => (url.endsWith('/plugins/revoked.json') ? new Response(JSON.stringify(doc)) : new Response(null, { status: 404 }))),
  )
}

describe('plugins dropped into the plugins folder', () => {
  it('keeps plugins that were installed before the trust file existed', () => {
    expect(recordOf(PLUGIN_ID)).toMatchObject({ source: 'store', needsTrust: null })
    expect(trustFile()[PLUGIN_ID]).toMatchObject({ source: 'store', migrated: true })
  })

  it('does not load a new folder plugin until someone turns it on', () => {
    plugins.listPlugins()
    dropFolderPlugin()
    expect(recordOf(FOLDER_ID)).toMatchObject({ source: 'folder', needsTrust: { source: 'folder' }, loadable: false, updatesFromStore: false })
  })

  it('loads it once accepted from settings, and asks again when its files change', () => {
    plugins.listPlugins()
    dropFolderPlugin()
    expect(() => plugins.handlers['plugins/trust'](fromTopbar, FOLDER_ID)).toThrow(UNTRUSTED_SENDER)
    expect(plugins.handlers['plugins/trust'](fromSettings, FOLDER_ID)).toBe(true)
    expect(recordOf(FOLDER_ID)).toMatchObject({ source: 'folder', needsTrust: null, loadable: true })
    expect(trustFile()[FOLDER_ID]).toMatchObject({ source: 'folder', sha256: expect.stringMatching(/^[0-9a-f]{64}$/) })

    fs.writeFileSync(path.join(folderPluginDir(), 'index.js'), 'export const changed = true')
    expect(recordOf(FOLDER_ID)).toMatchObject({ needsTrust: { source: 'folder' }, loadable: false })
  })

  it('refuses to trust a plugin that is not waiting for it', () => {
    expect(plugins.handlers['plugins/trust'](fromSettings, PLUGIN_ID)).toBe(false)
    expect(plugins.handlers['plugins/trust'](fromSettings, '../escape')).toBe(false)
  })
})

describe('store installs', () => {
  it('are recorded as coming from the store', async () => {
    plugins.listPlugins()
    const sha256 = serveStoreBundle(FOLDER_ID, '1.0.0')
    const result = await plugins.handlers['plugins/marketplace-install'](fromSettings, { id: FOLDER_ID })
    expect(result).toMatchObject({ ok: true, id: FOLDER_ID })
    expect(trustFile()[FOLDER_ID]).toMatchObject({ source: 'store', sha256 })
    expect(recordOf(FOLDER_ID)).toMatchObject({ source: 'store', loadable: true, updatesFromStore: true })
  })

  it('never replace a plugin from GitHub or a folder', async () => {
    plugins.listPlugins()
    dropFolderPlugin()
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const result = await plugins.handlers['plugins/marketplace-install'](fromSettings, { id: FOLDER_ID })
    expect(result).toEqual({ ok: false, error: 'installed-outside-store' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('forget their trust record when uninstalled', async () => {
    plugins.listPlugins()
    const result = await plugins.handlers['plugins/marketplace-uninstall'](fromSettings, PLUGIN_ID)
    expect(result).toEqual({ ok: true, id: PLUGIN_ID })
    expect(trustFile()[PLUGIN_ID]).toBeUndefined()
  })
})

describe('the GitHub install channels', () => {
  it('answer only the settings window', () => {
    expect(() => plugins.handlers['plugins/github-resolve'](fromTopbar, 'https://github.com/octo/notes/releases/tag/v1')).toThrow(UNTRUSTED_SENDER)
    expect(() => plugins.handlers['plugins/github-install'](fromTopbar, 'token')).toThrow(UNTRUSTED_SENDER)
  })
})

describe('the kill switch', () => {
  it('turns a revoked plugin off with the reason, and back on when lifted', async () => {
    plugins.listPlugins()
    dropFolderPlugin()
    plugins.handlers['plugins/trust'](fromSettings, FOLDER_ID)

    serveRevocations(signedRevocations([{ id: FOLDER_ID, version: null, reason: 'Steals passwords.' }], '2026-11-03T10:00:00.000Z'))
    expect(await plugins.refreshRevocations()).toMatchObject({ ok: true, changed: true })
    expect(recordOf(FOLDER_ID)).toMatchObject({ loadable: false, revoked: { reason: 'Steals passwords.' } })

    serveRevocations(signedRevocations([{ id: FOLDER_ID, version: '0.9.0', reason: 'Old bug.' }], '2026-11-04T10:00:00.000Z'))
    await plugins.refreshRevocations()
    expect(recordOf(FOLDER_ID)).toMatchObject({ loadable: true, revoked: null })

    serveRevocations(signedRevocations([], '2026-11-05T10:00:00.000Z'))
    await plugins.refreshRevocations()
  })
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

describe('a plugin that stopped with an error', () => {
  const runtimeErrorInList = () => plugins.handlers['plugins/list']().find((record) => record.id === PLUGIN_ID).runtimeError

  afterEach(() => {
    pluginLogs.forget(PLUGIN_ID)
  })

  it('carries the error in the list the settings window reads', () => {
    expect(runtimeErrorInList()).toBeNull()
    pluginLogs.setRuntimeError(PLUGIN_ID, RUNTIME_ERROR_SUMMARIES.widget)
    expect(runtimeErrorInList()).toBe('The widget stopped with an error.')
  })

  it('loses it when the plugins are reloaded', () => {
    pluginLogs.setRuntimeError(PLUGIN_ID, RUNTIME_ERROR_SUMMARIES.backend)
    expect(plugins.handlers['plugins/reload']()).toBe(true)
    expect(runtimeErrorInList()).toBeNull()
  })

  it('loses it when it is turned off or on', () => {
    pluginLogs.setRuntimeError(PLUGIN_ID, RUNTIME_ERROR_SUMMARIES.backend)
    plugins.handlers['plugins/set-enabled'](fromSettings, { id: PLUGIN_ID, enabled: false })
    expect(runtimeErrorInList()).toBeNull()
    pluginLogs.setRuntimeError(PLUGIN_ID, RUNTIME_ERROR_SUMMARIES.backend)
    plugins.handlers['plugins/set-enabled'](fromSettings, { id: PLUGIN_ID, enabled: true })
    expect(runtimeErrorInList()).toBeNull()
  })

  it('loses the error and its log when it is uninstalled', async () => {
    pluginLogs.add(PLUGIN_ID, { source: 'backend', level: 'error', message: 'boom' })
    pluginLogs.setRuntimeError(PLUGIN_ID, RUNTIME_ERROR_SUMMARIES.backend)
    await plugins.handlers['plugins/marketplace-uninstall'](fromSettings, PLUGIN_ID)
    expect(pluginLogs.runtimeError(PLUGIN_ID)).toBeNull()
    expect(pluginLogs.list(PLUGIN_ID)).toEqual([])
  })
})
