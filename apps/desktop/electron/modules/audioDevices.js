const ENDPOINT_ID = /^\{[0-9.]+\}\.\{[0-9a-f-]+\}$/i
const UNNAMED_DEVICE = 'Unknown device'

const NO_AUDIO_DEVICES = Object.freeze({ output: [], input: [] })

function isEndpointId(value) {
  return typeof value === 'string' && ENDPOINT_ID.test(value)
}

function toAudioDevice(endpoint) {
  const name = typeof endpoint.Name === 'string' && endpoint.Name.trim() ? endpoint.Name.trim() : UNNAMED_DEVICE
  return { id: endpoint.Id, name, isDefault: endpoint.IsDefault === true }
}

function byName(a, b) {
  return a.name.localeCompare(b.name)
}

function parseAudioDevices(raw) {
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return NO_AUDIO_DEVICES
  }
  const endpoints = (Array.isArray(parsed) ? parsed : [parsed]).filter(
    (endpoint) => endpoint && isEndpointId(endpoint.Id)
  )
  const devicesFor = (flow) => endpoints.filter((endpoint) => endpoint.Flow === flow).map(toAudioDevice).sort(byName)
  return { output: devicesFor('output'), input: devicesFor('input') }
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

module.exports = { NO_AUDIO_DEVICES, isEndpointId, parseAudioDevices, findAudioDevice, withDefaultDevice }
