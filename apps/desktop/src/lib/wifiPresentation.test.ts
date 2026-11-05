import { describe, expect, it } from 'vitest'
import { networkStatusLabel, wifiOffLabel } from './wifiPresentation'

const network: WifiNetwork = {
  ssid: 'Home',
  signal: 80,
  security: 'wpa2-personal',
  secured: true,
  saved: false,
  connected: false,
  connectable: true,
}

const state: WifiState = {
  radio: 'on',
  networks: [network],
  scanning: false,
  operation: null,
  lastError: null,
  ethernet: false,
  offForEthernet: false,
  blockedByEthernet: false,
}

describe('networkStatusLabel', () => {
  it('labels a connecting network', () => {
    expect(networkStatusLabel(network, { ...state, operation: { kind: 'connect', ssid: 'Home' } })).toBe('Connecting…')
  })

  it('labels a disconnecting network', () => {
    expect(networkStatusLabel(network, { ...state, operation: { kind: 'disconnect', ssid: 'Home' } })).toBe('Disconnecting…')
  })

  it('labels a connected network', () => {
    expect(networkStatusLabel({ ...network, connected: true }, state)).toBe('Connected')
  })

  it('labels a wrong password', () => {
    expect(networkStatusLabel(network, { ...state, lastError: { ssid: 'Home', error: 'wrong-password' } })).toBe('Wrong password')
  })

  it('labels other connection errors', () => {
    expect(networkStatusLabel(network, { ...state, lastError: { ssid: 'Home', error: 'failed' } })).toBe("Couldn't connect")
  })

  it('labels unsupported security', () => {
    expect(networkStatusLabel(network, { ...state, lastError: { ssid: 'Home', error: 'unsupported-security' } })).toBe('Not supported')
  })

  it('returns no label without a status', () => {
    expect(networkStatusLabel(network, state)).toBeUndefined()
  })
})

describe('wifiOffLabel', () => {
  const off: WifiState = { ...state, radio: 'off', networks: [] }

  it('says the system switched Wi-Fi off for Ethernet', () => {
    expect(wifiOffLabel({ ...off, ethernet: true, offForEthernet: true })).toBe('Off while Ethernet is connected')
  })

  it('says Ethernet is in use when Wi-Fi is off', () => {
    expect(wifiOffLabel({ ...off, ethernet: true })).toBe('Using Ethernet')
  })

  it('says Wi-Fi is off without Ethernet', () => {
    expect(wifiOffLabel(off)).toBe('Wi-Fi off')
  })
})
