const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const {
  DEFAULT_AUTH_BASE,
  DEFAULT_WEBSITE_BASE,
  GENERATED_CONFIG_FILE,
  readDotEnv,
  normaliseBase,
  parsePublicKeys,
} = require('../electron/licenceConfig')
const { GENERATED_KEY_FILE } = require('../electron/pluginSignature')

const ENV_PATH = path.join(__dirname, '..', '.env')
const OUTPUT_PATH = path.join(__dirname, '..', 'electron', GENERATED_CONFIG_FILE)
const MARKETPLACE_KEY_OUTPUT_PATH = path.join(__dirname, '..', 'electron', GENERATED_KEY_FILE)
const SETTING_NAMES = [
  'ALPINE_RELEASE_BUILD',
  'ALPINE_LICENCE_PUBLIC_KEYS',
  'ALPINE_AUTH_BASE',
  'ALPINE_WEBSITE_BASE',
  'ALPINE_MARKETPLACE_PUBKEY',
]

function isEd25519PublicKey(spkiPem) {
  try {
    return crypto.createPublicKey(spkiPem).asymmetricKeyType === 'ed25519'
  } catch {
    return false
  }
}

function buildLicenceConfig(settings) {
  const isReleaseBuild = settings.ALPINE_RELEASE_BUILD === '1'
  const publicKeys = parsePublicKeys(settings.ALPINE_LICENCE_PUBLIC_KEYS)
  const unusable = publicKeys.filter((key) => !isEd25519PublicKey(key.spkiPem)).map((key) => key.kid)
  if (unusable.length > 0) throw new Error(`ALPINE_LICENCE_PUBLIC_KEYS holds keys that are not Ed25519 SPKI PEM: ${unusable.join(', ')}`)
  if (isReleaseBuild && publicKeys.length === 0) throw new Error('ALPINE_RELEASE_BUILD=1 needs at least one key in ALPINE_LICENCE_PUBLIC_KEYS')
  return {
    isReleaseBuild,
    authBase: normaliseBase(settings.ALPINE_AUTH_BASE, DEFAULT_AUTH_BASE),
    websiteBase: normaliseBase(settings.ALPINE_WEBSITE_BASE, DEFAULT_WEBSITE_BASE),
    publicKeys,
  }
}

function decodeBase64Pem(value) {
  try {
    const decoded = Buffer.from(value, 'base64').toString('utf8')
    return decoded.includes('BEGIN PUBLIC KEY') ? decoded : null
  } catch {
    return null
  }
}

function normaliseMarketplacePublicKey(raw, isReleaseBuild = false) {
  const trimmed = typeof raw === 'string' ? raw.trim() : ''
  if (!trimmed && isReleaseBuild) throw new Error('ALPINE_RELEASE_BUILD=1 needs ALPINE_MARKETPLACE_PUBKEY: a release build refuses every plugin it cannot verify')
  if (!trimmed) return null
  const unescaped = trimmed.replace(/\\n/g, '\n')
  const pem = unescaped.includes('BEGIN PUBLIC KEY') ? unescaped : decodeBase64Pem(unescaped)
  if (!pem || !isEd25519PublicKey(pem)) throw new Error('ALPINE_MARKETPLACE_PUBKEY is not an Ed25519 SPKI PEM public key')
  return `${pem.trim()}\n`
}

function renderModule(config) {
  return `module.exports = ${JSON.stringify(config, null, 2)}\n`
}

function renderMarketplaceKeyModule(publicKeyPem) {
  return `module.exports = {\n  publicKeyPem: ${JSON.stringify(publicKeyPem)},\n}\n`
}

function mergeSettings(env, dotEnv) {
  const settings = {}
  for (const name of SETTING_NAMES) {
    const fromEnv = typeof env[name] === 'string' ? env[name] : ''
    const fromDotEnv = typeof dotEnv[name] === 'string' ? dotEnv[name] : ''
    settings[name] = fromEnv || fromDotEnv
  }
  return settings
}

function run() {
  const settings = mergeSettings(process.env, readDotEnv(ENV_PATH))
  const config = buildLicenceConfig(settings)
  const marketplacePublicKey = normaliseMarketplacePublicKey(settings.ALPINE_MARKETPLACE_PUBKEY, config.isReleaseBuild)
  fs.writeFileSync(OUTPUT_PATH, renderModule(config), 'utf8')
  fs.writeFileSync(MARKETPLACE_KEY_OUTPUT_PATH, renderMarketplaceKeyModule(marketplacePublicKey), 'utf8')
  const kids = config.publicKeys.map((key) => key.kid).join(', ') || 'none'
  console.log(`[licence] Baked ${config.isReleaseBuild ? 'release' : 'development'} config: auth ${config.authBase}, keys ${kids}`)
  if (marketplacePublicKey) {
    console.log('[licence] Baked the marketplace public key')
  } else {
    console.log('[licence] No marketplace public key; the app falls back to ALPINE_MARKETPLACE_PUBKEY at run time')
  }
}

if (require.main === module) {
  try {
    run()
  } catch (error) {
    console.error(`[licence] ${error.message}`)
    process.exit(1)
  }
}

module.exports = { buildLicenceConfig, normaliseMarketplacePublicKey, renderModule, renderMarketplaceKeyModule, mergeSettings, run }
