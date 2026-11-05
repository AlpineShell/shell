import { describe, it, expect } from 'vitest'
import { decodeAvailableNetworks } from './wifiNative.js'

const WLAN_AVAILABLE_NETWORK_LIST_HEADER_BYTES = 8
const WLAN_AVAILABLE_NETWORK_BYTES = 628

function availableNetworksBuffer(entries) {
  const buffer = Buffer.alloc(WLAN_AVAILABLE_NETWORK_LIST_HEADER_BYTES + entries.length * WLAN_AVAILABLE_NETWORK_BYTES)
  buffer.writeUInt32LE(entries.length, 0)
  entries.forEach((entry, index) => {
    const base = WLAN_AVAILABLE_NETWORK_LIST_HEADER_BYTES + index * WLAN_AVAILABLE_NETWORK_BYTES
    if (entry.profileName) buffer.write(entry.profileName, base, 512, 'utf16le')
    const ssid = Buffer.from(entry.ssid, 'utf8')
    buffer.writeUInt32LE(ssid.length, base + 512)
    ssid.copy(buffer, base + 516)
    buffer.writeUInt32LE(entry.connectable ? 1 : 0, base + 556)
    buffer.writeUInt32LE(entry.signal, base + 604)
    buffer.writeUInt32LE(entry.securityEnabled ? 1 : 0, base + 608)
    buffer.writeUInt32LE(entry.authAlgorithm, base + 612)
    buffer.writeUInt32LE(entry.cipherAlgorithm, base + 616)
    buffer.writeUInt32LE((entry.connected ? 1 : 0) | (entry.hasProfile ? 2 : 0), base + 620)
  })
  return buffer
}

describe('decodeAvailableNetworks', () => {
  it('decodes multiple networks and all specified fields', () => {
    expect(decodeAvailableNetworks(availableNetworksBuffer([
      { profileName: 'Cafe', ssid: 'Café ☕', signal: 87, connectable: true, securityEnabled: true, authAlgorithm: 7, cipherAlgorithm: 4, connected: true, hasProfile: true },
      { profileName: '', ssid: 'Guest', signal: 42, connectable: false, securityEnabled: false, authAlgorithm: 1, cipherAlgorithm: 0, connected: false, hasProfile: false },
    ]))).toEqual([
      { profileName: 'Cafe', ssid: 'Café ☕', signal: 87, connectable: true, securityEnabled: true, authAlgorithm: 7, cipherAlgorithm: 4, connected: true, hasProfile: true },
      { profileName: '', ssid: 'Guest', signal: 42, connectable: false, securityEnabled: false, authAlgorithm: 1, cipherAlgorithm: 0, connected: false, hasProfile: false },
    ])
  })

  it('returns an empty SSID for a hidden network', () => {
    expect(decodeAvailableNetworks(availableNetworksBuffer([
      { profileName: '', ssid: '', signal: 0, connectable: true, securityEnabled: true, authAlgorithm: 4, cipherAlgorithm: 4, connected: false, hasProfile: false },
    ]))[0].ssid).toBe('')
  })

  it('returns only complete entries from a truncated buffer', () => {
    const buffer = availableNetworksBuffer([
      { profileName: 'First', ssid: 'First', signal: 70, connectable: true, securityEnabled: false, authAlgorithm: 1, cipherAlgorithm: 0, connected: false, hasProfile: false },
      { profileName: 'Second', ssid: 'Second', signal: 30, connectable: true, securityEnabled: true, authAlgorithm: 7, cipherAlgorithm: 4, connected: false, hasProfile: true },
    ])
    const decoded = decodeAvailableNetworks(buffer.subarray(0, WLAN_AVAILABLE_NETWORK_LIST_HEADER_BYTES + WLAN_AVAILABLE_NETWORK_BYTES + 40))
    expect(decoded).toHaveLength(1)
    expect(decoded[0].ssid).toBe('First')
    expect(decodeAvailableNetworks(buffer.subarray(0, WLAN_AVAILABLE_NETWORK_LIST_HEADER_BYTES))).toEqual([])
  })

  it('clamps an invalid SSID length to the fixed SSID field', () => {
    const buffer = availableNetworksBuffer([
      { profileName: '', ssid: '', signal: 10, connectable: false, securityEnabled: false, authAlgorithm: 0, cipherAlgorithm: 0, connected: false, hasProfile: false },
    ])
    buffer.writeUInt32LE(4096, WLAN_AVAILABLE_NETWORK_LIST_HEADER_BYTES + 512)
    buffer.fill(0x41, WLAN_AVAILABLE_NETWORK_LIST_HEADER_BYTES + 516, WLAN_AVAILABLE_NETWORK_LIST_HEADER_BYTES + 548)
    expect(decodeAvailableNetworks(buffer)[0].ssid).toBe('A'.repeat(32))
  })
})
