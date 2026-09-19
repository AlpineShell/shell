import { describe, expect, it } from 'vitest'
import crypto from 'crypto'

const { buildLicenceConfig, normaliseMarketplacePublicKey, renderModule, renderMarketplaceKeyModule, mergeSettings } = await import('./generateLicenceConfig.js')

function spkiPem() {
  return crypto.generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' }).toString()
}

const key = { kid: 'lic-2026-09', spkiPem: spkiPem() }

describe('buildLicenceConfig', () => {
  it('bakes a release config from the workflow variables', () => {
    const config = buildLicenceConfig({
      ALPINE_RELEASE_BUILD: '1',
      ALPINE_LICENCE_PUBLIC_KEYS: JSON.stringify([key]),
      ALPINE_AUTH_BASE: 'https://auth.alpineshell.com/',
      ALPINE_WEBSITE_BASE: '',
    })
    expect(config).toEqual({
      isReleaseBuild: true,
      authBase: 'https://auth.alpineshell.com',
      websiteBase: 'https://alpineshell.com',
      publicKeys: [key],
    })
  })

  it('refuses a release build without keys', () => {
    expect(() => buildLicenceConfig({ ALPINE_RELEASE_BUILD: '1', ALPINE_LICENCE_PUBLIC_KEYS: '' })).toThrow(/at least one key/)
    expect(() => buildLicenceConfig({ ALPINE_RELEASE_BUILD: '1', ALPINE_LICENCE_PUBLIC_KEYS: '[]' })).toThrow(/at least one key/)
  })

  it('refuses a key that is not Ed25519', () => {
    const rsa = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ type: 'spki', format: 'pem' }).toString()
    expect(() => buildLicenceConfig({ ALPINE_RELEASE_BUILD: '1', ALPINE_LICENCE_PUBLIC_KEYS: JSON.stringify([{ kid: 'rsa', spkiPem: rsa }]) })).toThrow(/not Ed25519/)
  })

  it('bakes a development config with no keys at all', () => {
    expect(buildLicenceConfig({})).toEqual({
      isReleaseBuild: false,
      authBase: 'https://auth.alpineshell.com',
      websiteBase: 'https://alpineshell.com',
      publicKeys: [],
    })
  })

  it('accepts keys whose newlines were escaped for a one-line secret', () => {
    const escaped = JSON.stringify([{ kid: key.kid, spkiPem: key.spkiPem }]).replace(/\\n/g, '\\\\n')
    expect(buildLicenceConfig({ ALPINE_LICENCE_PUBLIC_KEYS: escaped }).publicKeys).toEqual([key])
  })
})

describe('renderModule', () => {
  it('writes a CommonJS module that evaluates back to the config', () => {
    const config = buildLicenceConfig({ ALPINE_RELEASE_BUILD: '1', ALPINE_LICENCE_PUBLIC_KEYS: JSON.stringify([key]) })
    const source = renderModule(config)
    expect(source.startsWith('module.exports = {')).toBe(true)
    const module = { exports: {} }
    new Function('module', source)(module)
    expect(module.exports).toEqual(config)
  })
})

describe('mergeSettings', () => {
  it('prefers the process environment over .env', () => {
    const merged = mergeSettings({ ALPINE_AUTH_BASE: 'https://env.example' }, { ALPINE_AUTH_BASE: 'https://dotenv.example', ALPINE_RELEASE_BUILD: '1' })
    expect(merged.ALPINE_AUTH_BASE).toBe('https://env.example')
    expect(merged.ALPINE_RELEASE_BUILD).toBe('1')
    expect(merged.ALPINE_WEBSITE_BASE).toBe('')
  })

  it('carries the marketplace public key', () => {
    expect(mergeSettings({}, { ALPINE_MARKETPLACE_PUBKEY: key.spkiPem }).ALPINE_MARKETPLACE_PUBKEY).toBe(key.spkiPem)
    expect(mergeSettings({}, {}).ALPINE_MARKETPLACE_PUBKEY).toBe('')
  })
})

describe('normaliseMarketplacePublicKey', () => {
  it('accepts a PEM, an escaped one-line PEM and a base64 PEM', () => {
    expect(normaliseMarketplacePublicKey(key.spkiPem)).toBe(key.spkiPem)
    expect(normaliseMarketplacePublicKey(key.spkiPem.replace(/\n/g, '\\n'))).toBe(key.spkiPem)
    expect(normaliseMarketplacePublicKey(Buffer.from(key.spkiPem).toString('base64'))).toBe(key.spkiPem)
  })

  it('returns null when unset and refuses anything that is not an Ed25519 key', () => {
    expect(normaliseMarketplacePublicKey('')).toBeNull()
    expect(normaliseMarketplacePublicKey(undefined)).toBeNull()
    const rsa = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ type: 'spki', format: 'pem' }).toString()
    expect(() => normaliseMarketplacePublicKey(rsa)).toThrow(/not an Ed25519/)
    expect(() => normaliseMarketplacePublicKey('garbage')).toThrow(/not an Ed25519/)
  })
})

describe('renderMarketplaceKeyModule', () => {
  it('writes a CommonJS module the signature check can require', () => {
    for (const pem of [key.spkiPem, null]) {
      const module = { exports: {} }
      new Function('module', renderMarketplaceKeyModule(pem))(module)
      expect(module.exports).toEqual({ publicKeyPem: pem })
    }
  })
})
