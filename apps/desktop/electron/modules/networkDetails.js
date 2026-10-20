const { runPowerShell } = require('../powershell')
const { readWifiLink } = require('../networkNative')

const IP_CONFIGURATION_COMMAND = [
  "$c = Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } | Sort-Object { $_.IPv4DefaultGateway[0].RouteMetric + $_.NetIPv4Interface.InterfaceMetric } | Select-Object -First 1;",
  "if (-not $c) { 'null'; return };",
  '$a = $c.NetAdapter;',
  '$v4 = $c.IPv4Address | Select-Object -First 1;',
  '[ordered]@{',
  'adapter = $a.InterfaceDescription;',
  'medium = [int]$a.NdisPhysicalMedium;',
  'macAddress = $a.MacAddress;',
  'linkSpeedBits = [int64]$a.ReceiveLinkSpeed;',
  'ipv4Address = $v4.IPAddress;',
  'prefixLength = [int]$v4.PrefixLength;',
  'ipv6Address = ($c.IPv6LinkLocalAddress | Select-Object -First 1).IPAddress;',
  'gateway = ($c.IPv4DefaultGateway | Select-Object -First 1).NextHop;',
  'dnsServers = @(($c.DNSServer | Where-Object { $_.AddressFamily -eq 2 }).ServerAddresses);',
  'dhcp = [string]$c.NetIPv4Interface.Dhcp;',
  'connectivity = [string](Get-NetConnectionProfile -InterfaceIndex $c.InterfaceIndex -ErrorAction SilentlyContinue).IPv4Connectivity',
  '} | ConvertTo-Json -Compress',
].join(' ')

const NDIS_MEDIUM_NATIVE_802_11 = 9
const BITS_PER_MEGABIT = 1000000
const KBPS_PER_MBPS = 1000
const BAND_2_4_GHZ_BELOW_KHZ = 3000000
const BAND_5_GHZ_BELOW_KHZ = 5925000
const BAND_6_GHZ_BELOW_KHZ = 7200000
const LAST_2_4_GHZ_CHANNEL = 14

const WIFI_STANDARDS = {
  7: 'Wi-Fi 4',
  8: 'Wi-Fi 5',
  10: 'Wi-Fi 6',
  11: 'Wi-Fi 7',
}

const SECURITY_LABELS = {
  2: 'WEP',
  3: 'WPA-Enterprise',
  4: 'WPA-Personal',
  6: 'WPA2-Enterprise',
  7: 'WPA2-Personal',
  8: 'WPA3-Enterprise 192-bit',
  9: 'WPA3-Personal',
  10: 'Enhanced Open',
  11: 'WPA3-Enterprise',
}

const DOT11_AUTH_ALGO_OPEN = 1

function subnetMaskFromPrefix(prefixLength) {
  if (!Number.isInteger(prefixLength) || prefixLength < 0 || prefixLength > 32) return null
  const mask = prefixLength === 0 ? 0 : (0xffffffff << (32 - prefixLength)) >>> 0
  return [24, 16, 8, 0].map((shift) => (mask >>> shift) & 0xff).join('.')
}

function withoutZoneIndex(address) {
  return typeof address === 'string' && address.length > 0 ? address.split('%')[0] : null
}

function megabitsFromBits(bits) {
  return Number.isFinite(bits) && bits > 0 ? Math.round(bits / BITS_PER_MEGABIT) : null
}

function megabitsFromKilobits(kilobits) {
  return Number.isFinite(kilobits) && kilobits > 0 ? Math.round(kilobits / KBPS_PER_MBPS) : null
}

function bandForFrequency(frequencyKhz) {
  if (!Number.isFinite(frequencyKhz) || frequencyKhz <= 0) return null
  if (frequencyKhz < BAND_2_4_GHZ_BELOW_KHZ) return '2.4 GHz'
  if (frequencyKhz < BAND_5_GHZ_BELOW_KHZ) return '5 GHz'
  if (frequencyKhz < BAND_6_GHZ_BELOW_KHZ) return '6 GHz'
  return null
}

function bandForChannel(channel) {
  if (!Number.isInteger(channel) || channel <= 0) return null
  return channel <= LAST_2_4_GHZ_CHANNEL ? '2.4 GHz' : '5 GHz'
}

function wifiStandard(phyType) {
  return WIFI_STANDARDS[phyType] ?? null
}

function securityLabel(securityEnabled, authAlgorithm) {
  if (authAlgorithm === DOT11_AUTH_ALGO_OPEN) return securityEnabled ? 'WEP' : 'Open'
  return SECURITY_LABELS[authAlgorithm] ?? (securityEnabled ? 'Secured' : 'Open')
}

function parseIpConfiguration(output) {
  if (!output) return null
  try {
    const parsed = JSON.parse(output)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function buildWifiLink(link) {
  if (!link) return null
  return {
    ssid: link.ssid,
    band: bandForFrequency(link.centerFrequencyKhz) ?? bandForChannel(link.channel),
    channel: link.channel,
    signalPercent: link.signalPercent,
    rssiDbm: link.rssiDbm,
    security: securityLabel(link.securityEnabled, link.authAlgorithm),
    standard: wifiStandard(link.phyType),
    receiveMbps: megabitsFromKilobits(link.receiveRateKbps),
    transmitMbps: megabitsFromKilobits(link.transmitRateKbps),
  }
}

function buildNetworkDetails(ip, link) {
  if (!ip) return null
  const wifi = ip.medium === NDIS_MEDIUM_NATIVE_802_11 ? buildWifiLink(link) : null
  return {
    type: ip.medium === NDIS_MEDIUM_NATIVE_802_11 ? 'wifi' : 'ethernet',
    adapter: ip.adapter || null,
    macAddress: ip.macAddress ? ip.macAddress.replace(/-/g, ':') : null,
    ipv4Address: ip.ipv4Address || null,
    subnetMask: subnetMaskFromPrefix(ip.prefixLength),
    ipv6Address: withoutZoneIndex(ip.ipv6Address),
    addressSource: ip.dhcp === 'Enabled' ? 'dhcp' : 'manual',
    gateway: ip.gateway || null,
    dnsServers: Array.isArray(ip.dnsServers) ? ip.dnsServers.filter(Boolean) : [],
    online: ip.connectivity === 'Internet',
    linkSpeedMbps: wifi?.receiveMbps ?? megabitsFromBits(ip.linkSpeedBits),
    wifi,
  }
}

async function readNetworkDetails() {
  const [output, link] = await Promise.all([runPowerShell(IP_CONFIGURATION_COMMAND), readWifiLink().catch(() => null)])
  return buildNetworkDetails(parseIpConfiguration(output), link)
}

module.exports = {
  bandForChannel,
  bandForFrequency,
  buildNetworkDetails,
  parseIpConfiguration,
  readNetworkDetails,
  securityLabel,
  subnetMaskFromPrefix,
  wifiStandard,
}
