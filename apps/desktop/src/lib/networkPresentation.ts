const MBPS_PER_GBPS = 1000
const NOT_KNOWN = '—'
const ADDRESS_PATTERN = /^[0-9a-f.:]+$/i

export const NETWORK_MAP_NODES: NetworkMapNode[] = ['pc', 'router', 'internet', 'dns']

export function formatLinkSpeed(mbps: number | null): string | null {
  if (mbps === null) return null
  if (mbps >= MBPS_PER_GBPS) return `${Number((mbps / MBPS_PER_GBPS).toFixed(1))} Gbps`
  return `${mbps} Mbps`
}

export function connectionLabel(details: NetworkDetails): string {
  if (details.type === 'ethernet') return 'Ethernet'
  return details.wifi?.band ? `Wi-Fi · ${details.wifi.band}` : 'Wi-Fi'
}

export function nodeName(details: NetworkDetails, node: NetworkMapNode): string {
  if (node === 'pc') return 'This PC'
  if (node === 'router') return (details.type === 'wifi' && details.wifi?.ssid) || 'Router'
  if (node === 'internet') return 'Internet'
  return 'DNS'
}

export function nodeValue(details: NetworkDetails, node: NetworkMapNode): string {
  if (node === 'pc') return details.ipv4Address ?? 'No address'
  if (node === 'router') return details.gateway ?? NOT_KNOWN
  if (node === 'internet') return details.online ? 'Online' : 'No internet'
  return details.dnsServers[0] ?? NOT_KNOWN
}

const PRIVATE_IPV4_RANGES: [number, number][] = [
  [0x0a000000, 8],
  [0xac100000, 12],
  [0xc0a80000, 16],
  [0xa9fe0000, 16],
  [0x64400000, 10],
]

const LOCAL_IPV6_PREFIXES = [/^fe[89ab][0-9a-f]:/i, /^f[cd][0-9a-f]{2}:/i]

const DNS_PLACE_LABELS: Record<DnsPlacement, string> = {
  router: 'On your router',
  local: 'On your local network',
  internet: 'On the internet',
}

function ipv4Number(address: string): number | null {
  const parts = address.split('.')
  if (parts.length !== 4) return null
  const octets = parts.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : NaN))
  if (octets.some((octet) => Number.isNaN(octet) || octet > 255)) return null
  return ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0
}

function maskOfPrefix(prefixLength: number): number {
  return prefixLength === 0 ? 0 : (0xffffffff << (32 - prefixLength)) >>> 0
}

function inRange(address: number, base: number, prefixLength: number): boolean {
  const mask = maskOfPrefix(prefixLength)
  return ((address & mask) >>> 0) === ((base & mask) >>> 0)
}

function sameSubnet(first: number, second: number, subnetMask: string | null): boolean {
  const mask = subnetMask === null ? null : ipv4Number(subnetMask)
  return mask !== null && mask !== 0 && ((first & mask) >>> 0) === ((second & mask) >>> 0)
}

function isLocalAddress(address: string, details: NetworkDetails): boolean {
  const numeric = ipv4Number(address)
  if (numeric === null) return LOCAL_IPV6_PREFIXES.some((prefix) => prefix.test(address))
  const own = details.ipv4Address === null ? null : ipv4Number(details.ipv4Address)
  if (own !== null && sameSubnet(numeric, own, details.subnetMask)) return true
  return PRIVATE_IPV4_RANGES.some(([base, prefixLength]) => inRange(numeric, base, prefixLength))
}

export function dnsPlacement(details: NetworkDetails): DnsPlacement | null {
  const primary = details.dnsServers[0]
  if (!primary) return null
  if (details.gateway !== null && primary === details.gateway) return 'router'
  return isLocalAddress(primary, details) ? 'local' : 'internet'
}

function signalLabel(wifi: WifiLinkDetails): string {
  return wifi.rssiDbm === null ? `${wifi.signalPercent}%` : `${wifi.signalPercent}% (${wifi.rssiDbm} dBm)`
}

function bandAndChannel(wifi: WifiLinkDetails): string | null {
  if (wifi.band && wifi.channel !== null) return `${wifi.band} · Channel ${wifi.channel}`
  if (wifi.channel !== null) return `Channel ${wifi.channel}`
  return wifi.band
}

function presentFacts(facts: [string, string | null | undefined][]): NetworkFact[] {
  return facts.filter((fact): fact is [string, string] => typeof fact[1] === 'string' && fact[1].length > 0).map(([label, value]) => ({ label, value }))
}

function pcFacts(details: NetworkDetails): NetworkFact[] {
  return presentFacts([
    ['Adapter', details.adapter],
    ['IPv4 address', details.ipv4Address],
    ['Subnet mask', details.subnetMask],
    ['IPv6 address', details.ipv6Address],
    ['MAC address', details.macAddress],
    ['Address from', details.addressSource === 'dhcp' ? 'DHCP' : 'Set manually'],
  ])
}

function routerFacts(details: NetworkDetails): NetworkFact[] {
  const wifi = details.wifi
  const answersDns: [string, string | null] = ['DNS', dnsPlacement(details) === 'router' ? 'This router' : null]
  if (!wifi) {
    return presentFacts([
      ['Connection', 'Ethernet'],
      ['Gateway', details.gateway],
      ['Link speed', formatLinkSpeed(details.linkSpeedMbps)],
      answersDns,
    ])
  }
  return presentFacts([
    ['Network', wifi.ssid],
    ['Gateway', details.gateway],
    ['Band', bandAndChannel(wifi)],
    ['Signal', signalLabel(wifi)],
    ['Standard', wifi.standard],
    ['Link speed', formatLinkSpeed(details.linkSpeedMbps)],
    ['Security', wifi.security],
    answersDns,
  ])
}

function internetFacts(details: NetworkDetails): NetworkFact[] {
  return presentFacts([
    ['Status', details.online ? 'Online' : 'No internet access'],
    ['Through', details.gateway],
    ['Checked by', 'Windows connectivity check'],
  ])
}

function dnsFacts(details: NetworkDetails): NetworkFact[] {
  const [primary, secondary, ...others] = details.dnsServers
  const placement = dnsPlacement(details)
  return presentFacts([
    ['Primary DNS', primary ?? NOT_KNOWN],
    ['Secondary DNS', secondary],
    ['Other DNS', others.length > 0 ? others.join(', ') : null],
    ['Where', placement === null ? null : DNS_PLACE_LABELS[placement]],
  ])
}

export function nodeFacts(details: NetworkDetails, node: NetworkMapNode): NetworkFact[] {
  if (node === 'pc') return pcFacts(details)
  if (node === 'router') return routerFacts(details)
  if (node === 'internet') return internetFacts(details)
  return dnsFacts(details)
}

export function looksLikeAddress(value: string): boolean {
  return ADDRESS_PATTERN.test(value) && /[.:]/.test(value)
}
