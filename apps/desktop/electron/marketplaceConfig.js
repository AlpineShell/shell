const fs = require('fs')
const path = require('path')

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

let cached = null
function getPluginsBase() {
  if (cached === null) {
    const raw = fromEnv() || fromBaked() || fromDotEnv() || DEFAULT_BASE
    cached = String(raw).replace(/\/+$/, '')
  }
  return cached
}

module.exports = { getPluginsBase, DEFAULT_BASE }
