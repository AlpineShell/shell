import { describe, it, expect } from 'vitest'
import {
  bandForChannel,
  bandForFrequency,
  buildNetworkDetails,
  parseIpConfiguration,
  securityLabel,
  subnetMaskFromPrefix,
  wifiStandard,
} from './networkDetails.js'

const ETHERNET_CONFIGURATION = {
  adapter: 'Realtek USB GbE Family Controller',
  medium: 14,
  macAddress: '4C-CF-7C-DC-42-FC',
  linkSpeedBits: 1000000000,
  ipv4Address: '192.168.1.42',
  prefixLength: 24,
  ipv6Address: 'fe80::4c3a:9e1f:2b7d:61a0%12',
  gateway: '192.168.1.1',
  dnsServers: ['1.1.1.1', '1.0.0.1'],
  dhcp: 'Enabled',
  connectivity: 'Internet',
}

const WIFI_LINK = {
  ssid: 'HomeNet-5G',
  bssid: 'AA:BB:CC:DD:EE:FF',
  phyType: 10,
  signalPercent: 92,
  receiveRateKbps: 866700,
  transmitRateKbps: 780000,
  securityEnabled: true,
  authAlgorithm: 9,
  channel: 44,
  rssiDbm: -48,
  centerFrequencyKhz: 5220000,
}

describe('subnetMaskFromPrefix', () => {
  it('writes a prefix length as a dotted mask', () => {
    expect(subnetMaskFromPrefix(24)).toBe('255.255.255.0')
    expect(subnetMaskFromPrefix(19)).toBe('255.255.224.0')
    expect(subnetMaskFromPrefix(32)).toBe('255.255.255.255')
    expect(subnetMaskFromPrefix(0)).toBe('0.0.0.0')
  })

  it('gives no mask for a prefix that is not an IPv4 length', () => {
    expect(subnetMaskFromPrefix(33)).toBeNull()
    expect(subnetMaskFromPrefix(undefined)).toBeNull()
  })
})

describe('bandForFrequency', () => {
  it('names the band of a centre frequency in kHz', () => {
    expect(bandForFrequency(2437000)).toBe('2.4 GHz')
    expect(bandForFrequency(5220000)).toBe('5 GHz')
    expect(bandForFrequency(5975000)).toBe('6 GHz')
  })

  it('names no band without a frequency', () => {
    expect(bandForFrequency(0)).toBeNull()
    expect(bandForFrequency(null)).toBeNull()
  })
})

describe('bandForChannel', () => {
  it('reads channels 1 to 14 as 2.4 GHz and higher ones as 5 GHz', () => {
    expect(bandForChannel(6)).toBe('2.4 GHz')
    expect(bandForChannel(149)).toBe('5 GHz')
    expect(bandForChannel(null)).toBeNull()
  })
})

describe('wifiStandard', () => {
  it('names the Wi-Fi generation of an 802.11 PHY type', () => {
    expect(wifiStandard(7)).toBe('Wi-Fi 4')
    expect(wifiStandard(8)).toBe('Wi-Fi 5')
    expect(wifiStandard(10)).toBe('Wi-Fi 6')
    expect(wifiStandard(11)).toBe('Wi-Fi 7')
    expect(wifiStandard(6)).toBeNull()
  })
})

describe('securityLabel', () => {
  it('names the authentication a network uses', () => {
    expect(securityLabel(true, 7)).toBe('WPA2-Personal')
    expect(securityLabel(true, 9)).toBe('WPA3-Personal')
    expect(securityLabel(true, 6)).toBe('WPA2-Enterprise')
  })

  it('tells an open network from one with WEP on open authentication', () => {
    expect(securityLabel(false, 1)).toBe('Open')
    expect(securityLabel(true, 1)).toBe('WEP')
  })
})

describe('parseIpConfiguration', () => {
  it('reads the JSON the query prints', () => {
    expect(parseIpConfiguration(JSON.stringify(ETHERNET_CONFIGURATION))).toEqual(ETHERNET_CONFIGURATION)
  })

  it('reads nothing from empty, null or broken output', () => {
    expect(parseIpConfiguration('')).toBeNull()
    expect(parseIpConfiguration('null')).toBeNull()
    expect(parseIpConfiguration('{oops')).toBeNull()
  })
})

describe('buildNetworkDetails', () => {
  it('describes a wired connection from its IP configuration alone', () => {
    expect(buildNetworkDetails(ETHERNET_CONFIGURATION, WIFI_LINK)).toEqual({
      type: 'ethernet',
      adapter: 'Realtek USB GbE Family Controller',
      macAddress: '4C:CF:7C:DC:42:FC',
      ipv4Address: '192.168.1.42',
      subnetMask: '255.255.255.0',
      ipv6Address: 'fe80::4c3a:9e1f:2b7d:61a0',
      addressSource: 'dhcp',
      gateway: '192.168.1.1',
      dnsServers: ['1.1.1.1', '1.0.0.1'],
      online: true,
      linkSpeedMbps: 1000,
      wifi: null,
    })
  })

  it('adds the Wi-Fi link to a wireless connection and takes its speed from it', () => {
    const details = buildNetworkDetails({ ...ETHERNET_CONFIGURATION, medium: 9, linkSpeedBits: 433000000 }, WIFI_LINK)
    expect(details.type).toBe('wifi')
    expect(details.linkSpeedMbps).toBe(867)
    expect(details.wifi).toEqual({
      ssid: 'HomeNet-5G',
      band: '5 GHz',
      channel: 44,
      signalPercent: 92,
      rssiDbm: -48,
      security: 'WPA3-Personal',
      standard: 'Wi-Fi 6',
      receiveMbps: 867,
      transmitMbps: 780,
    })
  })

  it('falls back to the channel for the band when the BSS list has no frequency', () => {
    const details = buildNetworkDetails({ ...ETHERNET_CONFIGURATION, medium: 9 }, { ...WIFI_LINK, centerFrequencyKhz: null, channel: 6 })
    expect(details.wifi.band).toBe('2.4 GHz')
  })

  it('reports a manual address and no internet as they are', () => {
    const details = buildNetworkDetails({ ...ETHERNET_CONFIGURATION, dhcp: 'Disabled', connectivity: 'LocalNetwork' }, null)
    expect(details.addressSource).toBe('manual')
    expect(details.online).toBe(false)
  })

  it('describes nothing when no adapter has a default route', () => {
    expect(buildNetworkDetails(null, WIFI_LINK)).toBeNull()
  })
})
