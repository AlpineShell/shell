import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'

const { install, uninstall } = await import('./pluginMarketplace.js')

const PLUGIN_ID = 'com.example.demo'
const BUNDLE_KEY = `plugins/${PLUGIN_ID}/1.2.0/${PLUGIN_ID}-1.2.0.alpineplugin`
const MAX_BUNDLE_BYTES = 25 * 1024 * 1024

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

function demoBundle(version) {
  return storedZip({
    'plugin.json': JSON.stringify({ id: PLUGIN_ID, name: 'Demo', version }),
    'index.js': `export const version = '${version}'`,
  })
}

function serveCatalog({ bundle, signature = null, sha256 = crypto.createHash('sha256').update(bundle).digest('hex') }) {
  const fetchMock = vi.fn(async (url) => {
    if (url.endsWith(`/plugins/${PLUGIN_ID}/latest.json`)) {
      return new Response(JSON.stringify({ id: PLUGIN_ID, version: '1.2.0', url: BUNDLE_KEY, sha256, signature }))
    }
    if (url.endsWith(BUNDLE_KEY)) return new Response(bundle)
    return new Response(null, { status: 404 })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function bundleRequests(fetchMock) {
  return fetchMock.mock.calls.filter(([url]) => url.endsWith(BUNDLE_KEY))
}

function installedManifest(pluginsDir) {
  return JSON.parse(fs.readFileSync(path.join(pluginsDir, PLUGIN_ID, 'plugin.json'), 'utf8'))
}

let pluginsDir = ''

beforeEach(() => {
  pluginsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alpine-marketplace-'))
})

afterEach(() => {
  vi.unstubAllGlobals()
  fs.rmSync(pluginsDir, { recursive: true, force: true })
})

describe('installing from the marketplace', () => {
  it('refuses an unsigned bundle when signatures are required, without downloading it', async () => {
    const fetchMock = serveCatalog({ bundle: demoBundle('1.2.0') })
    const result = await install({ id: PLUGIN_ID }, { pluginsDir, requireSignature: true })
    expect(result).toEqual({ ok: false, error: 'unverified', reason: 'no-signature' })
    expect(bundleRequests(fetchMock)).toHaveLength(0)
    expect(fs.readdirSync(pluginsDir)).toEqual([])
  })

  it('refuses a signature that does not verify when signatures are required', async () => {
    const fetchMock = serveCatalog({ bundle: demoBundle('1.2.0'), signature: Buffer.alloc(64, 7).toString('base64') })
    const result = await install({ id: PLUGIN_ID }, { pluginsDir, requireSignature: true })
    expect(result).toMatchObject({ ok: false, error: 'unverified' })
    expect(bundleRequests(fetchMock)).toHaveLength(0)
    expect(fs.existsSync(path.join(pluginsDir, PLUGIN_ID))).toBe(false)
  })

  it('installs an unsigned bundle when signatures are not required, and says it is unverified', async () => {
    serveCatalog({ bundle: demoBundle('1.2.0') })
    const result = await install({ id: PLUGIN_ID }, { pluginsDir, requireSignature: false })
    expect(result).toMatchObject({ ok: true, id: PLUGIN_ID, version: '1.2.0', verified: false })
    expect(installedManifest(pluginsDir).version).toBe('1.2.0')
  })

  it('refuses a bundle whose digest does not match the catalog', async () => {
    serveCatalog({ bundle: demoBundle('1.2.0'), sha256: 'a'.repeat(64) })
    const result = await install({ id: PLUGIN_ID }, { pluginsDir, requireSignature: false })
    expect(result).toEqual({ ok: false, error: 'digest-mismatch' })
    expect(fs.existsSync(path.join(pluginsDir, PLUGIN_ID))).toBe(false)
  })

  it('stops reading a download that grows past the bundle limit', async () => {
    serveCatalog({ bundle: Buffer.alloc(MAX_BUNDLE_BYTES + 1), sha256: 'b'.repeat(64) })
    const result = await install({ id: PLUGIN_ID }, { pluginsDir, requireSignature: false })
    expect(result).toEqual({ ok: false, error: 'too-large' })
  })

  it('swaps an update in only while the plugin is stopped', async () => {
    fs.mkdirSync(path.join(pluginsDir, PLUGIN_ID))
    fs.writeFileSync(path.join(pluginsDir, PLUGIN_ID, 'plugin.json'), JSON.stringify({ id: PLUGIN_ID, version: '1.1.0' }))
    serveCatalog({ bundle: demoBundle('1.2.0') })
    const seenWhileStopped = []
    const withPluginStopped = vi.fn(async (id, work) => {
      seenWhileStopped.push(installedManifest(pluginsDir).version)
      await work()
      seenWhileStopped.push(installedManifest(pluginsDir).version)
    })
    const onChange = vi.fn()
    const result = await install({ id: PLUGIN_ID }, { pluginsDir, onChange, withPluginStopped, requireSignature: false })
    expect(result.ok).toBe(true)
    expect(withPluginStopped).toHaveBeenCalledWith(PLUGIN_ID, expect.any(Function))
    expect(seenWhileStopped).toEqual(['1.1.0', '1.2.0'])
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(fs.readdirSync(pluginsDir)).toEqual([PLUGIN_ID])
  })

  it('keeps the old copy when the update cannot be swapped in', async () => {
    fs.mkdirSync(path.join(pluginsDir, PLUGIN_ID))
    fs.writeFileSync(path.join(pluginsDir, PLUGIN_ID, 'plugin.json'), JSON.stringify({ id: PLUGIN_ID, version: '1.1.0' }))
    serveCatalog({ bundle: demoBundle('1.2.0') })
    const onChange = vi.fn()
    const busy = Object.assign(new Error('resource busy'), { code: 'EBUSY' })
    const result = await install({ id: PLUGIN_ID }, {
      pluginsDir,
      onChange,
      withPluginStopped: async () => {
        throw busy
      },
      requireSignature: false,
    })
    expect(result).toMatchObject({ ok: false, error: 'install-failed' })
    expect(installedManifest(pluginsDir).version).toBe('1.1.0')
    expect(onChange).not.toHaveBeenCalled()
    expect(fs.readdirSync(pluginsDir)).toEqual([PLUGIN_ID])
  })
})

describe('uninstalling a marketplace plugin', () => {
  it('moves the plugin out while it is stopped, then removes it', async () => {
    fs.mkdirSync(path.join(pluginsDir, PLUGIN_ID))
    fs.writeFileSync(path.join(pluginsDir, PLUGIN_ID, 'plugin.json'), JSON.stringify({ id: PLUGIN_ID }))
    const presentWhileStopped = []
    const withPluginStopped = vi.fn(async (id, work) => {
      presentWhileStopped.push(fs.existsSync(path.join(pluginsDir, id)))
      await work()
    })
    const onChange = vi.fn()
    const result = await uninstall(PLUGIN_ID, { pluginsDir, onChange, withPluginStopped })
    expect(result).toEqual({ ok: true, id: PLUGIN_ID })
    expect(presentWhileStopped).toEqual([true])
    expect(fs.readdirSync(pluginsDir)).toEqual([])
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('leaves the plugin whole and reports the failure when it cannot be moved', async () => {
    fs.mkdirSync(path.join(pluginsDir, PLUGIN_ID))
    fs.writeFileSync(path.join(pluginsDir, PLUGIN_ID, 'plugin.json'), JSON.stringify({ id: PLUGIN_ID }))
    const onChange = vi.fn()
    const result = await uninstall(PLUGIN_ID, {
      pluginsDir,
      onChange,
      withPluginStopped: async () => {
        throw Object.assign(new Error('resource busy'), { code: 'EBUSY' })
      },
    })
    expect(result).toMatchObject({ ok: false, error: 'remove-failed' })
    expect(fs.existsSync(path.join(pluginsDir, PLUGIN_ID, 'plugin.json'))).toBe(true)
    expect(onChange).not.toHaveBeenCalled()
  })
})
