const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { getPluginsBase } = require('./marketplaceConfig')
const { extractZip } = require('./pluginZip')
const { verifyPackage } = require('./pluginSignature')

const SAFE_ID = /^[a-z0-9][a-z0-9._-]*$/
const FETCH_TIMEOUT_MS = 20000
const MAX_BUNDLE_BYTES = 25 * 1024 * 1024 // 25 MB — plugins are small; refuse anything huge

function base() {
  return getPluginsBase()
}

// Run one async fetch (headers AND body read) under a single abort timer, clearing
// it only after the body has been consumed — so a stalled response body can't hang
// the call forever (clearing after fetch() alone would leave the read untimed).
async function withTimeout(run) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    return await run(controller.signal)
  } finally {
    clearTimeout(timer)
  }
}

async function fetchJson(url) {
  return withTimeout(async (signal) => {
    const res = await fetch(url, { signal, redirect: 'follow' })
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
    return res.json()
  })
}

// Resolve a possibly-relative catalog asset key against the public base. Only
// https is allowed; lucide:* icons and http are dropped (rendered as fallback).
function assetUrl(id, rel) {
  if (!rel || typeof rel !== 'string') return null
  if (/^https:\/\//i.test(rel)) return rel
  if (/^https?:\/\//i.test(rel)) return null
  if (rel.startsWith('lucide:')) return null
  const key = rel.startsWith('plugins/') ? rel : `plugins/${id}/${rel}`
  return `${base()}/${key.replace(/^\/+/, '')}`
}

function toCard(raw) {
  if (!raw || typeof raw !== 'object') return null
  const id = typeof raw.id === 'string' ? raw.id : null
  if (!id || !SAFE_ID.test(id)) return null
  const iconRel =
    (typeof raw.iconUrl === 'string' && raw.iconUrl) ||
    (typeof raw.logo === 'string' && raw.logo) ||
    (typeof raw.icon === 'string' && raw.icon) ||
    null
  const authorObj = raw.author
  const author =
    typeof authorObj === 'string'
      ? authorObj
      : authorObj && typeof authorObj === 'object' && typeof authorObj.name === 'string'
        ? authorObj.name
        : null
  return {
    id,
    name: typeof raw.name === 'string' ? raw.name : id,
    version: typeof raw.version === 'string' ? raw.version : '0.0.0',
    shortDescription:
      (typeof raw.shortDescription === 'string' && raw.shortDescription) ||
      (typeof raw.description === 'string' && raw.description) ||
      '',
    description: typeof raw.description === 'string' ? raw.description : '',
    category: typeof raw.category === 'string' ? raw.category : null,
    iconUrl: assetUrl(id, iconRel),
    author,
    // Trust comes from the Ed25519 signature verified against the baked marketplace
    // key — NOT from a `verified` boolean the (untrusted) catalog can self-assert.
    verified:
      verifyPackage(
        typeof raw.sha256 === 'string' ? raw.sha256 : '',
        typeof raw.signature === 'string' ? raw.signature : null,
      ).verified === true,
    apiVersion: typeof raw.apiVersion === 'number' ? raw.apiVersion : 1,
    size: typeof raw.size === 'number' ? raw.size : null,
  }
}

async function list() {
  const json = await fetchJson(`${base()}/plugins/index.json`)
  const plugins = json && Array.isArray(json.plugins) ? json.plugins.map(toCard).filter(Boolean) : []
  return { base: base(), plugins }
}

async function detail(id) {
  if (typeof id !== 'string' || !SAFE_ID.test(id)) return null
  const json = await fetchJson(`${base()}/plugins/${id}/latest.json`)
  if (!json) return null
  const card = toCard(json)
  if (!card) return null
  return {
    ...card,
    readme: typeof json.readme === 'string' ? json.readme : null,
    homepage: typeof json.homepage === 'string' && json.homepage.startsWith('https://') ? json.homepage : null,
    repository:
      typeof json.repository === 'string' && json.repository.startsWith('https://') ? json.repository : null,
    screenshots: Array.isArray(json.screenshots)
      ? json.screenshots
          .map((s) => {
            if (typeof s === 'string') {
              const src = assetUrl(id, s)
              return src ? { src } : null
            }
            if (s && typeof s === 'object') {
              const src = assetUrl(id, s.src)
              return src ? { src, caption: typeof s.caption === 'string' ? s.caption : undefined } : null
            }
            return null
          })
          .filter(Boolean)
      : [],
    network:
      json.network && typeof json.network === 'object' && Array.isArray(json.network.connect)
        ? { connect: json.network.connect.filter((h) => typeof h === 'string') }
        : { connect: [] },
  }
}

// latest.json is the authoritative full document (carries url/sha256/signature);
// fall back to the index card if it's missing for some reason.
async function fetchInstallSource(id) {
  const latest = await fetchJson(`${base()}/plugins/${id}/latest.json`)
  if (latest && typeof latest === 'object') return latest
  const idx = await fetchJson(`${base()}/plugins/index.json`)
  if (idx && Array.isArray(idx.plugins)) return idx.plugins.find((p) => p && p.id === id) || null
  return null
}

async function install(payload, { pluginsDir, onChange } = {}) {
  const id = payload && typeof payload === 'object' ? payload.id : payload
  if (typeof id !== 'string' || !SAFE_ID.test(id)) return { ok: false, error: 'invalid-id' }
  if (!pluginsDir) return { ok: false, error: 'no-plugins-dir' }

  let src
  try {
    src = await fetchInstallSource(id)
  } catch (e) {
    return { ok: false, error: 'catalog-unreachable', detail: String((e && e.message) || e) }
  }
  if (!src) return { ok: false, error: 'not-found' }

  const bundleRel = typeof src.url === 'string' ? src.url : null
  const sha256 = typeof src.sha256 === 'string' ? src.sha256.toLowerCase() : null
  const signature = typeof src.signature === 'string' ? src.signature : null
  const version = typeof src.version === 'string' ? src.version : '0.0.0'
  if (!bundleRel || !/^plugins\//.test(bundleRel) || bundleRel.includes('..')) {
    return { ok: false, error: 'bad-bundle-url' }
  }
  if (!sha256 || !/^[0-9a-f]{64}$/.test(sha256)) return { ok: false, error: 'bad-digest' }

  let buf
  try {
    buf = await withTimeout(async (signal) => {
      const res = await fetch(`${base()}/${bundleRel.replace(/^\/+/, '')}`, { signal, redirect: 'follow' })
      if (!res.ok) throw new Error(`http-${res.status}`)
      return Buffer.from(await res.arrayBuffer())
    })
  } catch (e) {
    return { ok: false, error: 'download-failed', detail: String((e && e.message) || e) }
  }
  if (buf.length === 0) return { ok: false, error: 'empty-bundle' }
  if (buf.length > MAX_BUNDLE_BYTES) return { ok: false, error: 'too-large' }

  const digest = crypto.createHash('sha256').update(buf).digest('hex')
  if (digest !== sha256) return { ok: false, error: 'digest-mismatch' }

  const sig = verifyPackage(sha256, signature)
  const verified = sig.verified === true

  fs.mkdirSync(pluginsDir, { recursive: true })
  const finalDir = path.join(pluginsDir, id)
  const staging = path.join(pluginsDir, `.installing-${id}-${process.pid}`)
  const backup = path.join(pluginsDir, `.backup-${id}-${process.pid}`)
  try {
    fs.rmSync(staging, { recursive: true, force: true })
    fs.mkdirSync(staging, { recursive: true })

    extractZip(buf, staging)

    const manifestPath = path.join(staging, 'plugin.json')
    if (!fs.existsSync(manifestPath)) return { ok: false, error: 'no-manifest' }
    let manifest
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8').replace(/^﻿/, ''))
    } catch {
      return { ok: false, error: 'bad-manifest' }
    }
    if (manifest.id !== id) return { ok: false, error: 'id-mismatch' }

    // Swap in without ever leaving the existing install half-deleted: move the old
    // copy aside atomically, put the new one in place, restore the old on failure.
    fs.rmSync(backup, { recursive: true, force: true })
    let movedAside = false
    if (fs.existsSync(finalDir)) {
      fs.renameSync(finalDir, backup)
      movedAside = true
    }
    try {
      fs.renameSync(staging, finalDir)
    } catch (e) {
      if (movedAside) {
        try { fs.rmSync(finalDir, { recursive: true, force: true }) } catch { void 0 }
        try { fs.renameSync(backup, finalDir) } catch { void 0 }
      }
      throw e
    }
  } catch (e) {
    return { ok: false, error: 'install-failed', detail: String((e && e.message) || e) }
  } finally {
    try { fs.rmSync(staging, { recursive: true, force: true }) } catch { void 0 }
    try { fs.rmSync(backup, { recursive: true, force: true }) } catch { void 0 }
  }

  if (typeof onChange === 'function') onChange()
  return { ok: true, id, version, verified, reason: sig.reason }
}

function uninstall(id, { pluginsDir, onChange } = {}) {
  if (typeof id !== 'string' || !SAFE_ID.test(id)) return { ok: false, error: 'invalid-id' }
  if (!pluginsDir) return { ok: false, error: 'no-plugins-dir' }
  const baseResolved = path.resolve(pluginsDir)
  const resolved = path.resolve(baseResolved, id)
  if (path.dirname(resolved) !== baseResolved) return { ok: false, error: 'unsafe-path' }
  if (!fs.existsSync(resolved)) return { ok: false, error: 'not-installed' }
  try {
    fs.rmSync(resolved, { recursive: true, force: true })
  } catch (e) {
    return { ok: false, error: 'remove-failed', detail: String((e && e.message) || e) }
  }
  if (typeof onChange === 'function') onChange()
  return { ok: true, id }
}

module.exports = { list, detail, install, uninstall, getBase: base }
