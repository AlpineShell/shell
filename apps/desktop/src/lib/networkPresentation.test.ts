import { describe, expect, it } from 'vitest'
import { connectionLabel, dnsPlacement, formatLinkSpeed, looksLikeAddress, nodeFacts, nodeName, nodeValue } from './networkPresentation'

const WIFI: WifiLinkDetails = {
  ssid: 'HomeNet-5G',
  band: '5 GHz',
  channel: 44,
  signalPercent: 92,
  rssiDbm: -48,
  security: 'WPA3-Personal',
  standard: 'Wi-Fi 6',
  receiveMbps: 867,
  transmitMbps: 780,
}

const WIRELESS: NetworkDetails = {
  type: 'wifi',
  adapter: 'Intel(R) Wi-Fi 6 AX201',
  macAddress: '3C:22:FB:8A:41:7E',
  ipv4Address: '192.168.1.42',
  subnetMask: '255.255.255.0',
  ipv6Address: 'fe80::4c3a:9e1f:2b7d:61a0',
  addressSource: 'dhcp',
  gateway: '192.168.1.1',
  dnsServers: ['1.1.1.1', '1.0.0.1'],
  online: true,
  linkSpeedMbps: 867,
  wifi: WIFI,
}

const WIRED: NetworkDetails = { ...WIRELESS, type: 'ethernet', adapter: 'Realtek GbE', linkSpeedMbps: 1000, wifi: null }

function factsOf(details: NetworkDetails, node: NetworkMapNode): Record<string, string> {
  return Object.fromEntries(nodeFacts(details, node).map((fact) => [fact.label, fact.value]))
}

describe('formatLinkSpeed', () => {
  it('writes megabits below a gigabit and gigabits from one up', () => {
    expect(formatLinkSpeed(867)).toBe('867 Mbps')
    expect(formatLinkSpeed(1000)).toBe('1 Gbps')
    expect(formatLinkSpeed(2500)).toBe('2.5 Gbps')
    expect(formatLinkSpeed(null)).toBeNull()
  })
})

describe('the connection map', () => {
  it('labels the first link with the medium and the Wi-Fi band', () => {
    expect(connectionLabel(WIRELESS)).toBe('Wi-Fi · 5 GHz')
    expect(connectionLabel(WIRED)).toBe('Ethernet')
  })

  it('names the router after the Wi-Fi network, and plainly on a wire', () => {
    expect(nodeName(WIRELESS, 'router')).toBe('HomeNet-5G')
    expect(nodeName(WIRED, 'router')).toBe('Router')
  })

  it('shows the address of each stop along the way', () => {
    expect(nodeValue(WIRELESS, 'pc')).toBe('192.168.1.42')
    expect(nodeValue(WIRELESS, 'router')).toBe('192.168.1.1')
    expect(nodeValue(WIRELESS, 'internet')).toBe('Online')
    expect(nodeValue(WIRELESS, 'dns')).toBe('1.1.1.1')
    expect(nodeValue({ ...WIRELESS, online: false }, 'internet')).toBe('No internet')
  })
})

describe('nodeFacts', () => {
  it('describes this PC by its adapter and addresses', () => {
    expect(factsOf(WIRELESS, 'pc')).toEqual({
      Adapter: 'Intel(R) Wi-Fi 6 AX201',
      'IPv4 address': '192.168.1.42',
      'Subnet mask': '255.255.255.0',
      'IPv6 address': 'fe80::4c3a:9e1f:2b7d:61a0',
      'MAC address': '3C:22:FB:8A:41:7E',
      'Address from': 'DHCP',
    })
  })

  it('describes a Wi-Fi router by its radio link', () => {
    expect(factsOf(WIRELESS, 'router')).toEqual({
      Network: 'HomeNet-5G',
      Gateway: '192.168.1.1',
      Band: '5 GHz · Channel 44',
      Signal: '92% (-48 dBm)',
      Standard: 'Wi-Fi 6',
      'Link speed': '867 Mbps',
      Security: 'WPA3-Personal',
    })
  })

  it('describes a wired router by its gateway and link speed', () => {
    expect(factsOf(WIRED, 'router')).toEqual({ Connection: 'Ethernet', Gateway: '192.168.1.1', 'Link speed': '1 Gbps' })
  })

  it('leaves out what the PC did not report', () => {
    const facts = factsOf({ ...WIRELESS, ipv6Address: null, macAddress: null }, 'pc')
    expect(facts).not.toHaveProperty('IPv6 address')
    expect(facts).not.toHaveProperty('MAC address')
  })

  it('lists every DNS server and says where the first one is', () => {
    expect(factsOf({ ...WIRELESS, dnsServers: ['1.1.1.1', '1.0.0.1', '9.9.9.9'] }, 'dns')).toEqual({
      'Primary DNS': '1.1.1.1',
      'Secondary DNS': '1.0.0.1',
      'Other DNS': '9.9.9.9',
      Where: 'On the internet',
    })
  })

  it('says on the router that it answers DNS when the router is the DNS server', () => {
    expect(factsOf({ ...WIRED, dnsServers: ['192.168.1.1'] }, 'router')).toMatchObject({ DNS: 'This router' })
    expect(factsOf(WIRED, 'router')).not.toHaveProperty('DNS')
  })
})

describe('dnsPlacement', () => {
  it('puts DNS on the router when the router is the DNS server', () => {
    expect(dnsPlacement({ ...WIRELESS, dnsServers: ['192.168.1.1'] })).toBe('router')
  })

  it('puts a DNS server on the same subnet or a private range on the local network', () => {
    expect(dnsPlacement({ ...WIRELESS, dnsServers: ['192.168.1.5'] })).toBe('local')
    expect(dnsPlacement({ ...WIRELESS, ipv4Address: '172.21.70.231', subnetMask: '255.255.224.0', gateway: '172.21.64.1', dnsServers: ['10.10.0.53'] })).toBe('local')
    expect(dnsPlacement({ ...WIRELESS, dnsServers: ['fe80::1'] })).toBe('local')
  })

  it('puts a public DNS server on the internet', () => {
    expect(dnsPlacement(WIRELESS)).toBe('internet')
    expect(dnsPlacement({ ...WIRELESS, dnsServers: ['8.8.8.8'] })).toBe('internet')
    expect(dnsPlacement({ ...WIRELESS, dnsServers: ['2606:4700:4700::1111'] })).toBe('internet')
  })

  it('places nothing without a DNS server', () => {
    expect(dnsPlacement({ ...WIRELESS, dnsServers: [] })).toBeNull()
  })
})

describe('looksLikeAddress', () => {
  it('tells an IP or MAC address from words', () => {
    expect(looksLikeAddress('192.168.1.1')).toBe(true)
    expect(looksLikeAddress('fe80::1')).toBe(true)
    expect(looksLikeAddress('3C:22:FB:8A:41:7E')).toBe(true)
    expect(looksLikeAddress('Online')).toBe(false)
    expect(looksLikeAddress('DHCP')).toBe(false)
  })
})
