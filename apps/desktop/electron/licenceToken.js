const crypto = require('crypto')

const LICENCE_TOKEN_TYPE = 'alpine-licence+jwt'
const LICENCE_TOKEN_ALGORITHM = 'EdDSA'
const LICENCE_TOKEN_AUDIENCE = 'alpine-shell-desktop'
const ED25519_SIGNATURE_LENGTH = 64
const REQUIRED_STRING_CLAIMS = ['iss', 'sub', 'lic', 'act', 'dev', 'jti']
const REQUIRED_NUMBER_CLAIMS = ['iat']
const OPTIONAL_NUMBER_CLAIMS = ['exp', 'nbf']
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/

function decodeJsonSegment(segment) {
  try {
    const parsed = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

function decodeLicenceToken(token) {
  if (typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length !== 3 || parts.some((part) => !BASE64URL_PATTERN.test(part))) return null
  const header = decodeJsonSegment(parts[0])
  const payload = decodeJsonSegment(parts[1])
  if (!header || !payload) return null
  return {
    header,
    payload,
    signature: Buffer.from(parts[2], 'base64url'),
    signingInput: `${parts[0]}.${parts[1]}`,
  }
}

function findPublicKeyPem(publicKeys, kid) {
  if (typeof kid !== 'string' || !kid || !Array.isArray(publicKeys)) return null
  const entry = publicKeys.find((key) => key && key.kid === kid && typeof key.spkiPem === 'string')
  return entry ? entry.spkiPem : null
}

function toEd25519PublicKey(spkiPem) {
  try {
    const key = crypto.createPublicKey(spkiPem)
    return key.asymmetricKeyType === 'ed25519' ? key : null
  } catch {
    return null
  }
}

function signatureMatches(signingInput, signature, publicKey) {
  if (signature.length !== ED25519_SIGNATURE_LENGTH) return false
  try {
    return crypto.verify(null, Buffer.from(signingInput, 'utf8'), publicKey, signature)
  } catch {
    return false
  }
}

function hasRequiredClaims(payload) {
  const stringsPresent = REQUIRED_STRING_CLAIMS.every((name) => typeof payload[name] === 'string' && payload[name].length > 0)
  const numbersPresent = REQUIRED_NUMBER_CLAIMS.every((name) => Number.isFinite(payload[name]))
  return stringsPresent && numbersPresent
}

function hasWellFormedOptionalClaims(payload) {
  return OPTIONAL_NUMBER_CLAIMS.every((name) => payload[name] === undefined || Number.isFinite(payload[name]))
}

function normaliseIssuer(value) {
  return typeof value === 'string' ? value.trim().replace(/\/+$/, '') : ''
}

function audienceMatches(claimed, expected) {
  if (Array.isArray(claimed)) return claimed.includes(expected)
  return claimed === expected
}

function failure(reason, claims = null) {
  return { ok: false, reason, claims }
}

function timeFailure(payload, nowMs) {
  const nowSeconds = Math.floor(nowMs / 1000)
  if (Number.isFinite(payload.nbf) && payload.nbf > nowSeconds) return failure('not-yet-valid', payload)
  if (Number.isFinite(payload.exp) && payload.exp <= nowSeconds) return failure('expired', payload)
  return null
}

function verifyLicenceToken(token, options = {}) {
  const { publicKeys = [], issuer, audience = LICENCE_TOKEN_AUDIENCE, deviceId, now } = options
  const decoded = decodeLicenceToken(token)
  if (!decoded) return failure('malformed')
  const { header, payload, signature, signingInput } = decoded
  if (header.alg !== LICENCE_TOKEN_ALGORITHM) return failure('alg-not-eddsa')
  if (header.typ !== LICENCE_TOKEN_TYPE) return failure('wrong-type')
  const spkiPem = findPublicKeyPem(publicKeys, header.kid)
  if (!spkiPem) return failure('unknown-kid')
  const publicKey = toEd25519PublicKey(spkiPem)
  if (!publicKey) return failure('unusable-key')
  if (!signatureMatches(signingInput, signature, publicKey)) return failure('bad-signature')
  if (!hasRequiredClaims(payload)) return failure('missing-claims')
  if (!hasWellFormedOptionalClaims(payload)) return failure('malformed-claims')
  if (issuer !== undefined && normaliseIssuer(payload.iss) !== normaliseIssuer(issuer)) return failure('wrong-issuer')
  if (!audienceMatches(payload.aud, audience)) return failure('wrong-audience')
  if (now !== undefined) {
    const expiredOrEarly = timeFailure(payload, now)
    if (expiredOrEarly) return expiredOrEarly
  }
  if (deviceId !== undefined && payload.dev !== deviceId) return failure('device-mismatch', payload)
  return { ok: true, reason: null, claims: payload }
}

function tokenExpiryMs(claims) {
  return claims && Number.isFinite(claims.exp) ? claims.exp * 1000 : null
}

module.exports = {
  LICENCE_TOKEN_TYPE,
  LICENCE_TOKEN_ALGORITHM,
  LICENCE_TOKEN_AUDIENCE,
  decodeLicenceToken,
  findPublicKeyPem,
  verifyLicenceToken,
  tokenExpiryMs,
}
