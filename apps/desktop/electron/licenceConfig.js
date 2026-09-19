const fs = require('fs')
const path = require('path')

const DEFAULT_AUTH_BASE = 'https://auth.alpineshell.com'
const DEFAULT_WEBSITE_BASE = 'https://alpineshell.com'
const DEVICE_CLIENT_ID = 'alpine-shell-desktop'
const GENERATED_CONFIG_FILE = 'licenceConfig.generated.js'
const DOT_ENV_PATH = path.join(__dirname, '..', '.env')

function parseEnvText(text) {
  const result = {}
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const separator = line.indexOf('=')
    if (separator === -1) continue
    const key = line.slice(0, separator).trim()
    let value = line.slice(separator + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    result[key] = value
  }
  return result
}

function readDotEnv(filePath = DOT_ENV_PATH) {
  try {
    return parseEnvText(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return {}
  }
}

function normaliseBase(value, fallback) {
  const trimmed = typeof value === 'string' ? value.trim().replace(/\/+$/, '') : ''
  return /^https?:\/\/[^\s/]+/.test(trimmed) ? trimmed : fallback
}

function isPublicKeyEntry(entry) {
  return Boolean(entry)
    && typeof entry.kid === 'string' && entry.kid.trim().length > 0
    && typeof entry.spkiPem === 'string' && entry.spkiPem.includes('BEGIN PUBLIC KEY')
}

function parsePublicKeys(value) {
  let list = value
  if (typeof value === 'string') {
    if (!value.trim()) return []
    try {
      list = JSON.parse(value)
    } catch {
      return []
    }
  }
  if (!Array.isArray(list)) return []
  return list.filter(isPublicKeyEntry).map((entry) => ({ kid: entry.kid.trim(), spkiPem: entry.spkiPem.replace(/\\n/g, '\n') }))
}

function releaseConfig(baked) {
  return {
    isReleaseBuild: true,
    authBase: normaliseBase(baked.authBase, DEFAULT_AUTH_BASE),
    websiteBase: normaliseBase(baked.websiteBase, DEFAULT_WEBSITE_BASE),
    publicKeys: parsePublicKeys(baked.publicKeys),
    enforceInDevelopment: false,
  }
}

function developmentConfig(baked, env, dotEnv) {
  const setting = (name) => {
    const fromEnv = env && typeof env[name] === 'string' ? env[name] : ''
    const fromDotEnv = dotEnv && typeof dotEnv[name] === 'string' ? dotEnv[name] : ''
    return fromEnv || fromDotEnv
  }
  const overrideKeys = parsePublicKeys(setting('ALPINE_LICENCE_PUBLIC_KEYS'))
  return {
    isReleaseBuild: false,
    authBase: normaliseBase(setting('ALPINE_AUTH_BASE') || (baked && baked.authBase), DEFAULT_AUTH_BASE),
    websiteBase: normaliseBase(setting('ALPINE_WEBSITE_BASE') || (baked && baked.websiteBase), DEFAULT_WEBSITE_BASE),
    publicKeys: overrideKeys.length > 0 ? overrideKeys : parsePublicKeys(baked && baked.publicKeys),
    enforceInDevelopment: setting('ALPINE_ENFORCE_LICENCE') === '1',
  }
}

function resolveLicenceConfig({ baked, env, dotEnv }) {
  if (baked && baked.isReleaseBuild === true) return releaseConfig(baked)
  return developmentConfig(baked, env, dotEnv)
}

function readBakedConfig() {
  try {
    return require(`./${GENERATED_CONFIG_FILE}`)
  } catch {
    return null
  }
}

function loadLicenceConfig() {
  const baked = readBakedConfig()
  if (baked && baked.isReleaseBuild === true) return releaseConfig(baked)
  return developmentConfig(baked, process.env, readDotEnv())
}

module.exports = {
  DEFAULT_AUTH_BASE,
  DEFAULT_WEBSITE_BASE,
  DEVICE_CLIENT_ID,
  GENERATED_CONFIG_FILE,
  parseEnvText,
  readDotEnv,
  normaliseBase,
  parsePublicKeys,
  resolveLicenceConfig,
  loadLicenceConfig,
}
