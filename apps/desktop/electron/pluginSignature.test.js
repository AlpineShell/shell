import { describe, it, expect } from 'vitest'
import crypto from 'crypto'
import {
  verifySignature,
  signBuffer,
  generateKeyPair,
  getMarketplacePublicKey,
  verifyPackage,
} from './pluginSignature.js'

describe('generateKeyPair', () => {
  it('returns an ed25519 spki public key and pkcs8 private key in PEM', () => {
    const { publicKeyPem, privateKeyPem } = generateKeyPair()
    expect(publicKeyPem).toContain('-----BEGIN PUBLIC KEY-----')
    expect(privateKeyPem).toContain('-----BEGIN PRIVATE KEY-----')
    expect(crypto.createPublicKey(publicKeyPem).asymmetricKeyType).toBe('ed25519')
    expect(crypto.createPrivateKey(privateKeyPem).asymmetricKeyType).toBe('ed25519')
  })
})

describe('signBuffer + verifySignature round trip', () => {
  it('verifies a signature produced by the matching private key', () => {
    const { publicKeyPem, privateKeyPem } = generateKeyPair()
    const data = Buffer.from('alpine-plugin-payload', 'utf8')
    const sig = signBuffer(data, privateKeyPem)
    expect(Buffer.isBuffer(sig)).toBe(true)
    expect(sig.length).toBe(64)
    expect(verifySignature(data, sig, publicKeyPem)).toBe(true)
  })

  it('accepts a base64 signature string', () => {
    const { publicKeyPem, privateKeyPem } = generateKeyPair()
    const data = Buffer.from('payload', 'utf8')
    const sigB64 = signBuffer(data, privateKeyPem).toString('base64')
    expect(verifySignature(data, sigB64, publicKeyPem)).toBe(true)
  })

  it('returns false when the data is tampered', () => {
    const { publicKeyPem, privateKeyPem } = generateKeyPair()
    const data = Buffer.from('payload', 'utf8')
    const sig = signBuffer(data, privateKeyPem)
    const tampered = Buffer.from('payloaX', 'utf8')
    expect(verifySignature(tampered, sig, publicKeyPem)).toBe(false)
  })

  it('returns false when verified against a different public key', () => {
    const a = generateKeyPair()
    const b = generateKeyPair()
    const data = Buffer.from('payload', 'utf8')
    const sig = signBuffer(data, a.privateKeyPem)
    expect(verifySignature(data, sig, b.publicKeyPem)).toBe(false)
  })

  it('returns false for a malformed signature length', () => {
    const { publicKeyPem } = generateKeyPair()
    const data = Buffer.from('payload', 'utf8')
    expect(verifySignature(data, Buffer.alloc(10), publicKeyPem)).toBe(false)
  })
})

describe('defensive behavior', () => {
  it('never throws and returns false on garbage inputs', () => {
    expect(verifySignature(null, null, null)).toBe(false)
    expect(verifySignature(Buffer.from('x'), 'not-base64!!', null)).toBe(false)
    expect(verifySignature(Buffer.from('x'), Buffer.alloc(64), 'not-a-key')).toBe(false)
  })

  it('signBuffer throws on non-ed25519 key or non-buffer data', () => {
    const rsa = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
    expect(() => signBuffer(Buffer.from('x'), rsa.privateKey)).toThrow()
    const { privateKeyPem } = generateKeyPair()
    expect(() => signBuffer('not-a-buffer', privateKeyPem)).toThrow()
  })
})

describe('verifyPackage', () => {
  it('rejects an invalid digest shape', () => {
    const r = verifyPackage('not-hex', 'AAAA')
    expect(r.verified).toBe(false)
    expect(r.reason).toBe('invalid-digest')
  })

  it('rejects a missing signature', () => {
    const digestHex = crypto.createHash('sha256').update('x').digest('hex')
    const r = verifyPackage(digestHex, '')
    expect(r.verified).toBe(false)
    expect(r.reason).toBe('no-signature')
  })

  it('is consistent with whether a marketplace key is bundled', () => {
    const digestHex = crypto.createHash('sha256').update('x').digest('hex')
    const sig = 'A'.repeat(88)
    const r = verifyPackage(digestHex, sig)
    if (getMarketplacePublicKey()) {
      expect(r.verified).toBe(false)
      expect(r.reason).toBe('bad-signature')
    } else {
      expect(r.reason).toBe('no-marketplace-key')
    }
  })
})
