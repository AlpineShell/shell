const crypto = require('crypto')
const { publicKeyFromEccBlob, challengeDigest, verifyChallengeSignature } = require('./cngPublicKeyBlob')

const BINDING_TIERS = ['tpm', 'dpapi', 'machine']
const BINDING_HASH_PATTERN = /^[A-Za-z0-9_-]{43}$/
const CHALLENGE_BYTES = 32

function sha256Base64url(data) {
  return crypto.createHash('sha256').update(data).digest('base64url')
}

function isBindingTier(value) {
  return BINDING_TIERS.includes(value)
}

function isBindClaim(value) {
  return Boolean(value)
    && typeof value === 'object'
    && !Array.isArray(value)
    && isBindingTier(value.tier)
    && typeof value.hash === 'string'
    && BINDING_HASH_PATTERN.test(value.hash)
}

function bindingHashesMatch(expected, actual) {
  if (typeof expected !== 'string' || typeof actual !== 'string') return false
  const expectedBytes = Buffer.from(expected, 'utf8')
  const actualBytes = Buffer.from(actual, 'utf8')
  if (expectedBytes.length !== actualBytes.length) return false
  return crypto.timingSafeEqual(expectedBytes, actualBytes)
}

function claimKey(claim) {
  return `${claim.tier}:${claim.hash}`
}

function createBindingLadder({ tpm = null, dpapi = null, machine = null, randomBytes = crypto.randomBytes, log = () => undefined } = {}) {
  const verdicts = new Map()

  function keyProvesPossession(publicBlob) {
    const publicKey = publicKeyFromEccBlob(publicBlob)
    if (!publicKey) return false
    const challenge = randomBytes(CHALLENGE_BYTES)
    const signature = tpm.sign(challengeDigest(challenge))
    return verifyChallengeSignature(publicKey, challenge, signature)
  }

  function reproduceTpm() {
    if (!tpm) return null
    const publicBlob = tpm.publicBlob()
    if (!publicBlob || !keyProvesPossession(publicBlob)) return null
    return sha256Base64url(publicBlob)
  }

  function produceTpm() {
    if (!tpm || !tpm.available()) return null
    const existing = reproduceTpm()
    if (existing) return existing
    const created = tpm.createKey()
    if (!created || !keyProvesPossession(created)) return null
    return sha256Base64url(created)
  }

  function reproduceDpapi() {
    if (!dpapi) return null
    const secret = dpapi.unseal()
    return secret ? sha256Base64url(secret) : null
  }

  function produceDpapi() {
    if (!dpapi || !dpapi.available()) return null
    const existing = reproduceDpapi()
    if (existing) return existing
    const secret = dpapi.seal()
    return secret ? sha256Base64url(secret) : null
  }

  function reproduceMachine() {
    if (!machine) return null
    return machine.fingerprint()
  }

  const producers = { tpm: produceTpm, dpapi: produceDpapi, machine: reproduceMachine }
  const reproducers = { tpm: reproduceTpm, dpapi: reproduceDpapi, machine: reproduceMachine }

  function attempt(tier, work) {
    try {
      return work()
    } catch (error) {
      log(`binding tier ${tier} failed: ${error.message}`)
      return null
    }
  }

  function produce() {
    for (const tier of BINDING_TIERS) {
      const hash = attempt(tier, producers[tier])
      if (typeof hash === 'string' && BINDING_HASH_PATTERN.test(hash)) return { tier, hash }
    }
    return null
  }

  function verify(claim) {
    if (!isBindClaim(claim)) return false
    const key = claimKey(claim)
    if (verdicts.has(key)) return verdicts.get(key)
    const holds = bindingHashesMatch(claim.hash, attempt(claim.tier, reproducers[claim.tier]))
    verdicts.set(key, holds)
    return holds
  }

  function forget() {
    verdicts.clear()
  }

  function discard() {
    forget()
    if (tpm) attempt('tpm', () => tpm.deleteKey())
    if (dpapi) attempt('dpapi', () => dpapi.discard())
  }

  return { produce, verify, forget, discard }
}

module.exports = {
  BINDING_TIERS,
  BINDING_HASH_PATTERN,
  sha256Base64url,
  isBindingTier,
  isBindClaim,
  bindingHashesMatch,
  createBindingLadder,
}
