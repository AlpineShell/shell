const crypto = require('crypto')
const { loadLicenceConfig } = require('./licenceConfig')

const GENERATED_KEY_FILE = 'marketplacePublicKey.generated.js'

function readBakedPublicKeyPem() {
  try {
    const baked = require(`./${GENERATED_KEY_FILE}`)
    if (baked && typeof baked.publicKeyPem === 'string' && baked.publicKeyPem.trim()) return baked.publicKeyPem
  } catch {
    void 0
  }
  return null
}

function resolveMarketplacePublicKey({ baked, env, isReleaseBuild }) {
  if (isReleaseBuild) return baked || null
  const override = env && typeof env.ALPINE_MARKETPLACE_PUBKEY === 'string' ? env.ALPINE_MARKETPLACE_PUBKEY : ''
  return override.trim() ? override : baked || null
}

let resolvedPublicKey
function getMarketplacePublicKey() {
  if (resolvedPublicKey === undefined) {
    resolvedPublicKey = resolveMarketplacePublicKey({
      baked: readBakedPublicKeyPem(),
      env: process.env,
      isReleaseBuild: loadLicenceConfig().isReleaseBuild === true,
    })
  }
  return resolvedPublicKey
}

function toPublicKeyObject(key) {
  if (!key) return null
  if (typeof key === 'object' && key.asymmetricKeyType) return key
  try {
    return crypto.createPublicKey(key)
  } catch {
    return null
  }
}

function toPrivateKeyObject(key) {
  if (!key) return null
  if (typeof key === 'object' && key.asymmetricKeyType) return key
  try {
    return crypto.createPrivateKey(key)
  } catch {
    return null
  }
}

function toSignatureBuffer(signature) {
  if (Buffer.isBuffer(signature)) return signature
  if (typeof signature === 'string') {
    try {
      return Buffer.from(signature, 'base64')
    } catch {
      return null
    }
  }
  return null
}

function verifySignature(dataBuffer, signature, publicKey) {
  const key = toPublicKeyObject(publicKey)
  if (!key || key.asymmetricKeyType !== 'ed25519') return false
  const data = Buffer.isBuffer(dataBuffer) ? dataBuffer : null
  if (!data) return false
  const sig = toSignatureBuffer(signature)
  if (!sig || sig.length !== 64) return false
  try {
    return crypto.verify(null, data, key, sig)
  } catch {
    return false
  }
}

function signBuffer(dataBuffer, privateKey) {
  const key = toPrivateKeyObject(privateKey)
  if (!key || key.asymmetricKeyType !== 'ed25519') {
    throw new Error('signBuffer requires an ed25519 private key')
  }
  if (!Buffer.isBuffer(dataBuffer)) {
    throw new Error('signBuffer requires a Buffer')
  }
  return crypto.sign(null, dataBuffer, key)
}

function generateKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')
  return {
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  }
}

function verifyPackage(packageSha256Hex, signatureBase64) {
  if (typeof packageSha256Hex !== 'string' || !/^[0-9a-fA-F]{64}$/.test(packageSha256Hex)) {
    return { verified: false, reason: 'invalid-digest' }
  }
  if (typeof signatureBase64 !== 'string' || !signatureBase64.trim()) {
    return { verified: false, reason: 'no-signature' }
  }
  const pubKey = getMarketplacePublicKey()
  if (!pubKey) return { verified: false, reason: 'no-marketplace-key' }
  let digest
  try {
    digest = Buffer.from(packageSha256Hex, 'hex')
  } catch {
    return { verified: false, reason: 'invalid-digest' }
  }
  const ok = verifySignature(digest, signatureBase64, pubKey)
  return ok ? { verified: true, reason: null } : { verified: false, reason: 'bad-signature' }
}

module.exports = {
  GENERATED_KEY_FILE,
  resolveMarketplacePublicKey,
  verifySignature,
  signBuffer,
  generateKeyPair,
  getMarketplacePublicKey,
  verifyPackage,
}
