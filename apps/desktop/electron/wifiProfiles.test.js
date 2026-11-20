import { describe, expect, it } from 'vitest'
import {
  buildEnterpriseCredentialsXml,
  buildEnterpriseProfileXml,
  buildProfileXml,
  enterpriseAuthenticationFor,
  isValidPassphrase,
} from './wifiProfiles.js'

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

describe('enterpriseAuthenticationFor', () => {
  it.each([
    [3, 'WPA'],
    [6, 'WPA2'],
    [11, 'WPA3ENT'],
    [8, null],
    [7, null],
  ])('maps auth algorithm %i to %s', (authAlgorithm, expected) => {
    expect(enterpriseAuthenticationFor(authAlgorithm)).toBe(expected)
  })
})

describe('buildEnterpriseProfileXml', () => {
  it.each([
    [3, 2, '<authentication>WPA</authentication><encryption>TKIP</encryption><useOneX>true</useOneX>'],
    [6, 4, '<authentication>WPA2</authentication><encryption>AES</encryption><useOneX>true</useOneX>'],
    [11, 4, '<authentication>WPA3ENT</authentication><encryption>AES</encryption><useOneX>true</useOneX>'],
  ])('builds a PEAP-MSCHAPv2 profile for auth %i and cipher %i', (authAlgorithm, cipherAlgorithm, expected) => {
    const xml = buildEnterpriseProfileXml({ ssid: 'BBW_BMSW', authAlgorithm, cipherAlgorithm, validateServer: true })

    expect(xml).toContain(expected)
    expect(xml).toContain('<cacheUserData>true</cacheUserData>')
    expect(xml).toContain('<authMode>user</authMode>')
    expect(xml).toContain('<DisableUserPromptForServerValidation>true</DisableUserPromptForServerValidation>')
    expect(xml).toContain('<PerformServerValidation xmlns="http://www.microsoft.com/provisioning/MsPeapConnectionPropertiesV2">true</PerformServerValidation>')
    expect(xml).toContain('<UseWinLogonCredentials>false</UseWinLogonCredentials>')
    expect(xml).not.toContain('<sharedKey>')
  })

  it('disables server validation when trusting the server explicitly', () => {
    const xml = buildEnterpriseProfileXml({ ssid: 'BBW_BMSW', authAlgorithm: 6, cipherAlgorithm: 4, validateServer: false })

    expect(xml).toContain('<DisableUserPromptForServerValidation>true</DisableUserPromptForServerValidation>')
    expect(xml).toContain('<PerformServerValidation xmlns="http://www.microsoft.com/provisioning/MsPeapConnectionPropertiesV2">false</PerformServerValidation>')
  })

  it('rejects unsupported enterprise auth algorithms', () => {
    expect(() => buildEnterpriseProfileXml({ ssid: 'Gov', authAlgorithm: 8, cipherAlgorithm: 4, validateServer: true })).toThrow('Unsupported Wi-Fi security')
  })
})

describe('buildEnterpriseCredentialsXml', () => {
  it('writes a plain username with an empty logon domain', () => {
    const xml = buildEnterpriseCredentialsXml({ username: 'student@bbw.ch', password: 'secret&<1>' })

    expect(xml).toContain('<MsPeap:RoutingIdentity>student@bbw.ch</MsPeap:RoutingIdentity>')
    expect(xml).toContain('<MsChapV2:Username>student@bbw.ch</MsChapV2:Username>')
    expect(xml).toContain('<MsChapV2:Password>secret&amp;&lt;1&gt;</MsChapV2:Password>')
    expect(xml).toContain('<MsChapV2:LogonDomain></MsChapV2:LogonDomain>')
  })

  it('splits a domain-qualified username into logon domain and user', () => {
    const xml = buildEnterpriseCredentialsXml({ username: 'CORP\\alice', password: 'pw' })

    expect(xml).toContain('<MsPeap:RoutingIdentity>CORP\\alice</MsPeap:RoutingIdentity>')
    expect(xml).toContain('<MsChapV2:Username>alice</MsChapV2:Username>')
    expect(xml).toContain('<MsChapV2:LogonDomain>CORP</MsChapV2:LogonDomain>')
  })
})
