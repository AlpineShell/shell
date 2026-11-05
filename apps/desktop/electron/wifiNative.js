const {
  bytesAt,
  loadNativeApi,
  openWlanClientAsync,
} = require('./networkNative.js')

const WLAN_INTERFACE_LIST_HEADER_BYTES = 8
const WLAN_INTERFACE_INFO_BYTES = 532
const WLAN_INTERFACE_GUID_BYTES = 16
const WLAN_INTERFACE_STATE_OFFSET = 528
const WLAN_INTF_OPCODE_INTERFACE_STATE = 6
const WLAN_INTF_OPCODE_CURRENT_CONNECTION = 7
const WLAN_INTERFACE_CONNECTED = 1
const WLAN_AVAILABLE_NETWORK_LIST_HEADER_BYTES = 8
const WLAN_AVAILABLE_NETWORK_BYTES = 628
const WLAN_AVAILABLE_NETWORK_PROFILE_NAME_OFFSET = 0
const WLAN_AVAILABLE_NETWORK_PROFILE_NAME_BYTES = 512
const WLAN_AVAILABLE_NETWORK_SSID_LENGTH_OFFSET = 512
const WLAN_AVAILABLE_NETWORK_SSID_OFFSET = 516
const WLAN_AVAILABLE_NETWORK_CONNECTABLE_OFFSET = 556
const WLAN_AVAILABLE_NETWORK_SIGNAL_OFFSET = 604
const WLAN_AVAILABLE_NETWORK_SECURITY_OFFSET = 608
const WLAN_AVAILABLE_NETWORK_AUTH_OFFSET = 612
const WLAN_AVAILABLE_NETWORK_CIPHER_OFFSET = 616
const WLAN_AVAILABLE_NETWORK_FLAGS_OFFSET = 620
const DOT11_SSID_MAX_BYTES = 32
const DOT11_BSS_TYPE_INFRASTRUCTURE = 1
const ERROR_SUCCESS = 0
const WLAN_INTERFACE_STATES = [
  'not-ready',
  'connected',
  'ad-hoc',
  'disconnecting',
  'disconnected',
  'associating',
  'discovering',
  'authenticating',
]

let wifiApi = null

function decodeUtf16(buffer, offset, length) {
  const field = buffer.subarray(offset, offset + length)
  let terminator = field.length
  for (let index = 0; index + 1 < field.length; index += 2) {
    if (field.readUInt16LE(index) === 0) {
      terminator = index
      break
    }
  }
  return field.subarray(0, terminator).toString('utf16le')
}

function decodeAvailableNetworks(buffer) {
  if (!buffer || buffer.length < WLAN_AVAILABLE_NETWORK_LIST_HEADER_BYTES) return []
  const count = buffer.readUInt32LE(0)
  const networks = []
  for (let index = 0; index < count; index += 1) {
    const base = WLAN_AVAILABLE_NETWORK_LIST_HEADER_BYTES + index * WLAN_AVAILABLE_NETWORK_BYTES
    if (base + WLAN_AVAILABLE_NETWORK_BYTES > buffer.length) break
    const ssidLength = Math.min(buffer.readUInt32LE(base + WLAN_AVAILABLE_NETWORK_SSID_LENGTH_OFFSET), DOT11_SSID_MAX_BYTES)
    const ssid = buffer.subarray(base + WLAN_AVAILABLE_NETWORK_SSID_OFFSET, base + WLAN_AVAILABLE_NETWORK_SSID_OFFSET + ssidLength).toString('utf8')
    const flags = buffer.readUInt32LE(base + WLAN_AVAILABLE_NETWORK_FLAGS_OFFSET)
    networks.push({
      profileName: decodeUtf16(buffer, base + WLAN_AVAILABLE_NETWORK_PROFILE_NAME_OFFSET, WLAN_AVAILABLE_NETWORK_PROFILE_NAME_BYTES),
      ssid,
      signal: buffer.readUInt32LE(base + WLAN_AVAILABLE_NETWORK_SIGNAL_OFFSET),
      connectable: buffer.readUInt32LE(base + WLAN_AVAILABLE_NETWORK_CONNECTABLE_OFFSET) !== 0,
      securityEnabled: buffer.readUInt32LE(base + WLAN_AVAILABLE_NETWORK_SECURITY_OFFSET) !== 0,
      authAlgorithm: buffer.readUInt32LE(base + WLAN_AVAILABLE_NETWORK_AUTH_OFFSET),
      cipherAlgorithm: buffer.readUInt32LE(base + WLAN_AVAILABLE_NETWORK_CIPHER_OFFSET),
      connected: (flags & 1) !== 0,
      hasProfile: (flags & 2) !== 0,
    })
  }
  return networks
}

function loadWifiApi() {
  if (wifiApi) return wifiApi
  const api = loadNativeApi()
  if (!api) return null
  try {
    const koffi = api.koffi
    const outVoidPointer = koffi.out(koffi.pointer(koffi.pointer('void')))
    const outUint32 = koffi.out(koffi.pointer('uint32'))
    const bytePointer = koffi.pointer('uint8')
    const connectionParameters = koffi.struct('WLAN_CONNECTION_PARAMETERS', {
      wlanConnectionMode: 'uint32',
      strProfile: 'str16',
      pDot11Ssid: 'void *',
      pDesiredBssidList: 'void *',
      dot11BssType: 'uint32',
      dwFlags: 'uint32',
    })
    wifiApi = {
      ...api,
      WlanGetAvailableNetworkList: api.wlanapi.func('__stdcall', 'WlanGetAvailableNetworkList', 'uint32', ['uintptr_t', bytePointer, 'uint32', 'uintptr_t', outVoidPointer]),
      WlanScan: api.wlanapi.func('__stdcall', 'WlanScan', 'uint32', ['uintptr_t', bytePointer, 'uintptr_t', 'uintptr_t', 'uintptr_t']),
      WlanSetProfile: api.wlanapi.func('__stdcall', 'WlanSetProfile', 'uint32', ['uintptr_t', bytePointer, 'uint32', 'str16', 'str16', 'int32', 'uintptr_t', outUint32]),
      WlanConnect: api.wlanapi.func('__stdcall', 'WlanConnect', 'uint32', ['uintptr_t', bytePointer, koffi.pointer(connectionParameters), 'uintptr_t']),
      WlanDisconnect: api.wlanapi.func('__stdcall', 'WlanDisconnect', 'uint32', ['uintptr_t', bytePointer, 'uintptr_t']),
      WlanDeleteProfile: api.wlanapi.func('__stdcall', 'WlanDeleteProfile', 'uint32', ['uintptr_t', bytePointer, 'str16', 'uintptr_t']),
      connectionParameters,
    }
  } catch (error) {
    console.error('[wifiNative] Wi-Fi API unavailable:', error.message)
    return null
  }
  return wifiApi
}

function callAsync(nativeFunction, ...args) {
  return new Promise((resolve) => {
    try {
      nativeFunction.async(...args, (error, result) => resolve(error ? null : result))
    } catch {
      resolve(null)
    }
  })
}

async function freeWlanMemory(api, pointer) {
  if (pointer) await callAsync(api.WlanFreeMemory, pointer)
}

async function queryInterface(api, client, guid, opcode) {
  const dataSize = [0]
  const data = [null]
  const status = await callAsync(api.WlanQueryInterface, client, guid, opcode, 0, dataSize, data, 0)
  if (status !== ERROR_SUCCESS || !data[0]) {
    await freeWlanMemory(api, data[0])
    return null
  }
  try {
    return bytesAt(api, data[0], 0, dataSize[0])
  } finally {
    await freeWlanMemory(api, data[0])
  }
}

async function selectInterface(api, client) {
  const list = [null]
  const status = await callAsync(api.WlanEnumInterfaces, client, 0, list)
  if (status !== ERROR_SUCCESS || !list[0]) {
    await freeWlanMemory(api, list[0])
    return null
  }
  try {
    const header = bytesAt(api, list[0], 0, WLAN_INTERFACE_LIST_HEADER_BYTES)
    const count = Math.min(header.readUInt32LE(0), 256)
    let fallback = null
    for (let index = 0; index < count; index += 1) {
      const rowOffset = WLAN_INTERFACE_LIST_HEADER_BYTES + index * WLAN_INTERFACE_INFO_BYTES
      const guid = bytesAt(api, list[0], rowOffset, WLAN_INTERFACE_GUID_BYTES)
      const stateBuffer = await queryInterface(api, client, guid, WLAN_INTF_OPCODE_INTERFACE_STATE)
      const state = stateBuffer && stateBuffer.length >= 4 ? stateBuffer.readUInt32LE(0) : null
      if (!fallback) fallback = { guid, state }
      if (state !== null && state !== 0) return { guid, state }
    }
    return fallback
  } finally {
    await freeWlanMemory(api, list[0])
  }
}

async function getClientAndInterface() {
  const api = loadWifiApi()
  if (!api) return null
  const client = await openWlanClientAsync(api)
  if (!client) return null
  const selectedInterface = await selectInterface(api, client)
  return selectedInterface ? { api, client, ...selectedInterface } : null
}

async function readAvailableNetworks() {
  try {
    const context = await getClientAndInterface()
    if (!context) return null
    const list = [null]
    const status = await callAsync(context.api.WlanGetAvailableNetworkList, context.client, context.guid, 0, 0, list)
    if (status !== ERROR_SUCCESS || !list[0]) {
      await freeWlanMemory(context.api, list[0])
      return null
    }
    try {
      const header = bytesAt(context.api, list[0], 0, WLAN_AVAILABLE_NETWORK_LIST_HEADER_BYTES)
      const count = Math.min(header.readUInt32LE(0), 65536)
      const length = WLAN_AVAILABLE_NETWORK_LIST_HEADER_BYTES + count * WLAN_AVAILABLE_NETWORK_BYTES
      return decodeAvailableNetworks(bytesAt(context.api, list[0], 0, length))
    } finally {
      await freeWlanMemory(context.api, list[0])
    }
  } catch {
    return null
  }
}

async function requestScan() {
  try {
    const context = await getClientAndInterface()
    if (!context) return null
    const status = await callAsync(context.api.WlanScan, context.client, context.guid, 0, 0, 0)
    return status === null ? null : status === ERROR_SUCCESS
  } catch {
    return null
  }
}

async function setProfile(xml) {
  try {
    const context = await getClientAndInterface()
    if (!context) return null
    const reasonCode = [0]
    const status = await callAsync(context.api.WlanSetProfile, context.client, context.guid, 0, xml, null, 1, 0, reasonCode)
    return status === null ? null : { ok: status === ERROR_SUCCESS, status, reasonCode: reasonCode[0] }
  } catch {
    return null
  }
}

async function connectProfile(profileName) {
  try {
    const context = await getClientAndInterface()
    if (!context) return null
    const parameters = {
      wlanConnectionMode: 0,
      strProfile: profileName,
      pDot11Ssid: null,
      pDesiredBssidList: null,
      dot11BssType: DOT11_BSS_TYPE_INFRASTRUCTURE,
      dwFlags: 0,
    }
    const status = await callAsync(context.api.WlanConnect, context.client, context.guid, parameters, 0)
    return status === null ? null : status === ERROR_SUCCESS
  } catch {
    return null
  }
}

async function disconnect() {
  try {
    const context = await getClientAndInterface()
    if (!context) return null
    const status = await callAsync(context.api.WlanDisconnect, context.client, context.guid, 0)
    return status === null ? null : status === ERROR_SUCCESS
  } catch {
    return null
  }
}

async function deleteProfile(profileName) {
  try {
    const context = await getClientAndInterface()
    if (!context) return null
    const status = await callAsync(context.api.WlanDeleteProfile, context.client, context.guid, profileName, 0)
    return status === null ? null : status === ERROR_SUCCESS
  } catch {
    return null
  }
}

async function readInterfaceState() {
  try {
    const context = await getClientAndInterface()
    if (!context || context.state === null || context.state >= WLAN_INTERFACE_STATES.length) return null
    const ssidBuffer = context.state === WLAN_INTERFACE_CONNECTED
      ? await queryInterface(context.api, context.client, context.guid, WLAN_INTF_OPCODE_CURRENT_CONNECTION)
      : null
    let ssid = null
    if (ssidBuffer && ssidBuffer.length >= 556) {
      const length = Math.min(ssidBuffer.readUInt32LE(520), DOT11_SSID_MAX_BYTES)
      if (length > 0) ssid = ssidBuffer.subarray(524, 524 + length).toString('utf8') || null
    }
    return { state: WLAN_INTERFACE_STATES[context.state], ssid }
  } catch {
    return null
  }
}

module.exports = {
  connectProfile,
  decodeAvailableNetworks,
  deleteProfile,
  disconnect,
  readAvailableNetworks,
  readInterfaceState,
  requestScan,
  setProfile,
}
