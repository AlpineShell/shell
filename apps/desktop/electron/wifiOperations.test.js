import { describe, expect, it } from 'vitest'
import {
  CONNECT_DEADLINE_MS,
  CONNECT_POLL_MS,
  DISCONNECT_SETTLE_MS,
  ERROR_VISIBLE_MS,
  IDLE_FAILURE_MS,
  classifyAttempt,
  connectPlan,
  isSecured,
  isSupportedSecurity,
  networkEntryFor,
  securityOf,
  toWifiNetworks,
} from './wifiOperations.js'

function rawEntry(overrides = {}) {
  return {
    profileName: '',
    ssid: 'Home',
    signal: 50,
    connectable: true,
    securityEnabled: true,
    authAlgorithm: 7,
    cipherAlgorithm: 4,
    connected: false,
    hasProfile: false,
    ...overrides,
  }
}

function network(overrides = {}) {
  return {
    ssid: 'Home',
    signal: 50,
    security: 'wpa2-personal',
    secured: true,
    saved: false,
    connected: false,
    connectable: true,
    ...overrides,
  }
}

describe('securityOf', () => {
  it.each([
    [1, 0, true, 'open'],
    [1, 4, false, 'open'],
    [1, 1, true, 'wep'],
    [1, 5, true, 'wep'],
    [1, 0x101, true, 'wep'],
    [1, 4, true, 'open'],
    [2, 4, true, 'wep'],
    [3, 4, true, 'enterprise'],
    [6, 4, true, 'enterprise'],
    [8, 4, true, 'enterprise'],
    [11, 4, true, 'enterprise'],
    [4, 4, true, 'wpa-personal'],
    [7, 4, true, 'wpa2-personal'],
    [9, 4, true, 'wpa3-personal'],
    [10, 4, true, 'owe'],
    [0, 4, true, 'unknown'],
    [12, 4, true, 'unknown'],
  ])('maps auth %i and cipher %i with security %s to %s', (auth, cipher, enabled, expected) => {
    expect(securityOf(auth, cipher, enabled)).toBe(expected)
  })
})

describe('security predicates', () => {
  it.each([
    ['open', false],
    ['owe', false],
    ['wep', true],
    ['wpa-personal', true],
    ['wpa2-personal', true],
    ['wpa3-personal', true],
    ['enterprise', true],
    ['unknown', true],
  ])('reports whether %s is secured', (security, expected) => {
    expect(isSecured(security)).toBe(expected)
  })

  it.each([
    ['open', true],
    ['owe', true],
    ['wep', false],
    ['wpa-personal', true],
    ['wpa2-personal', true],
    ['wpa3-personal', true],
    ['enterprise', false],
    ['unknown', false],
  ])('reports whether %s is supported', (security, expected) => {
    expect(isSupportedSecurity(security)).toBe(expected)
  })
})

describe('toWifiNetworks', () => {
  it('merges duplicate SSIDs, drops hidden names, and combines their properties', () => {
    const networks = toWifiNetworks([
      rawEntry({ profileName: 'Saved Home', hasProfile: true, signal: 30, connected: false, authAlgorithm: 7 }),
      rawEntry({ profileName: '', hasProfile: false, signal: 82, connected: true, connectable: false, authAlgorithm: 9 }),
      rawEntry({ ssid: '', signal: 100 }),
    ])

    expect(networks).toEqual([{
      ssid: 'Home',
      signal: 82,
      security: 'wpa3-personal',
      secured: true,
      saved: true,
      connected: true,
      connectable: true,
    }])
  })

  it('chooses profile security when no entry is connected, then strongest security otherwise', () => {
    expect(toWifiNetworks([
      rawEntry({ signal: 90, authAlgorithm: 9 }),
      rawEntry({ signal: 25, hasProfile: true, authAlgorithm: 7 }),
    ])[0].security).toBe('wpa2-personal')

    expect(toWifiNetworks([
      rawEntry({ signal: 25, hasProfile: true, authAlgorithm: 7 }),
      rawEntry({ signal: 90, connected: true, authAlgorithm: 9 }),
    ])[0].security).toBe('wpa3-personal')

    expect(toWifiNetworks([
      rawEntry({ signal: 25, authAlgorithm: 7 }),
      rawEntry({ signal: 90, authAlgorithm: 9 }),
    ])[0].security).toBe('wpa3-personal')
  })

  it('sorts connected, saved, signal, and then SSID in that order', () => {
    const networks = toWifiNetworks([
      rawEntry({ ssid: 'Signal', signal: 90 }),
      rawEntry({ ssid: 'Saved B', signal: 1, hasProfile: true }),
      rawEntry({ ssid: 'Saved A', signal: 1, hasProfile: true }),
      rawEntry({ ssid: 'Connected', signal: 1, connected: true }),
      rawEntry({ ssid: 'Signal B', signal: 90 }),
    ])

    expect(networks.map(({ ssid }) => ssid)).toEqual(['Connected', 'Saved A', 'Saved B', 'Signal', 'Signal B'])
  })
})

describe('networkEntryFor', () => {
  it('chooses the connected profile entry and returns its security and cipher', () => {
    const entries = [
      rawEntry({ profileName: 'Saved Home', hasProfile: true, signal: 80, authAlgorithm: 7, cipherAlgorithm: 4 }),
      rawEntry({ profileName: 'Connected Home', hasProfile: true, connected: true, signal: 35, authAlgorithm: 9, cipherAlgorithm: 8 }),
    ]

    expect(networkEntryFor(entries, 'Home')).toEqual({
      profileName: 'Connected Home',
      cipherAlgorithm: 8,
      security: 'wpa3-personal',
    })
    expect(networkEntryFor(entries, 'Missing')).toBeNull()
  })

  it('uses a profile entry when none is connected and otherwise uses the strongest entry', () => {
    expect(networkEntryFor([
      rawEntry({ profileName: 'Saved Home', hasProfile: true, signal: 30 }),
      rawEntry({ signal: 90, authAlgorithm: 9, cipherAlgorithm: 8 }),
    ], 'Home')).toEqual({ profileName: 'Saved Home', cipherAlgorithm: 4, security: 'wpa2-personal' })

    expect(networkEntryFor([
      rawEntry({ signal: 30 }),
      rawEntry({ signal: 90, authAlgorithm: 9, cipherAlgorithm: 8 }),
    ], 'Home')).toEqual({ profileName: null, cipherAlgorithm: 8, security: 'wpa3-personal' })
  })
})

describe('connectPlan', () => {
  it('creates an open profile without a password', () => {
    const plan = connectPlan({ network: network({ security: 'open', secured: false }), profileName: null, cipherAlgorithm: 0 })

    expect(plan.action).toBe('create-profile')
    expect(plan.withPassword).toBe(false)
    expect(plan.xml).toContain('<authentication>open</authentication><encryption>none</encryption>')
    expect(plan.xml).not.toContain('<sharedKey>')
  })

  it('asks for a password for an unsaved secured network', () => {
    expect(connectPlan({ network: network(), profileName: null, cipherAlgorithm: 4 })).toEqual({ action: 'needs-password' })
  })

  it('uses a saved profile when no password is given', () => {
    expect(connectPlan({ network: network({ saved: true }), profileName: 'Saved Home', cipherAlgorithm: 4 })).toEqual({
      action: 'use-profile',
      profileName: 'Saved Home',
    })
  })

  it('creates a password profile for a saved network when a password is given', () => {
    const plan = connectPlan({ network: network({ saved: true }), profileName: 'Saved Home', cipherAlgorithm: 4, password: 'password123' })

    expect(plan.action).toBe('create-profile')
    expect(plan.withPassword).toBe(true)
    expect(plan.xml).toContain('<keyMaterial>password123</keyMaterial>')
  })

  it('rejects invalid secured-network passwords before checking support', () => {
    expect(connectPlan({ network: network(), profileName: null, cipherAlgorithm: 4, password: 'short' })).toEqual({
      action: 'reject',
      error: 'invalid-password',
    })
  })

  it.each(['enterprise', 'wep', 'unknown'])('rejects unsaved %s networks as unsupported', (security) => {
    expect(connectPlan({ network: network({ security, secured: true }), profileName: null, cipherAlgorithm: 4 })).toEqual({
      action: 'reject',
      error: 'unsupported-security',
    })
  })

  it('rejects a valid password for an unsupported secured network', () => {
    expect(connectPlan({ network: network({ security: 'enterprise' }), profileName: null, cipherAlgorithm: 4, password: 'password123' })).toEqual({
      action: 'reject',
      error: 'unsupported-security',
    })
  })
})

describe('classifyAttempt', () => {
  const targetConnected = [{ state: 'connected', ssid: 'Home', atMs: 250 }]

  it('recognises a connection to the target even at the deadline', () => {
    expect(classifyAttempt({ targetSsid: 'Home', samples: targetConnected, elapsedMs: CONNECT_DEADLINE_MS, withPassword: true, secured: true })).toBe('connected')
  })

  it('keeps a connection to a different SSID pending before the deadline', () => {
    expect(classifyAttempt({ targetSsid: 'Home', samples: [{ state: 'connected', ssid: 'Other', atMs: 100 }], elapsedMs: 100, withPassword: false, secured: true })).toBe('pending')
  })

  it('times out at the connect deadline', () => {
    expect(classifyAttempt({ targetSsid: 'Home', samples: [], elapsedMs: CONNECT_DEADLINE_MS, withPassword: true, secured: true })).toBe('timed-out')
  })

  it('fails when association is followed by disconnection', () => {
    expect(classifyAttempt({
      targetSsid: 'Home',
      samples: [{ state: 'associating', ssid: null, atMs: 100 }, { state: 'disconnected', ssid: null, atMs: 200 }],
      elapsedMs: 200 + DISCONNECT_SETTLE_MS,
      withPassword: true,
      secured: true,
    })).toBe('failed')
  })

  it('reports a wrong password after authentication fails on a secured network', () => {
    expect(classifyAttempt({
      targetSsid: 'Home',
      samples: [{ state: 'authenticating', ssid: null, atMs: 100 }, { state: 'disconnected', ssid: null, atMs: 200 }],
      elapsedMs: 200 + DISCONNECT_SETTLE_MS,
      withPassword: true,
      secured: true,
    })).toBe('wrong-password')
  })

  it('reports a regular failure after authentication fails on an open network', () => {
    expect(classifyAttempt({
      targetSsid: 'Cafe',
      samples: [{ state: 'authenticating', ssid: null, atMs: 100 }, { state: 'disconnected', ssid: null, atMs: 200 }],
      elapsedMs: 200 + DISCONNECT_SETTLE_MS,
      withPassword: false,
      secured: false,
    })).toBe('failed')
  })

  it('keeps waiting through a short disconnect between association attempts', () => {
    expect(classifyAttempt({
      targetSsid: 'Home',
      samples: [
        { state: 'associating', ssid: null, atMs: 100 },
        { state: 'disconnected', ssid: null, atMs: 350 },
        { state: 'disconnected', ssid: null, atMs: 600 },
      ],
      elapsedMs: 600,
      withPassword: true,
      secured: true,
    })).toBe('pending')
  })

  it('measures a settled disconnect from the first sample of the trailing disconnected run', () => {
    expect(classifyAttempt({
      targetSsid: 'Home',
      samples: [
        { state: 'disconnected', ssid: null, atMs: 50 },
        { state: 'authenticating', ssid: null, atMs: 300 },
        { state: 'disconnected', ssid: null, atMs: 550 },
        { state: 'disconnected', ssid: null, atMs: 800 },
      ],
      elapsedMs: 550 + DISCONNECT_SETTLE_MS,
      withPassword: true,
      secured: true,
    })).toBe('wrong-password')
  })

  it('reports a wrong password when Windows falls back to another network after authenticating', () => {
    expect(classifyAttempt({
      targetSsid: 'Home',
      samples: [
        { state: 'authenticating', ssid: null, atMs: 100 },
        { state: 'connected', ssid: 'Other', atMs: 350 },
      ],
      elapsedMs: 350,
      withPassword: true,
      secured: true,
    })).toBe('wrong-password')
  })

  it('stays pending while still connected to the previous network before any attempt began', () => {
    expect(classifyAttempt({
      targetSsid: 'Home',
      samples: [
        { state: 'connected', ssid: 'Other', atMs: 0 },
        { state: 'disconnecting', ssid: null, atMs: 250 },
        { state: 'connected', ssid: 'Other', atMs: 500 },
      ],
      elapsedMs: 500,
      withPassword: true,
      secured: true,
    })).toBe('pending')
  })

  it('waits while only disconnected samples are observed before the idle failure threshold', () => {
    expect(classifyAttempt({
      targetSsid: 'Home',
      samples: [{ state: 'disconnected', ssid: null, atMs: 100 }],
      elapsedMs: IDLE_FAILURE_MS,
      withPassword: false,
      secured: true,
    })).toBe('pending')
  })

  it('fails when only disconnected samples persist beyond the idle threshold', () => {
    expect(classifyAttempt({
      targetSsid: 'Home',
      samples: [{ state: 'disconnected', ssid: null, atMs: 100 }],
      elapsedMs: IDLE_FAILURE_MS + 1,
      withPassword: false,
      secured: true,
    })).toBe('failed')
  })

  it('exports the specified polling and error timing constants', () => {
    expect(CONNECT_DEADLINE_MS).toBe(25000)
    expect(IDLE_FAILURE_MS).toBe(6000)
    expect(CONNECT_POLL_MS).toBe(250)
    expect(ERROR_VISIBLE_MS).toBe(8000)
  })
})
