import { describe, expect, it } from 'vitest'
import { buildProfileXml, isValidPassphrase } from './wifiProfiles.js'

describe('buildProfileXml', () => {
  it.each([
    ['open', undefined, '<authentication>open</authentication><encryption>none</encryption>'],
    ['owe', undefined, '<authentication>OWE</authentication><encryption>AES</encryption>'],
    ['wpa-personal', 2, '<authentication>WPAPSK</authentication><encryption>TKIP</encryption>'],
    ['wpa2-personal', 4, '<authentication>WPA2PSK</authentication><encryption>AES</encryption>'],
    ['wpa3-personal', 4, '<authentication>WPA3SAE</authentication><encryption>AES</encryption>'],
  ])('builds a %s profile with the expected authentication', (security, cipherAlgorithm, expected) => {
    const xml = buildProfileXml({ ssid: 'Home', security, cipherAlgorithm, password: 'password123' })

    expect(xml).toContain(expected)
    expect(xml).toContain('<name>Home</name>')
    expect(xml).toContain('<SSIDConfig><SSID><hex>486F6D65</hex><name>Home</name></SSID></SSIDConfig>')
    expect(xml).toContain('<connectionType>ESS</connectionType>')
    expect(xml).toContain('<connectionMode>auto</connectionMode>')
    expect(xml).toContain('<useOneX>false</useOneX>')
    if (security === 'open' || security === 'owe') expect(xml).not.toContain('<sharedKey>')
  })

  it('writes a 64-character hexadecimal key as a network key', () => {
    const password = 'a'.repeat(64)
    const xml = buildProfileXml({ ssid: 'Home', security: 'wpa2-personal', cipherAlgorithm: 4, password })

    expect(xml).toContain('<keyType>networkKey</keyType>')
    expect(xml).toContain(`<keyMaterial>${password}</keyMaterial>`)
  })

  it('escapes XML text and hex-encodes the UTF-8 SSID', () => {
    const ssid = `B&B <Guest> "' Café`
    const password = `p&ss <wo>rd "' café`
    const xml = buildProfileXml({ ssid, security: 'wpa2-personal', cipherAlgorithm: 4, password })

    expect(xml).toContain('<name>B&amp;B &lt;Guest&gt; &quot;&apos; Café</name>')
    expect(xml).toContain('<hex>422642203C47756573743E20222720436166C3A9</hex>')
    expect(xml).toContain('<keyMaterial>p&amp;ss &lt;wo&gt;rd &quot;&apos; café</keyMaterial>')
    expect(xml).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;)/)
  })
})

describe('isValidPassphrase', () => {
  it('accepts passphrases at the 8 and 63 character boundaries', () => {
    expect(isValidPassphrase('p'.repeat(8))).toBe(true)
    expect(isValidPassphrase('p'.repeat(63))).toBe(true)
  })

  it('rejects short, long, and non-hex 64-character passwords', () => {
    expect(isValidPassphrase('p'.repeat(7))).toBe(false)
    expect(isValidPassphrase('g'.repeat(64))).toBe(false)
    expect(isValidPassphrase('p'.repeat(65))).toBe(false)
  })

  it('accepts exactly 64 hexadecimal characters', () => {
    expect(isValidPassphrase('0123456789abcdef'.repeat(4))).toBe(true)
    expect(isValidPassphrase('ABCDEF0123456789'.repeat(4))).toBe(true)
  })

  it('rejects non-string values', () => {
    expect(isValidPassphrase(undefined)).toBe(false)
    expect(isValidPassphrase(12345678)).toBe(false)
  })
})
