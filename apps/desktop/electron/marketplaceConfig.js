const fs = require('fs')
const path = require('path')
const { loadLicenceConfig } = require('./licenceConfig')

// Public base URL for the plugin marketplace (catalog + bundles + assets).
// Resolution order (first non-empty wins):
//   1. process.env.ALPINE_PLUGINS_BASE / STORAGE_PUBLIC_URL   (CI, shell overrides)
//   2. electron/marketplaceConfig.generated.js                (baked at build)
//   3. apps/desktop/.env  ALPINE_PLUGINS_BASE / STORAGE_PUBLIC_URL  (dev convenience)
//   4. DEFAULT_BASE
// The base is a *public read* URL — the same value the website uses as
// NEXT_PUBLIC_PLUGINS_BASE. It is not a secret; it ships inside the app.
const DEFAULT_BASE = 'https://bucket-production-4979d.up.railway.app/alpine-plugins'

function parseEnvFile(filePath) {
  const out = {}
  try {
    for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line || line.startsWith('#')) continue
      const eq = line.indexOf('=')
      if (eq === -1) continue
      const key = line.slice(0, eq).trim()
      let value = line.slice(eq + 1).trim()
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      out[key] = value
    }
  } catch {
    void 0
  }
  return out
}

function fromEnv() {
  return process.env.ALPINE_PLUGINS_BASE || process.env.STORAGE_PUBLIC_URL || ''
}

function fromBaked() {
  try {
    const baked = require('./marketplaceConfig.generated')
    if (baked && typeof baked.pluginsBase === 'string' && baked.pluginsBase.trim()) return baked.pluginsBase
  } catch {
    void 0
  }
  return ''
}

function fromDotEnv() {
  const parsed = parseEnvFile(path.join(__dirname, '..', '.env'))
  return parsed.ALPINE_PLUGINS_BASE || parsed.STORAGE_PUBLIC_URL || ''
}

function isHttpsBase(value) {
  return /^https:\/\/[^\s/]+/i.test(value)
}

function resolvePluginsBase({ isReleaseBuild, env, baked, dotEnv }) {
  const raw = isReleaseBuild
    ? (isHttpsBase(baked) ? baked : DEFAULT_BASE)
    : env || baked || dotEnv || DEFAULT_BASE
  return String(raw).replace(/\/+$/, '')
}

let cached = null
function getPluginsBase() {
  if (cached === null) {
    const isReleaseBuild = loadLicenceConfig().isReleaseBuild === true
    cached = resolvePluginsBase({
      isReleaseBuild,
      env: isReleaseBuild ? '' : fromEnv(),
      baked: fromBaked(),
      dotEnv: isReleaseBuild ? '' : fromDotEnv(),
    })
  }
  return cached
}

module.exports = { getPluginsBase, resolvePluginsBase, DEFAULT_BASE }
