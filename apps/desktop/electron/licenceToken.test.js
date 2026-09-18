import { describe, expect, it } from 'vitest'
import crypto from 'crypto'

const {
  verifyLicenceToken,
  decodeLicenceToken,
  tokenExpiryMs,
  tokenIssuedAtMs,
  LICENCE_TOKEN_TYPE,
  LICENCE_TOKEN_AUDIENCE,
} = await import('./licenceToken.js')

const ISSUER = 'https://auth.alpineshell.com'
const DEVICE_ID = 'a'.repeat(64)
const NOW_MS = Date.UTC(2026, 8, 18, 12, 0, 0)
const NOW_SECONDS = Math.floor(NOW_MS / 1000)

function makeKeyPair(kid) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')
  return { kid, privateKey, spkiPem: publicKey.export({ type: 'spki', format: 'pem' }).toString() }
}

function base64url(value) {
  return Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url')
}

function mintToken(keyPair, claimOverrides = {}, headerOverrides = {}) {
  const header = { alg: 'EdDSA', kid: keyPair.kid, typ: LICENCE_TOKEN_TYPE, ...headerOverrides }
  const claims = {
    iss: ISSUER,
    aud: LICENCE_TOKEN_AUDIENCE,
    sub: 'user_1',
    lic: 'lic_1',
    act: 'act_1',
    dev: DEVICE_ID,
    email: 'someone@example.com',
    jti: 'jti_1',
    iat: NOW_SECONDS - 60,
    exp: NOW_SECONDS + 30 * 24 * 3600,
    ...claimOverrides,
  }
  const signingInput = `${base64url(header)}.${base64url(claims)}`
  const signature = crypto.sign(null, Buffer.from(signingInput), keyPair.privateKey)
  return `${signingInput}.${signature.toString('base64url')}`
}

const signingKey = makeKeyPair('lic-2026-09')
const otherKey = makeKeyPair('lic-2026-09')
const olderKey = makeKeyPair('lic-2026-01')
const publicKeys = [{ kid: signingKey.kid, spkiPem: signingKey.spkiPem }, { kid: olderKey.kid, spkiPem: olderKey.spkiPem }]
const fullOptions = { publicKeys, issuer: ISSUER, deviceId: DEVICE_ID, now: NOW_MS }

describe('verifyLicenceToken', () => {
  it('accepts a token signed by a baked key for this device', () => {
    const result = verifyLicenceToken(mintToken(signingKey), fullOptions)
    expect(result.ok).toBe(true)
    expect(result.reason).toBeNull()
    expect(result.claims).toMatchObject({ lic: 'lic_1', act: 'act_1', dev: DEVICE_ID, email: 'someone@example.com' })
  })

  it('accepts a token signed by the older baked key during a rotation', () => {
    expect(verifyLicenceToken(mintToken(olderKey), fullOptions).ok).toBe(true)
  })

  it('rejects a token signed with the wrong key under a known kid', () => {
    expect(verifyLicenceToken(mintToken(otherKey), fullOptions)).toMatchObject({ ok: false, reason: 'bad-signature' })
  })

  it('rejects a kid that is not baked', () => {
    const unknown = makeKeyPair('lic-2030-01')
    expect(verifyLicenceToken(mintToken(unknown), fullOptions)).toMatchObject({ ok: false, reason: 'unknown-kid' })
    expect(verifyLicenceToken(mintToken(signingKey, {}, { kid: undefined }), fullOptions)).toMatchObject({ ok: false, reason: 'unknown-kid' })
  })

  it('rejects any algorithm but EdDSA even when the signature is correct', () => {
    expect(verifyLicenceToken(mintToken(signingKey, {}, { alg: 'HS256' }), fullOptions)).toMatchObject({ ok: false, reason: 'alg-not-eddsa' })
    expect(verifyLicenceToken(mintToken(signingKey, {}, { alg: 'none' }), fullOptions)).toMatchObject({ ok: false, reason: 'alg-not-eddsa' })
  })

  it('rejects a token of another type', () => {
    expect(verifyLicenceToken(mintToken(signingKey, {}, { typ: 'JWT' }), fullOptions)).toMatchObject({ ok: false, reason: 'wrong-type' })
  })

  it('rejects the wrong audience', () => {
    expect(verifyLicenceToken(mintToken(signingKey, { aud: 'alpine-shell-website' }), fullOptions)).toMatchObject({ ok: false, reason: 'wrong-audience' })
  })

  it('accepts an audience list that includes the desktop', () => {
    expect(verifyLicenceToken(mintToken(signingKey, { aud: ['other', LICENCE_TOKEN_AUDIENCE] }), fullOptions).ok).toBe(true)
  })

  it('rejects the wrong issuer and tolerates a trailing slash on the right one', () => {
    expect(verifyLicenceToken(mintToken(signingKey, { iss: 'https://evil.example.com' }), fullOptions)).toMatchObject({ ok: false, reason: 'wrong-issuer' })
    expect(verifyLicenceToken(mintToken(signingKey, { iss: `${ISSUER}/` }), fullOptions).ok).toBe(true)
    expect(verifyLicenceToken(mintToken(signingKey), { ...fullOptions, issuer: `${ISSUER}/` }).ok).toBe(true)
  })

  it('rejects an expired token but still hands back its claims', () => {
    const result = verifyLicenceToken(mintToken(signingKey, { exp: NOW_SECONDS - 1 }), fullOptions)
    expect(result).toMatchObject({ ok: false, reason: 'expired' })
    expect(result.claims.exp).toBe(NOW_SECONDS - 1)
  })

  it('rejects a token that is not yet valid', () => {
    expect(verifyLicenceToken(mintToken(signingKey, { nbf: NOW_SECONDS + 60 }), fullOptions)).toMatchObject({ ok: false, reason: 'not-yet-valid' })
  })

  it('rejects a token minted for another device', () => {
    const result = verifyLicenceToken(mintToken(signingKey, { dev: 'b'.repeat(64) }), fullOptions)
    expect(result).toMatchObject({ ok: false, reason: 'device-mismatch' })
    expect(result.claims.dev).toBe('b'.repeat(64))
  })

  it('skips the time and device checks when they are not asked for', () => {
    const expired = mintToken(signingKey, { exp: NOW_SECONDS - 1, dev: 'b'.repeat(64) })
    expect(verifyLicenceToken(expired, { publicKeys, issuer: ISSUER }).ok).toBe(true)
  })

  it('rejects a token missing a required claim', () => {
    expect(verifyLicenceToken(mintToken(signingKey, { act: undefined }), fullOptions)).toMatchObject({ ok: false, reason: 'missing-claims' })
    expect(verifyLicenceToken(mintToken(signingKey, { exp: 'soon' }), fullOptions)).toMatchObject({ ok: false, reason: 'missing-claims' })
  })

  it('rejects tampered claims', () => {
    const [header, , signature] = mintToken(signingKey).split('.')
    const tampered = `${header}.${base64url({ ...decodeLicenceToken(mintToken(signingKey)).payload, exp: NOW_SECONDS + 10 * 365 * 24 * 3600 })}.${signature}`
    expect(verifyLicenceToken(tampered, fullOptions)).toMatchObject({ ok: false, reason: 'bad-signature' })
  })

  it('rejects malformed input without throwing', () => {
    expect(verifyLicenceToken(null, fullOptions)).toMatchObject({ ok: false, reason: 'malformed' })
    expect(verifyLicenceToken('', fullOptions)).toMatchObject({ ok: false, reason: 'malformed' })
    expect(verifyLicenceToken('a.b', fullOptions)).toMatchObject({ ok: false, reason: 'malformed' })
    expect(verifyLicenceToken('a.b.c.d', fullOptions)).toMatchObject({ ok: false, reason: 'malformed' })
    expect(verifyLicenceToken('not base64url!.x.y', fullOptions)).toMatchObject({ ok: false, reason: 'malformed' })
    expect(verifyLicenceToken(`${base64url('[]')}.${base64url('{}')}.AA`, fullOptions)).toMatchObject({ ok: false, reason: 'malformed' })
  })

  it('rejects an unusable baked key instead of throwing', () => {
    const rsa = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
    const keys = [{ kid: signingKey.kid, spkiPem: rsa.publicKey.export({ type: 'spki', format: 'pem' }).toString() }]
    expect(verifyLicenceToken(mintToken(signingKey), { ...fullOptions, publicKeys: keys })).toMatchObject({ ok: false, reason: 'unusable-key' })
    expect(verifyLicenceToken(mintToken(signingKey), { ...fullOptions, publicKeys: [{ kid: signingKey.kid, spkiPem: 'garbage' }] })).toMatchObject({ ok: false, reason: 'unusable-key' })
  })

  it('never trusts an empty key list', () => {
    expect(verifyLicenceToken(mintToken(signingKey), { ...fullOptions, publicKeys: [] })).toMatchObject({ ok: false, reason: 'unknown-kid' })
  })
})

describe('claim timestamps', () => {
  it('converts exp and iat from seconds to milliseconds', () => {
    const { claims } = verifyLicenceToken(mintToken(signingKey), fullOptions)
    expect(tokenExpiryMs(claims)).toBe(claims.exp * 1000)
    expect(tokenIssuedAtMs(claims)).toBe(claims.iat * 1000)
    expect(tokenExpiryMs(null)).toBeNull()
    expect(tokenIssuedAtMs({})).toBeNull()
  })
})
