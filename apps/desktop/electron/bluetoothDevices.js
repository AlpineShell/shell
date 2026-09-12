const DN_STARTED = 0x00000008
const DN_DEVICE_DISCONNECTED = 0x02000000
const CM_PROB_DISABLED = 22
const A2DP_SINK_UUID = '0000110b'
const HANDS_FREE_UUID = '0000111e'
const AUDIO_SERVICE_UUIDS = new Set([A2DP_SINK_UUID, '0000110c', '0000110e', HANDS_FREE_UUID])
const AUDIO_SINK_UUIDS = new Set([A2DP_SINK_UUID, HANDS_FREE_UUID])
const NULL_CONTAINER_IDS = new Set([
  '{00000000-0000-0000-0000-000000000000}',
  '{00000000-0000-0000-ffff-ffffffffffff}',
])
const DEVICE_INSTANCE_PATTERN = /^(BTHENUM|BTHLE)\\DEV_([0-9A-F]{12})(?:\\|$)/i
const SERVICE_INSTANCE_PATTERN = /^BTHENUM\\\{([0-9A-F]{8})-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}\}[^\\]*\\.*&([0-9A-F]{12})_[0-9A-F]+$/i
const TRANSPORT_BY_ENUMERATOR = { BTHENUM: 'classic', BTHLE: 'le' }
const nameCollator = new Intl.Collator(undefined, { sensitivity: 'base' })

function parseDeviceInstanceId(instanceId) {
  const match = DEVICE_INSTANCE_PATTERN.exec(String(instanceId ?? ''))
  if (!match) return null
  return { transport: TRANSPORT_BY_ENUMERATOR[match[1].toUpperCase()], address: match[2].toLowerCase() }
}

function parseServiceInstanceId(instanceId) {
  const match = SERVICE_INSTANCE_PATTERN.exec(String(instanceId ?? ''))
  if (!match) return null
  return { uuid: match[1].toLowerCase(), address: match[2].toLowerCase() }
}

function isNodeUsable({ status, problem }) {
  return problem === 0 && (status & DN_STARTED) !== 0
}

function isNodeConnected(node) {
  return isNodeUsable(node) && (node.status & DN_DEVICE_DISCONNECTED) === 0
}

function formatAddress(address) {
  return address.toUpperCase().match(/../g).join(':')
}

function containerKey(containerId, address) {
  const normalized = typeof containerId === 'string' ? containerId.toLowerCase() : null
  if (normalized && !NULL_CONTAINER_IDS.has(normalized)) return normalized
  return `bt-${address}`
}

function audioServicesByAddress(nodes) {
  const byAddress = new Map()
  for (const node of nodes) {
    const service = parseServiceInstanceId(node.instanceId)
    if (!service || !AUDIO_SERVICE_UUIDS.has(service.uuid)) continue
    const services = byAddress.get(service.address) ?? []
    services.push({
      uuid: service.uuid,
      instanceId: node.instanceId,
      usable: isNodeUsable(node),
      disabled: node.problem === CM_PROB_DISABLED,
    })
    byAddress.set(service.address, services)
  }
  return byAddress
}

function transportsByContainer(nodes) {
  const groups = new Map()
  for (const node of nodes) {
    const parsed = parseDeviceInstanceId(node.instanceId)
    if (!parsed) continue
    const key = containerKey(node.containerId, parsed.address)
    const group = groups.get(key) ?? { id: key, classic: null, le: null }
    if (!group[parsed.transport]) {
      group[parsed.transport] = {
        address: parsed.address,
        name: typeof node.name === 'string' ? node.name.trim() : '',
        connected: isNodeConnected(node),
      }
    }
    groups.set(key, group)
  }
  return groups
}

function isAudioDisabled(services) {
  if (services.length === 0) return false
  const a2dpSink = services.find((service) => service.uuid === A2DP_SINK_UUID)
  if (a2dpSink?.disabled) return true
  return services.every((service) => service.disabled)
}

function toDevice(group, servicesByAddress) {
  const { classic, le } = group
  const services = classic ? servicesByAddress.get(classic.address) ?? [] : []
  const audioSinkNodeIds = services
    .filter((service) => AUDIO_SINK_UUIDS.has(service.uuid) && service.usable)
    .map((service) => service.instanceId)
  const audioDisabled = isAudioDisabled(services)
  const classicConnected = !!classic?.connected
  return {
    id: group.id,
    name: classic?.name || le?.name || formatAddress(classic?.address ?? le.address),
    classicAddress: classic?.address ?? null,
    leAddress: le?.address ?? null,
    classicConnected,
    connected: classicConnected || !!le?.connected,
    audioSinkNodeIds,
    audioDisabled,
    canConnect: audioSinkNodeIds.length > 0 && !audioDisabled,
  }
}

function groupDevices({ nodes }) {
  const services = audioServicesByAddress(nodes)
  return [...transportsByContainer(nodes).values()].map((group) => toDevice(group, services))
}

function compareIds(a, b) {
  if (a === b) return 0
  return a < b ? -1 : 1
}

function inStableOrder(devices) {
  return [...devices].sort((a, b) => nameCollator.compare(a.name, b.name) || compareIds(a.id, b.id))
}

function buildStackSignature(stackIds) {
  return stackIds.map((id) => id.toUpperCase()).sort().join('|')
}

function disconnectedCopy(device) {
  return { ...device, connected: false, classicConnected: false }
}

function reconcileDeviceRead({ previousDevices, previousSignature }, { devices, stackIds }) {
  const signature = buildStackSignature(stackIds)
  const stackChanged = previousSignature !== null && signature !== previousSignature
  const stackVanished = stackIds.length === 0 && devices.length === 0 && previousDevices.length > 0
  if (stackVanished) return { devices: previousDevices.map(disconnectedCopy), signature, confirmed: false, stackChanged }
  if (stackChanged) return { devices: previousDevices, signature, confirmed: false, stackChanged }
  return { devices, signature, confirmed: true, stackChanged }
}

module.exports = {
  buildStackSignature,
  groupDevices,
  inStableOrder,
  isNodeConnected,
  parseDeviceInstanceId,
  parseServiceInstanceId,
  reconcileDeviceRead,
}
