const ENDPOINT_ID = /^\{[0-9.]+\}\.\{[0-9a-f-]+\}$/i
const UNNAMED_DEVICE = 'Unknown device'

const NO_AUDIO_DEVICES = Object.freeze({ output: [], input: [] })

function isEndpointId(value) {
  return typeof value === 'string' && ENDPOINT_ID.test(value)
}

function toAudioDevice(endpoint) {
  const name = typeof endpoint.name === 'string' && endpoint.name.trim() ? endpoint.name.trim() : UNNAMED_DEVICE
  return { id: endpoint.id, name, isDefault: endpoint.isDefault === true }
}

function fromPowerShellEndpoint(endpoint) {
  return { id: endpoint?.Id, name: endpoint?.Name, flow: endpoint?.Flow, isDefault: endpoint?.IsDefault }
}

function byName(a, b) {
  return a.name.localeCompare(b.name)
}

function groupAudioEndpoints(endpoints) {
  if (!Array.isArray(endpoints)) return NO_AUDIO_DEVICES
  const connected = endpoints.filter((endpoint) => endpoint && isEndpointId(endpoint.id))
  const devicesFor = (flow) => connected.filter((endpoint) => endpoint.flow === flow).map(toAudioDevice).sort(byName)
  return { output: devicesFor('output'), input: devicesFor('input') }
}

function parseAudioDevices(raw) {
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return NO_AUDIO_DEVICES
  }
  return groupAudioEndpoints((Array.isArray(parsed) ? parsed : [parsed]).map(fromPowerShellEndpoint))
}

function findAudioDevice(devices, id) {
  return [...devices.output, ...devices.input].find((device) => device.id === id) ?? null
}

function withDefaultDevice(devices, id) {
  const flow = devices.output.some((device) => device.id === id) ? 'output' : 'input'
  return {
    ...devices,
    [flow]: devices[flow].map((device) => ({ ...device, isDefault: device.id === id })),
  }
}

module.exports = { NO_AUDIO_DEVICES, isEndpointId, groupAudioEndpoints, parseAudioDevices, findAudioDevice, withDefaultDevice }
