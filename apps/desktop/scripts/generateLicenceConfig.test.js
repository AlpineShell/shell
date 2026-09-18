import { describe, expect, it } from 'vitest'
import crypto from 'crypto'

const { buildLicenceConfig, renderModule, mergeSettings } = await import('./generateLicenceConfig.js')

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
      ALPINE_UPGRADE_GRACE_UNTIL: '2026-10-09',
    })
    expect(config).toEqual({
      isReleaseBuild: true,
      authBase: 'https://auth.alpineshell.com',
      websiteBase: 'https://alpineshell.com',
      publicKeys: [key],
      upgradeGraceUntil: new Date('2026-10-09').toISOString(),
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
      upgradeGraceUntil: null,
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
})
