import { describe, expect, it } from 'vitest'
import crypto from 'crypto'

const {
  resolveLicenceConfig,
  parsePublicKeys,
  parseGraceUntil,
  parseEnvText,
  normaliseBase,
  DEFAULT_AUTH_BASE,
  DEFAULT_WEBSITE_BASE,
} = await import('./licenceConfig.js')

function spkiPem() {
  return crypto.generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' }).toString()
}

const bakedKey = { kid: 'lic-2026-09', spkiPem: spkiPem() }
const overrideKey = { kid: 'lic-dev', spkiPem: spkiPem() }

describe('a release build', () => {
  const baked = {
    isReleaseBuild: true,
    authBase: 'https://auth.alpineshell.com/',
    websiteBase: 'https://alpineshell.com',
    publicKeys: [bakedKey],
    upgradeGraceUntil: '2026-10-09',
  }

  it('reads only the baked file', () => {
    const env = {
      ALPINE_AUTH_BASE: 'http://localhost:3001',
      ALPINE_WEBSITE_BASE: 'http://localhost:3000',
      ALPINE_LICENCE_PUBLIC_KEYS: JSON.stringify([overrideKey]),
      ALPINE_UPGRADE_GRACE_UNTIL: '2099-01-01',
      ALPINE_ENFORCE_LICENCE: '1',
    }
    const config = resolveLicenceConfig({ baked, env, dotEnv: { ...env } })
    expect(config).toEqual({
      isReleaseBuild: true,
      authBase: 'https://auth.alpineshell.com',
      websiteBase: 'https://alpineshell.com',
      publicKeys: [bakedKey],
      upgradeGraceUntil: new Date('2026-10-09').toISOString(),
      enforceInDevelopment: false,
    })
  })

  it('falls back to the production hosts when the baked bases are unusable', () => {
    const config = resolveLicenceConfig({ baked: { ...baked, authBase: 'nope', websiteBase: '' }, env: {}, dotEnv: {} })
    expect(config.authBase).toBe(DEFAULT_AUTH_BASE)
    expect(config.websiteBase).toBe(DEFAULT_WEBSITE_BASE)
  })

  it('never carries a development enforcement flag', () => {
    expect(resolveLicenceConfig({ baked: { ...baked, enforceInDevelopment: true }, env: {}, dotEnv: {} }).enforceInDevelopment).toBe(false)
  })
})

describe('a development build', () => {
  it('reports development with the defaults when nothing is configured', () => {
    expect(resolveLicenceConfig({ baked: null, env: {}, dotEnv: {} })).toEqual({
      isReleaseBuild: false,
      authBase: DEFAULT_AUTH_BASE,
      websiteBase: DEFAULT_WEBSITE_BASE,
      publicKeys: [],
      upgradeGraceUntil: null,
      enforceInDevelopment: false,
    })
  })

  it('lets the environment override a baked development file', () => {
    const baked = { isReleaseBuild: false, authBase: 'https://auth.alpineshell.com', publicKeys: [bakedKey], upgradeGraceUntil: null }
    const env = { ALPINE_AUTH_BASE: 'http://localhost:3001/', ALPINE_LICENCE_PUBLIC_KEYS: JSON.stringify([overrideKey]), ALPINE_ENFORCE_LICENCE: '1' }
    const config = resolveLicenceConfig({ baked, env, dotEnv: {} })
    expect(config.authBase).toBe('http://localhost:3001')
    expect(config.publicKeys).toEqual([overrideKey])
    expect(config.enforceInDevelopment).toBe(true)
  })

  it('prefers the process environment over .env and .env over the baked file', () => {
    const baked = { isReleaseBuild: false, authBase: 'https://baked.example', publicKeys: [], upgradeGraceUntil: null }
    const dotEnv = { ALPINE_AUTH_BASE: 'https://dotenv.example', ALPINE_WEBSITE_BASE: 'https://dotenv-site.example' }
    const env = { ALPINE_AUTH_BASE: 'https://env.example' }
    const config = resolveLicenceConfig({ baked, env, dotEnv })
    expect(config.authBase).toBe('https://env.example')
    expect(config.websiteBase).toBe('https://dotenv-site.example')
  })

  it('keeps the baked keys when the override is empty or unparseable', () => {
    const baked = { isReleaseBuild: false, publicKeys: [bakedKey] }
    expect(resolveLicenceConfig({ baked, env: { ALPINE_LICENCE_PUBLIC_KEYS: '' }, dotEnv: {} }).publicKeys).toEqual([bakedKey])
    expect(resolveLicenceConfig({ baked, env: { ALPINE_LICENCE_PUBLIC_KEYS: '{not json' }, dotEnv: {} }).publicKeys).toEqual([bakedKey])
  })

  it('only enforces on the exact value 1', () => {
    expect(resolveLicenceConfig({ baked: null, env: { ALPINE_ENFORCE_LICENCE: 'true' }, dotEnv: {} }).enforceInDevelopment).toBe(false)
    expect(resolveLicenceConfig({ baked: null, env: {}, dotEnv: { ALPINE_ENFORCE_LICENCE: '1' } }).enforceInDevelopment).toBe(true)
  })
})

describe('parsePublicKeys', () => {
  it('accepts a JSON string or an array and drops malformed entries', () => {
    const keys = [bakedKey, { kid: '', spkiPem: bakedKey.spkiPem }, { kid: 'x' }, { kid: 'y', spkiPem: 'not a key' }, null]
    expect(parsePublicKeys(JSON.stringify(keys))).toEqual([bakedKey])
    expect(parsePublicKeys(keys)).toEqual([bakedKey])
  })

  it('unescapes newlines written as backslash n', () => {
    const escaped = [{ kid: 'k', spkiPem: bakedKey.spkiPem.replace(/\n/g, '\\n') }]
    expect(parsePublicKeys(escaped)[0].spkiPem).toBe(bakedKey.spkiPem)
  })

  it('returns an empty list for anything else', () => {
    expect(parsePublicKeys(undefined)).toEqual([])
    expect(parsePublicKeys('{}')).toEqual([])
    expect(parsePublicKeys(42)).toEqual([])
  })
})

describe('parseGraceUntil', () => {
  it('normalises a date to ISO and rejects junk', () => {
    expect(parseGraceUntil('2026-10-09T00:00:00Z')).toBe('2026-10-09T00:00:00.000Z')
    expect(parseGraceUntil(' 2026-10-09 ')).toBe(new Date('2026-10-09').toISOString())
    expect(parseGraceUntil('someday')).toBeNull()
    expect(parseGraceUntil('')).toBeNull()
    expect(parseGraceUntil(null)).toBeNull()
  })
})

describe('env helpers', () => {
  it('parses a .env file with comments and quotes', () => {
    const parsed = parseEnvText('# comment\nALPINE_AUTH_BASE="http://localhost:3001"\nEMPTY=\nBAD LINE\nQUOTED=\'x=y\'\n')
    expect(parsed).toEqual({ ALPINE_AUTH_BASE: 'http://localhost:3001', EMPTY: '', QUOTED: 'x=y' })
  })

  it('normalises a base url and falls back for anything that is not one', () => {
    expect(normaliseBase('https://auth.alpineshell.com///', 'x')).toBe('https://auth.alpineshell.com')
    expect(normaliseBase('ftp://auth', 'fallback')).toBe('fallback')
    expect(normaliseBase(undefined, 'fallback')).toBe('fallback')
  })
})
