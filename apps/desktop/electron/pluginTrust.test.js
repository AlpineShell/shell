import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

const {
  trustedFilesOf,
  folderContentHash,
  needsContentHash,
  trustDecision,
  receivesStoreUpdates,
  originOf,
  storeTrust,
  githubTrust,
  folderTrust,
  createTrustStore,
} = await import('./pluginTrust.js')

const ACCEPTED_AT = new Date('2026-11-03T10:00:00.000Z')

let workDir = ''

beforeEach(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alpine-plugin-trust-'))
})

afterEach(() => {
  fs.rmSync(workDir, { recursive: true, force: true })
})

function writePlugin(files) {
  const dir = path.join(workDir, 'com.example.notes')
  fs.mkdirSync(dir, { recursive: true })
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), content)
  return dir
}

describe('deciding whether a plugin may load', () => {
  it('always trusts a plugin that ships with Alpine Shell', () => {
    expect(trustDecision({ preset: true, trust: null, contentHash: null })).toEqual({ trusted: true, source: 'preset', needsTrust: null })
  })

  it('asks before loading a folder plugin nobody accepted', () => {
    expect(trustDecision({ preset: false, trust: null, contentHash: null })).toEqual({
      trusted: false,
      source: 'folder',
      needsTrust: { source: 'folder' },
    })
  })

  it('trusts store and GitHub installs by their record', () => {
    expect(trustDecision({ preset: false, trust: storeTrust({ sha256: 'a'.repeat(64) }), contentHash: null })).toMatchObject({ trusted: true, source: 'store' })
    const github = githubTrust({ repository: 'octo/notes', tag: 'v1.0.0', commit: 'b'.repeat(40), sha256: 'c'.repeat(64) })
    expect(trustDecision({ preset: false, trust: github, contentHash: null })).toMatchObject({ trusted: true, source: 'github' })
  })

  it('trusts an accepted folder plugin only while its files stay the same', () => {
    const trust = folderTrust('1'.repeat(64))
    expect(trustDecision({ preset: false, trust, contentHash: '1'.repeat(64) })).toMatchObject({ trusted: true, source: 'folder' })
    expect(trustDecision({ preset: false, trust, contentHash: '2'.repeat(64) })).toEqual({
      trusted: false,
      source: 'folder',
      needsTrust: { source: 'folder' },
    })
  })

  it('ignores a record with a source it does not know', () => {
    expect(trustDecision({ preset: false, trust: { source: 'website' }, contentHash: null })).toMatchObject({ trusted: false })
  })

  it('hashes the files only for an accepted folder plugin', () => {
    expect(needsContentHash(false, folderTrust('x'))).toBe(true)
    expect(needsContentHash(true, folderTrust('x'))).toBe(false)
    expect(needsContentHash(false, storeTrust({}))).toBe(false)
    expect(needsContentHash(false, null)).toBe(false)
  })
})

describe('the content hash of a folder plugin', () => {
  const record = { main: 'backend.js', renderer: 'index.js' }

  it('covers the manifest, the backend and the renderer', () => {
    expect(trustedFilesOf(record)).toEqual(['plugin.json', 'backend.js', 'index.js'])
    expect(trustedFilesOf({ main: null, renderer: 'index.js' })).toEqual(['plugin.json', 'index.js'])
  })

  it('changes when any of those files changes', () => {
    const dir = writePlugin({ 'plugin.json': '{"id":"com.example.notes"}', 'index.js': 'export {}', 'backend.js': 'module.exports = {}' })
    const before = folderContentHash(dir, trustedFilesOf(record))
    expect(folderContentHash(dir, trustedFilesOf(record))).toBe(before)
    fs.writeFileSync(path.join(dir, 'backend.js'), 'require("child_process")')
    expect(folderContentHash(dir, trustedFilesOf(record))).not.toBe(before)
  })

  it('changes when a file goes missing', () => {
    const dir = writePlugin({ 'plugin.json': '{}', 'index.js': 'export {}', 'backend.js': '' })
    const before = folderContentHash(dir, trustedFilesOf(record))
    fs.rmSync(path.join(dir, 'backend.js'))
    expect(folderContentHash(dir, trustedFilesOf(record))).not.toBe(before)
  })
})

describe('store updates', () => {
  it('reach store and preset plugins only', () => {
    expect(receivesStoreUpdates('store')).toBe(true)
    expect(receivesStoreUpdates('preset')).toBe(true)
    expect(receivesStoreUpdates('github')).toBe(false)
    expect(receivesStoreUpdates('folder')).toBe(false)
  })
})

describe('trust records', () => {
  it('describe where a GitHub plugin came from', () => {
    const entry = githubTrust({ repository: 'octo/notes', tag: 'v1.0.0', commit: 'b'.repeat(40), sha256: 'c'.repeat(64) }, ACCEPTED_AT)
    expect(entry).toEqual({
      source: 'github',
      repository: 'octo/notes',
      tag: 'v1.0.0',
      commit: 'b'.repeat(40),
      sha256: 'c'.repeat(64),
      acceptedAt: ACCEPTED_AT.toISOString(),
    })
    expect(originOf(entry)).toEqual({ repository: 'octo/notes', tag: 'v1.0.0', commit: 'b'.repeat(40) })
    expect(originOf(storeTrust({}))).toBeNull()
  })

  it('are kept in the trust file across reads', () => {
    const file = path.join(workDir, 'plugin-trust.json')
    const store = createTrustStore(file)
    store.set('com.example.notes', storeTrust({ sha256: 'a'.repeat(64) }, ACCEPTED_AT))
    expect(createTrustStore(file).get('com.example.notes')).toEqual({ source: 'store', sha256: 'a'.repeat(64), acceptedAt: ACCEPTED_AT.toISOString() })
    store.remove('com.example.notes')
    expect(createTrustStore(file).get('com.example.notes')).toBeNull()
  })

  it('seed the trust file once when it does not exist yet', () => {
    const file = path.join(workDir, 'plugin-trust.json')
    let seeds = 0
    const seed = () => {
      seeds += 1
      return { 'com.example.notes': storeTrust({}, ACCEPTED_AT) }
    }
    const store = createTrustStore(file, { seed })
    expect(store.get('com.example.notes')).toMatchObject({ source: 'store' })
    store.all()
    expect(seeds).toBe(1)
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toHaveProperty('com.example.notes')
  })

  it('drop entries that are not trust records', () => {
    const file = path.join(workDir, 'plugin-trust.json')
    fs.writeFileSync(file, JSON.stringify({ 'com.example.notes': { source: 'website' }, 'com.example.ok': { source: 'store' } }))
    expect(Object.keys(createTrustStore(file).all())).toEqual(['com.example.ok'])
  })
})
