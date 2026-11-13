const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const DEV_SIGNING_KEY_FILE = '.dev-signing-key'
const DEV_PUBLIC_KEY_FILE = 'dev-public-key.pem'

function parseSigningKey(raw) {
  let key
  try {
    key = crypto.createPrivateKey(Buffer.from(raw, 'base64').toString('utf8'))
  } catch (error) {
    throw new Error(`ALPINE_PLUGIN_SIGNING_KEY is not a base64 PKCS8 PEM private key: ${error.message}`)
  }
  if (key.asymmetricKeyType !== 'ed25519') {
    throw new Error(`ALPINE_PLUGIN_SIGNING_KEY must be an Ed25519 key, got ${key.asymmetricKeyType}`)
  }
  return key
}

function createDevSigningKey(keyPath) {
  const { privateKey } = crypto.generateKeyPairSync('ed25519')
  fs.mkdirSync(path.dirname(keyPath), { recursive: true })
  fs.writeFileSync(keyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 })
}

function devSigningKey(storeDir) {
  const keyPath = path.join(storeDir, DEV_SIGNING_KEY_FILE)
  if (!fs.existsSync(keyPath)) createDevSigningKey(keyPath)
  const key = crypto.createPrivateKey(fs.readFileSync(keyPath, 'utf8'))
  fs.writeFileSync(path.join(storeDir, DEV_PUBLIC_KEY_FILE), crypto.createPublicKey(key).export({ type: 'spki', format: 'pem' }))
  return key
}

function resolveSigningKey({ env = process.env, storeDir } = {}) {
  if (env.ALPINE_PLUGIN_SIGNING_KEY) return parseSigningKey(env.ALPINE_PLUGIN_SIGNING_KEY)
  if (storeDir) return devSigningKey(storeDir)
  throw new Error('ALPINE_PLUGIN_SIGNING_KEY is not set: a release build refuses unsigned bundles, so nothing was published')
}

function signDigest(digest, signingKey) {
  return crypto.sign(null, digest, signingKey).toString('base64')
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    const keys = Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function signDocument(document, signingKey) {
  const signature = crypto.sign(null, Buffer.from(canonicalJson(document), 'utf8'), signingKey).toString('base64')
  return { ...document, signature }
}

module.exports = {
  DEV_PUBLIC_KEY_FILE,
  DEV_SIGNING_KEY_FILE,
  canonicalJson,
  resolveSigningKey,
  signDigest,
  signDocument,
}
