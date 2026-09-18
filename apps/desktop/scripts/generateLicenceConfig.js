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
  parseGraceUntil,
} = require('../electron/licenceConfig')

const ENV_PATH = path.join(__dirname, '..', '.env')
const OUTPUT_PATH = path.join(__dirname, '..', 'electron', GENERATED_CONFIG_FILE)

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
    upgradeGraceUntil: parseGraceUntil(settings.ALPINE_UPGRADE_GRACE_UNTIL),
  }
}

function renderModule(config) {
  return `module.exports = ${JSON.stringify(config, null, 2)}\n`
}

function mergeSettings(env, dotEnv) {
  const names = ['ALPINE_RELEASE_BUILD', 'ALPINE_LICENCE_PUBLIC_KEYS', 'ALPINE_AUTH_BASE', 'ALPINE_WEBSITE_BASE', 'ALPINE_UPGRADE_GRACE_UNTIL']
  const settings = {}
  for (const name of names) {
    const fromEnv = typeof env[name] === 'string' ? env[name] : ''
    const fromDotEnv = typeof dotEnv[name] === 'string' ? dotEnv[name] : ''
    settings[name] = fromEnv || fromDotEnv
  }
  return settings
}

function run() {
  const config = buildLicenceConfig(mergeSettings(process.env, readDotEnv(ENV_PATH)))
  fs.writeFileSync(OUTPUT_PATH, renderModule(config), 'utf8')
  const kids = config.publicKeys.map((key) => key.kid).join(', ') || 'none'
  console.log(`[licence] Baked ${config.isReleaseBuild ? 'release' : 'development'} config: auth ${config.authBase}, keys ${kids}, upgrade grace until ${config.upgradeGraceUntil || 'none'}`)
}

if (require.main === module) {
  try {
    run()
  } catch (error) {
    console.error(`[licence] ${error.message}`)
    process.exit(1)
  }
}

module.exports = { buildLicenceConfig, renderModule, mergeSettings, run }
