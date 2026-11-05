import { describe, expect, it } from 'vitest'
import {
  connectionKey,
  initialWifiState,
  jsonChanged,
  networkStatusFor,
  networksAfterRead,
  normalizeRadioState,
  parseRadioScriptResult,
  radioOffForEthernet,
  settleRadioTarget,
} from './wifiSession.js'

const WIFI = { connected: true, ssid: 'Cafe', signal: 72 }
const NETWORKS = [{
  ssid: 'Cafe',
  signal: 72,
  security: 'open',
  secured: false,
  saved: false,
  connected: true,
  connectable: true,
}]

describe('initialWifiState', () => {
  it('creates the unknown empty state', () => {
    expect(initialWifiState()).toEqual({
      radio: 'unknown',
      networks: [],
      scanning: false,
      operation: null,
      lastError: null,
      ethernet: false,
      offForEthernet: false,
      blockedByEthernet: false,
    })
  })
})

describe('radioOffForEthernet', () => {
  const SWITCHED_OFF = { previous: false, wiredConnected: true, previousRadio: 'on', radio: 'off', requestedRadio: 'on' }

  it('is false without a wired connection', () => {
    expect(radioOffForEthernet({ ...SWITCHED_OFF, wiredConnected: false, previous: true })).toBe(false)
  })

  it('is false while the radio is on', () => {
    expect(radioOffForEthernet({ ...SWITCHED_OFF, radio: 'on', previous: true })).toBe(false)
  })

  it('is true when the system switches the radio off while Ethernet is connected', () => {
    expect(radioOffForEthernet(SWITCHED_OFF)).toBe(true)
    expect(radioOffForEthernet({ ...SWITCHED_OFF, requestedRadio: null })).toBe(true)
  })

  it('keeps the previous value otherwise', () => {
    expect(radioOffForEthernet({ ...SWITCHED_OFF, previousRadio: 'unknown', previous: true })).toBe(true)
    expect(radioOffForEthernet({ ...SWITCHED_OFF, previousRadio: 'unknown', previous: false })).toBe(false)
  })

  it('stays true while Ethernet stays connected and the radio stays off', () => {
    const first = radioOffForEthernet(SWITCHED_OFF)
    expect(radioOffForEthernet({ ...SWITCHED_OFF, previous: first, previousRadio: 'off' })).toBe(true)
  })

  it('clears when Ethernet disconnects', () => {
    expect(radioOffForEthernet({ ...SWITCHED_OFF, previous: true, previousRadio: 'off', wiredConnected: false })).toBe(false)
  })

  it('clears when the radio comes back on', () => {
    expect(radioOffForEthernet({ ...SWITCHED_OFF, previous: true, previousRadio: 'off', radio: 'on' })).toBe(false)
  })

  it('does not count an off the user asked for', () => {
    expect(radioOffForEthernet({ ...SWITCHED_OFF, requestedRadio: 'off' })).toBe(false)
  })
})

describe('networkStatusFor', () => {
  it('keeps Wi-Fi details when Ethernet is primary', () => {
    expect(networkStatusFor(true, WIFI)).toEqual({
      signal: null,
      connected: true,
      type: 'ethernet',
      ssid: null,
      wifi: WIFI,
    })
  })

  it('mirrors the Wi-Fi link when Ethernet is down', () => {
    expect(networkStatusFor(false, WIFI)).toEqual({
      signal: 72,
      connected: true,
      type: 'wifi',
      ssid: 'Cafe',
      wifi: WIFI,
    })
    expect(networkStatusFor(false, null).wifi).toEqual({ connected: false, ssid: null, signal: null })
  })
})

describe('networksAfterRead', () => {
  it('keeps the current list for one null read while Wi-Fi is on', () => {
    const first = networksAfterRead({
      rawNetworks: null,
      radio: 'on',
      previousNetworks: NETWORKS,
      previousNullWhileOn: false,
    })
    expect(first).toEqual({ networks: NETWORKS, previousNullWhileOn: true })
    expect(networksAfterRead({
      rawNetworks: null,
      radio: 'on',
      previousNetworks: first.networks,
      previousNullWhileOn: first.previousNullWhileOn,
    })).toEqual({ networks: [], previousNullWhileOn: false })
  })

  it('empties the list for a null read when the radio is not on', () => {
    expect(networksAfterRead({
      rawNetworks: null,
      radio: 'off',
      previousNetworks: NETWORKS,
      previousNullWhileOn: true,
    })).toEqual({ networks: [], previousNullWhileOn: false })
  })

  it('converts a successful raw read and resets the transient-null marker', () => {
    const rawNetworks = [{
      profileName: '',
      ssid: 'Cafe',
      signal: 72,
      connectable: true,
      securityEnabled: false,
      authAlgorithm: 1,
      cipherAlgorithm: 0,
      connected: true,
      hasProfile: false,
    }]
    expect(networksAfterRead({
      rawNetworks,
      radio: 'on',
      previousNetworks: [],
      previousNullWhileOn: true,
    })).toEqual({ networks: NETWORKS, previousNullWhileOn: false })
  })
})

describe('radio and change helpers', () => {
  it('normalizes radio values', () => {
    expect(normalizeRadioState('off')).toBe('off')
    expect(normalizeRadioState('broken')).toBe('unknown')
  })

  it('parses the radio script output safely', () => {
    expect(parseRadioScriptResult('{"success":true,"state":"on"}')).toEqual({ success: true, state: 'on' })
    expect(parseRadioScriptResult('invalid')).toEqual({ success: false, state: 'unknown' })
  })

  it('compares JSON values and includes Wi-Fi SSID in the connection key', () => {
    expect(jsonChanged({ value: 1 }, { value: 1 })).toBe(false)
    expect(jsonChanged({ value: 1 }, { value: 2 })).toBe(true)
    expect(connectionKey(networkStatusFor(true, WIFI))).toContain(':Cafe')
  })
})

describe('settleRadioTarget', () => {
  it('shows what Windows reports when nobody asked for a change', () => {
    expect(settleRadioTarget({ target: null, deadline: 0, observed: 'off', now: 100 })).toEqual({ shown: 'off', target: null })
  })

  it('keeps showing the requested state while Windows still reports the old one', () => {
    expect(settleRadioTarget({ target: 'on', deadline: 8000, observed: 'off', now: 1500 })).toEqual({ shown: 'on', target: 'on' })
  })

  it('lets go of the request once Windows reports the requested state', () => {
    expect(settleRadioTarget({ target: 'on', deadline: 8000, observed: 'on', now: 1500 })).toEqual({ shown: 'on', target: null })
  })

  it('falls back to what Windows reports once the deadline passes', () => {
    expect(settleRadioTarget({ target: 'on', deadline: 8000, observed: 'off', now: 8000 })).toEqual({ shown: 'off', target: null })
  })
})
