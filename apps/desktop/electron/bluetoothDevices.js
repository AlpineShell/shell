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
const MAJOR_CLASS_SHIFT = 8
const MAJOR_CLASS_MASK = 0x1f
const MINOR_CLASS_SHIFT = 2
const MINOR_CLASS_MASK = 0x3f
const MAJOR_CLASS_COMPUTER = 0x01
const MAJOR_CLASS_PHONE = 0x02
const MAJOR_CLASS_AUDIO_VIDEO = 0x04
const MAJOR_CLASS_PERIPHERAL = 0x05
const MAJOR_CLASS_WEARABLE = 0x07
const AUDIO_MINOR_MICROPHONE = 0x04
const AUDIO_MINOR_GAMING = 0x12
const AUDIO_MINOR_SPEAKERS = new Set([0x05, 0x07, 0x08, 0x0a, 0x0f])
const PERIPHERAL_TYPE_MASK = 0x0f
const PERIPHERAL_GAME_CONTROLLERS = new Set([0x01, 0x02])
const PERIPHERAL_INPUT_SHIFT = 4
const PERIPHERAL_KEYBOARD = 0x1
const PERIPHERAL_POINTING = 0x2
const PERIPHERAL_COMBO = 0x3
const MOUSE_CLASS_GUID = '{4d36e96f-e325-11ce-bfc1-08002be10318}'
const KEYBOARD_CLASS_GUID = '{4d36e96b-e325-11ce-bfc1-08002be10318}'
const NAME_KINDS = [
  [/controller|gamepad|xbox|dualsense|dualshock|joy-?con|8bitdo/i, 'gamepad'],
  [/mouse|mx master|mx anywhere|trackpad|trackball|magic mouse/i, 'mouse'],
  [/keyboard|keychron|mx keys|magic keyboard/i, 'keyboard'],
  [/airpods|buds|headphone|headset|earbud|wh-|wf-|quietcomfort|barracuda/i, 'headphones'],
  [/speaker|soundlink|boom|jbl|sonos|soundcore|flip|charge/i, 'speaker'],
  [/iphone|galaxy|pixel|phone/i, 'phone'],
  [/watch|band/i, 'watch'],
]
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
        classOfDevice: Number.isInteger(node.classOfDevice) ? node.classOfDevice : null,
        childClasses: Array.isArray(node.childClasses) ? node.childClasses : [],
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

function kindFromClassOfDevice(classOfDevice) {
  if (!classOfDevice) return null
  const major = (classOfDevice >> MAJOR_CLASS_SHIFT) & MAJOR_CLASS_MASK
  const minor = (classOfDevice >> MINOR_CLASS_SHIFT) & MINOR_CLASS_MASK
  if (major === MAJOR_CLASS_COMPUTER) return 'computer'
  if (major === MAJOR_CLASS_PHONE) return 'phone'
  if (major === MAJOR_CLASS_WEARABLE) return 'watch'
  if (major === MAJOR_CLASS_AUDIO_VIDEO) {
    if (minor === AUDIO_MINOR_MICROPHONE) return 'microphone'
    if (minor === AUDIO_MINOR_GAMING) return 'gamepad'
    return AUDIO_MINOR_SPEAKERS.has(minor) ? 'speaker' : 'headphones'
  }
  if (major === MAJOR_CLASS_PERIPHERAL) {
    if (PERIPHERAL_GAME_CONTROLLERS.has(minor & PERIPHERAL_TYPE_MASK)) return 'gamepad'
    const pointerOrKeyboard = minor >> PERIPHERAL_INPUT_SHIFT
    if (pointerOrKeyboard === PERIPHERAL_POINTING) return 'mouse'
    if (pointerOrKeyboard === PERIPHERAL_KEYBOARD || pointerOrKeyboard === PERIPHERAL_COMBO) return 'keyboard'
  }
  return null
}

function kindFromChildClasses(childClasses) {
  const classes = new Set(childClasses.map((classGuid) => classGuid.toLowerCase()))
  if (classes.has(KEYBOARD_CLASS_GUID)) return 'keyboard'
  if (classes.has(MOUSE_CLASS_GUID)) return 'mouse'
  return null
}

function kindFromName(name) {
  return NAME_KINDS.find(([pattern]) => pattern.test(name))?.[1] ?? null
}

function deviceKind({ classOfDevice, childClasses, name, hasAudio }) {
  return kindFromClassOfDevice(classOfDevice) ?? kindFromChildClasses(childClasses) ?? kindFromName(name) ?? (hasAudio ? 'headphones' : 'other')
}

function toDevice(group, servicesByAddress) {
  const { classic, le } = group
  const services = classic ? servicesByAddress.get(classic.address) ?? [] : []
  const audioSinkNodeIds = services
    .filter((service) => AUDIO_SINK_UUIDS.has(service.uuid) && service.usable)
    .map((service) => service.instanceId)
  const audioDisabled = isAudioDisabled(services)
  const classicConnected = !!classic?.connected
  const name = classic?.name || le?.name || formatAddress(classic?.address ?? le.address)
  return {
    id: group.id,
    name,
    kind: deviceKind({
      classOfDevice: classic?.classOfDevice ?? le?.classOfDevice ?? null,
      childClasses: [...(classic?.childClasses ?? []), ...(le?.childClasses ?? [])],
      name,
      hasAudio: services.length > 0,
    }),
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
  deviceKind,
  groupDevices,
  inStableOrder,
  isNodeConnected,
  parseDeviceInstanceId,
  parseServiceInstanceId,
  reconcileDeviceRead,
}
