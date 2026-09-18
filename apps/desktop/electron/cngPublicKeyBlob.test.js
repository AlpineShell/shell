import { describe, expect, it } from 'vitest'
import crypto from 'crypto'

const {
  BCRYPT_ECDSA_PUBLIC_P256_MAGIC,
  P256_COORDINATE_BYTES,
  publicKeyFromEccBlob,
  eccBlobFromPublicKey,
  challengeDigest,
  verifyChallengeSignature,
} = await import('./cngPublicKeyBlob.js')

function p256KeyPair() {
  return crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
}

function signLikeCng(privateKey, challenge) {
  return crypto.sign('sha256', challenge, { key: privateKey, dsaEncoding: 'ieee-p1363' })
}

describe('the CNG ECC public key blob', () => {
  it('round-trips a P-256 public key through the BCRYPT_ECCPUBLIC_BLOB layout', () => {
    const { publicKey } = p256KeyPair()
    const blob = eccBlobFromPublicKey(publicKey)
    expect(blob.length).toBe(8 + 2 * P256_COORDINATE_BYTES)
    expect(blob.readUInt32LE(0)).toBe(BCRYPT_ECDSA_PUBLIC_P256_MAGIC)
    expect(blob.readUInt32LE(4)).toBe(P256_COORDINATE_BYTES)
    const parsed = publicKeyFromEccBlob(blob)
    expect(parsed.export({ format: 'jwk' })).toEqual(publicKey.export({ format: 'jwk' }))
  })

  it('refuses blobs with another magic, coordinate size or length', () => {
    const { publicKey } = p256KeyPair()
    const blob = eccBlobFromPublicKey(publicKey)
    const wrongMagic = Buffer.from(blob)
    wrongMagic.writeUInt32LE(0x31534345 + 1, 0)
    const wrongSize = Buffer.from(blob)
    wrongSize.writeUInt32LE(48, 4)
    expect(publicKeyFromEccBlob(wrongMagic)).toBeNull()
    expect(publicKeyFromEccBlob(wrongSize)).toBeNull()
    expect(publicKeyFromEccBlob(blob.subarray(0, blob.length - 1))).toBeNull()
    expect(publicKeyFromEccBlob(Buffer.concat([blob, Buffer.alloc(1)]))).toBeNull()
    expect(publicKeyFromEccBlob(Buffer.alloc(4))).toBeNull()
    expect(publicKeyFromEccBlob(null)).toBeNull()
    expect(publicKeyFromEccBlob('not a buffer')).toBeNull()
  })

  it('refuses coordinates that are not a point on the curve', () => {
    const { publicKey } = p256KeyPair()
    const blob = eccBlobFromPublicKey(publicKey)
    blob.fill(0, 8)
    expect(publicKeyFromEccBlob(blob)).toBeNull()
  })

  it('returns null for a key that is not P-256', () => {
    const { publicKey } = crypto.generateKeyPairSync('ed25519')
    expect(eccBlobFromPublicKey(publicKey)).toBeNull()
  })
})

describe('a challenge signature in the raw r||s form CNG produces', () => {
  it('verifies against the parsed blob and rejects another challenge or key', () => {
    const { publicKey, privateKey } = p256KeyPair()
    const other = p256KeyPair()
    const parsed = publicKeyFromEccBlob(eccBlobFromPublicKey(publicKey))
    const challenge = crypto.randomBytes(32)
    const signature = signLikeCng(privateKey, challenge)
    expect(signature.length).toBe(64)
    expect(verifyChallengeSignature(parsed, challenge, signature)).toBe(true)
    expect(verifyChallengeSignature(parsed, crypto.randomBytes(32), signature)).toBe(false)
    expect(verifyChallengeSignature(parsed, challenge, signLikeCng(other.privateKey, challenge))).toBe(false)
  })

  it('never throws on a missing key, a malformed signature or the wrong types', () => {
    const { publicKey } = p256KeyPair()
    const challenge = crypto.randomBytes(32)
    expect(verifyChallengeSignature(null, challenge, Buffer.alloc(64))).toBe(false)
    expect(verifyChallengeSignature(publicKey, challenge, Buffer.alloc(10))).toBe(false)
    expect(verifyChallengeSignature(publicKey, challenge, null)).toBe(false)
    expect(verifyChallengeSignature(publicKey, 'challenge', Buffer.alloc(64))).toBe(false)
  })

  it('digests the challenge with sha256, which is what the TPM signs', () => {
    const challenge = crypto.randomBytes(32)
    expect(challengeDigest(challenge)).toEqual(crypto.createHash('sha256').update(challenge).digest())
  })
})
