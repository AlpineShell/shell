const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const TRUST_FILE_NAME = 'plugin-trust.json'
const SOURCES = new Set(['store', 'github', 'folder'])
const MANIFEST_FILE = 'plugin.json'

function isTrustEntry(value) {
  return Boolean(value) && typeof value === 'object' && SOURCES.has(value.source)
}

function trustedFilesOf(record) {
  const files = [MANIFEST_FILE]
  for (const candidate of [record && record.main, record && record.renderer]) {
    if (typeof candidate === 'string' && candidate && !files.includes(candidate)) files.push(candidate)
  }
  return files
}

function folderContentHash(pluginDir, relativeFiles) {
  const hash = crypto.createHash('sha256')
  for (const relative of [...relativeFiles].sort()) {
    hash.update(relative)
    hash.update('\0')
    let content
    try {
      content = fs.readFileSync(path.join(pluginDir, relative))
    } catch {
      content = null
    }
    if (content) {
      hash.update(String(content.length))
      hash.update('\0')
      hash.update(content)
    } else {
      hash.update('missing')
    }
    hash.update('\0')
  }
  return hash.digest('hex')
}

function needsContentHash(preset, trust) {
  return !preset && isTrustEntry(trust) && trust.source === 'folder'
}

function trustDecision({ preset, trust, contentHash }) {
  if (preset) return { trusted: true, source: 'preset', needsTrust: null }
  if (!isTrustEntry(trust)) return { trusted: false, source: 'folder', needsTrust: { source: 'folder' } }
  if (trust.source === 'folder' && trust.sha256 !== contentHash) {
    return { trusted: false, source: 'folder', needsTrust: { source: 'folder' } }
  }
  return { trusted: true, source: trust.source, needsTrust: null }
}

function receivesStoreUpdates(source) {
  return source === 'store' || source === 'preset'
}

function originOf(trust) {
  if (!isTrustEntry(trust) || trust.source !== 'github') return null
  return { repository: trust.repository || '', tag: trust.tag || '', commit: trust.commit || '' }
}

function storeTrust({ sha256 }, now = new Date()) {
  return { source: 'store', ...(sha256 ? { sha256 } : {}), acceptedAt: now.toISOString() }
}

function githubTrust({ repository, tag, commit, sha256 }, now = new Date()) {
  return { source: 'github', repository, tag, commit, sha256, acceptedAt: now.toISOString() }
}

function folderTrust(contentHash, now = new Date()) {
  return { source: 'folder', sha256: contentHash, acceptedAt: now.toISOString() }
}

function migratedStoreTrust(now = new Date()) {
  return { source: 'store', acceptedAt: now.toISOString(), migrated: true }
}

function createTrustStore(filePath, { seed } = {}) {
  function write(entries) {
    const tmp = `${filePath}.tmp`
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true })
      fs.writeFileSync(tmp, JSON.stringify(entries, null, 2))
      fs.renameSync(tmp, filePath)
    } catch (e) {
      console.error('[plugin-trust] write error:', e && e.message)
    }
  }

  function seeded() {
    const entries = typeof seed === 'function' ? seed() : {}
    write(entries)
    return entries
  }

  function all() {
    let parsed
    try {
      parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    } catch (e) {
      if (e && e.code === 'ENOENT') return seeded()
      console.error('[plugin-trust] read error:', e && e.message)
      return {}
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(Object.entries(parsed).filter(([, entry]) => isTrustEntry(entry)))
  }

  function get(id) {
    return all()[id] || null
  }

  function set(id, entry) {
    write({ ...all(), [id]: entry })
  }

  function remove(id) {
    const entries = all()
    if (!(id in entries)) return
    delete entries[id]
    write(entries)
  }

  return { all, get, set, remove }
}

module.exports = {
  TRUST_FILE_NAME,
  trustedFilesOf,
  folderContentHash,
  needsContentHash,
  trustDecision,
  receivesStoreUpdates,
  originOf,
  storeTrust,
  githubTrust,
  folderTrust,
  migratedStoreTrust,
  createTrustStore,
}
