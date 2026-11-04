import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'

const { createGithubInstaller, installConflict, PENDING_TTL_MS } = await import('./githubPluginInstall.js')
const { installBundle } = await import('./pluginMarketplace.js')

const RELEASE_URL = 'https://github.com/octo/notes/releases/tag/v1.2.0'
const COMMIT = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'
const ASSET_URL = 'https://github.com/octo/notes/releases/download/v1.2.0/notes-1.2.0.alpineplugin'
const PLUGIN_ID = 'com.octo.notes'

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

const BUNDLE = storedZip({
  'plugin.json': JSON.stringify({ id: PLUGIN_ID, name: 'Notes', version: '1.2.0' }),
  'index.js': 'export {}',
})

function github() {
  return vi.fn(async (url) => {
    if (url.endsWith('/releases/tags/v1.2.0')) {
      return new Response(JSON.stringify({ draft: false, assets: [{ name: 'notes-1.2.0.alpineplugin', size: BUNDLE.length, browser_download_url: ASSET_URL }] }))
    }
    if (url.endsWith('/commits/v1.2.0')) return new Response(JSON.stringify({ sha: COMMIT }))
    if (url === ASSET_URL) return new Response(BUNDLE)
    return new Response(null, { status: 404 })
  })
}

let pluginsDir = ''

beforeEach(() => {
  pluginsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alpine-github-install-'))
})

afterEach(() => {
  fs.rmSync(pluginsDir, { recursive: true, force: true })
})

function installer({ fetchImpl = github(), sourceOf = () => null, now = () => 0 } = {}) {
  const recordTrust = vi.fn()
  const created = createGithubInstaller({ installBundle, maxBytes: 1024 * 1024, sourceOf, recordTrust, fetchImpl, now })
  return { ...created, recordTrust, fetchImpl }
}

describe('installing a plugin from a GitHub release', () => {
  it('asks first, then installs the bundle and remembers where it came from', async () => {
    const { resolve, install, recordTrust, fetchImpl } = installer()
    const resolved = await resolve(RELEASE_URL)
    expect(resolved).toEqual({
      ok: true,
      token: expect.any(String),
      release: { owner: 'octo', repo: 'notes', tag: 'v1.2.0', commit: COMMIT, assetName: 'notes-1.2.0.alpineplugin', size: BUNDLE.length },
    })
    expect(fetchImpl.mock.calls.some(([url]) => url === ASSET_URL)).toBe(false)

    const onChange = vi.fn()
    const result = await install(resolved.token, { pluginsDir, onChange })
    const sha256 = crypto.createHash('sha256').update(BUNDLE).digest('hex')
    expect(result).toEqual({ ok: true, id: PLUGIN_ID, version: '1.2.0', repository: 'octo/notes', tag: 'v1.2.0', commit: COMMIT, sha256 })
    expect(JSON.parse(fs.readFileSync(path.join(pluginsDir, PLUGIN_ID, 'plugin.json'), 'utf8')).version).toBe('1.2.0')
    expect(recordTrust).toHaveBeenCalledWith(PLUGIN_ID, expect.objectContaining({ source: 'github', repository: 'octo/notes', tag: 'v1.2.0', commit: COMMIT, sha256 }))
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('installs only a release it showed, once', async () => {
    const { resolve, install } = installer()
    expect(await install('made-up', { pluginsDir })).toEqual({ ok: false, error: 'expired' })
    const { token } = await resolve(RELEASE_URL)
    expect(await install(token, { pluginsDir })).toMatchObject({ ok: true })
    expect(await install(token, { pluginsDir })).toEqual({ ok: false, error: 'expired' })
  })

  it('forgets a confirmation left too long', async () => {
    let time = 0
    const { resolve, install } = installer({ now: () => time })
    const { token } = await resolve(RELEASE_URL)
    time = PENDING_TTL_MS
    expect(await install(token, { pluginsDir })).toEqual({ ok: false, error: 'expired' })
  })

  it('never replaces a plugin that came from somewhere else', async () => {
    const { resolve, install, recordTrust } = installer({ sourceOf: () => 'store' })
    const { token } = await resolve(RELEASE_URL)
    expect(await install(token, { pluginsDir })).toEqual({ ok: false, error: 'already-installed' })
    expect(fs.readdirSync(pluginsDir)).toEqual([])
    expect(recordTrust).not.toHaveBeenCalled()
  })

  it('passes resolution errors straight back', async () => {
    const { resolve } = installer()
    expect(await resolve('https://github.com/octo/notes')).toEqual({ ok: false, error: 'bad-release-url' })
  })
})

describe('which installed plugins a GitHub install may replace', () => {
  it('replaces only an earlier GitHub install', () => {
    expect(installConflict(null)).toBeNull()
    expect(installConflict('github')).toBeNull()
    expect(installConflict('store')).toBe('already-installed')
    expect(installConflict('folder')).toBe('already-installed')
    expect(installConflict('preset')).toBe('already-installed')
  })
})
