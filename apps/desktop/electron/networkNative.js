const WLAN_CLIENT_VERSION = 2
const WLAN_INTERFACE_LIST_HEADER_BYTES = 8
const WLAN_INTERFACE_INFO_BYTES = 532
const WLAN_INTERFACE_GUID_BYTES = 16
const WLAN_INTF_OPCODE_RADIO_STATE = 4
const WLAN_INTF_OPCODE_CURRENT_CONNECTION = 7
const WLAN_PHY_RADIO_STATE_BYTES = 12
const WLAN_PHY_COUNT_BYTES = 4
const DOT11_RADIO_STATE_OFF = 2
const CONNECTION_STATE_OFFSET = 0
const CONNECTION_SSID_LENGTH_OFFSET = 520
const CONNECTION_SSID_OFFSET = 524
const CONNECTION_SIGNAL_QUALITY_OFFSET = 576
const CONNECTION_STRUCT_MIN_BYTES = 580
const CONNECTION_BSSID_OFFSET = 560
const CONNECTION_PHY_TYPE_OFFSET = 568
const CONNECTION_RX_RATE_OFFSET = 580
const CONNECTION_TX_RATE_OFFSET = 584
const CONNECTION_SECURITY_ENABLED_OFFSET = 588
const CONNECTION_AUTH_ALGORITHM_OFFSET = 596
const CONNECTION_STRUCT_BYTES = 604
const DOT11_SSID_MAX_BYTES = 32
const DOT11_MAC_ADDRESS_BYTES = 6
const WLAN_INTERFACE_CONNECTED = 1
const WLAN_INTF_OPCODE_CHANNEL_NUMBER = 8
const WLAN_INTF_OPCODE_RSSI = 0x10000102
const DOT11_BSS_TYPE_ANY = 3
const BSS_LIST_HEADER_BYTES = 8
const BSS_ENTRY_BYTES = 360
const BSS_ENTRY_BSSID_OFFSET = 40
const BSS_ENTRY_RSSI_OFFSET = 56
const BSS_ENTRY_CENTER_FREQUENCY_OFFSET = 92

const MIB_IF_TABLE_HEADER_BYTES = 8
const MIB_IF_ROW_BYTES = 1352
const MIB_IF_ROW_TYPE_OFFSET = 1128
const MIB_IF_ROW_FLAGS_OFFSET = 1152
const MIB_IF_ROW_OPER_STATUS_OFFSET = 1156
const MIB_IF_ROW_MEDIA_CONNECT_STATE_OFFSET = 1164
const IF_TYPE_ETHERNET_CSMACD = 6
const IF_OPER_STATUS_UP = 1
const IF_MEDIA_CONNECT_STATE_CONNECTED = 1

const AF_UNSPEC = 0
const GAA_FLAG_SKIP_ALL_ADDRESSES = 0xf
const ADAPTER_IF_INDEX_OFFSET = 4
const ADAPTER_NEXT_OFFSET = 8
const ADAPTER_IF_TYPE_OFFSET = 100
const ADAPTER_OPER_STATUS_OFFSET = 104
const ADAPTER_STRUCT_MIN_BYTES = 108
const ADAPTER_INITIAL_BUFFER_BYTES = 32768
const ADAPTER_MAX_BUFFER_BYTES = 1048576
const ADAPTER_LIST_LIMIT = 512

const ERROR_SUCCESS = 0
const ERROR_BUFFER_OVERFLOW = 111

const DISCONNECTED_WIFI = { connected: false, ssid: null, signal: null }

let nativeApi = null
let nativeApiUnavailable = false
let wlanClientHandle = null
let wlanClientUnavailable = false
let wlanClientOpening = null
let wlanClientDisposeRequested = false
let adapterBuffer = null

function loadNativeApi() {
  if (nativeApi || nativeApiUnavailable) return nativeApi
  try {
    const koffi = require('koffi')
    const wlanapi = koffi.load('wlanapi.dll')
    const iphlpapi = koffi.load('iphlpapi.dll')
    const bytePointer = koffi.pointer('uint8')
    const outVoidPointer = koffi.out(koffi.pointer(koffi.pointer('void')))
    nativeApi = {
      koffi,
      wlanapi,
      WlanOpenHandle: wlanapi.func('__stdcall', 'WlanOpenHandle', 'uint32', ['uint32', 'uintptr_t', koffi.out(koffi.pointer('uint32')), koffi.out(koffi.pointer('uintptr_t'))]),
      WlanCloseHandle: wlanapi.func('__stdcall', 'WlanCloseHandle', 'uint32', ['uintptr_t', 'uintptr_t']),
      WlanEnumInterfaces: wlanapi.func('__stdcall', 'WlanEnumInterfaces', 'uint32', ['uintptr_t', 'uintptr_t', outVoidPointer]),
      WlanQueryInterface: wlanapi.func('__stdcall', 'WlanQueryInterface', 'uint32', ['uintptr_t', bytePointer, 'int32', 'uintptr_t', koffi.out(koffi.pointer('uint32')), outVoidPointer, 'uintptr_t']),
      WlanFreeMemory: wlanapi.func('__stdcall', 'WlanFreeMemory', 'void', ['void *']),
      WlanGetNetworkBssList: wlanapi.func('__stdcall', 'WlanGetNetworkBssList', 'uint32', ['uintptr_t', bytePointer, 'uintptr_t', 'int32', 'int32', 'uintptr_t', outVoidPointer]),
      GetIfTable2: iphlpapi.func('__stdcall', 'GetIfTable2', 'uint32', [outVoidPointer]),
      FreeMibTable: iphlpapi.func('__stdcall', 'FreeMibTable', 'void', ['void *']),
      GetAdaptersAddresses: iphlpapi.func('__stdcall', 'GetAdaptersAddresses', 'uint32', ['uint32', 'uint32', 'uintptr_t', 'void *', koffi.inout(koffi.pointer('uint32'))]),
    }
  } catch (e) {
    nativeApiUnavailable = true
    console.error('[networkNative] native network API unavailable:', e.message)
  }
  return nativeApi
}

function openWlanClient(api) {
  if (wlanClientHandle !== null || wlanClientUnavailable) return wlanClientHandle
  if (wlanClientOpening) return null
  const negotiatedVersion = [0]
  const handle = [0]
  if (api.WlanOpenHandle(WLAN_CLIENT_VERSION, 0, negotiatedVersion, handle) !== ERROR_SUCCESS || !handle[0]) {
    wlanClientUnavailable = true
    console.error('[networkNative] WlanOpenHandle failed, Wi-Fi state falls back to PowerShell')
    return null
  }
  wlanClientHandle = handle[0]
  return wlanClientHandle
}

function openWlanClientAsync(api) {
  if (wlanClientHandle !== null || wlanClientUnavailable) return Promise.resolve(wlanClientHandle)
  if (wlanClientOpening) return wlanClientOpening
  const negotiatedVersion = [0]
  const handle = [0]
  const opening = new Promise((resolve) => {
    try {
      api.WlanOpenHandle.async(WLAN_CLIENT_VERSION, 0, negotiatedVersion, handle, (error, status) => {
        if (error || status !== ERROR_SUCCESS || !handle[0]) {
          wlanClientUnavailable = true
          console.error('[networkNative] WlanOpenHandle failed, Wi-Fi state falls back to PowerShell')
          resolve(null)
          return
        }
        wlanClientHandle = handle[0]
        if (wlanClientDisposeRequested) {
          api.WlanCloseHandle(wlanClientHandle, 0)
          wlanClientHandle = null
          wlanClientDisposeRequested = false
        }
        resolve(wlanClientHandle)
      })
    } catch (error) {
      wlanClientUnavailable = true
      console.error('[networkNative] WlanOpenHandle failed, Wi-Fi state falls back to PowerShell:', error.message)
      resolve(null)
    }
  })
  wlanClientOpening = opening
  return opening.then((client) => {
    if (wlanClientOpening === opening) wlanClientOpening = null
    return client
  })
}

function bytesAt(api, pointer, offset, length) {
  return Buffer.from(api.koffi.decode(pointer, offset, api.koffi.array('uint8', length, 'Typed')).buffer)
}

function decodeSsid(buffer) {
  const length = Math.min(buffer.readUInt32LE(CONNECTION_SSID_LENGTH_OFFSET), DOT11_SSID_MAX_BYTES)
  if (length === 0) return null
  return buffer.subarray(CONNECTION_SSID_OFFSET, CONNECTION_SSID_OFFSET + length).toString('utf8') || null
}

function decodeRadioState(buffer) {
  const physicalLayers = buffer.readUInt32LE(0)
  if (physicalLayers === 0) return 'unavailable'
  for (let index = 0; index < physicalLayers; index += 1) {
    const base = WLAN_PHY_COUNT_BYTES + index * WLAN_PHY_RADIO_STATE_BYTES
    if (base + WLAN_PHY_RADIO_STATE_BYTES > buffer.length) return 'unavailable'
    const softwareState = buffer.readUInt32LE(base + 4)
    const hardwareState = buffer.readUInt32LE(base + 8)
    if (softwareState === DOT11_RADIO_STATE_OFF || hardwareState === DOT11_RADIO_STATE_OFF) return 'off'
  }
  return 'on'
}

function decodeConnection(buffer) {
  if (buffer.length < CONNECTION_STRUCT_MIN_BYTES) return null
  if (buffer.readUInt32LE(CONNECTION_STATE_OFFSET) !== WLAN_INTERFACE_CONNECTED) return null
  return {
    connected: true,
    ssid: decodeSsid(buffer),
    signal: buffer.readUInt32LE(CONNECTION_SIGNAL_QUALITY_OFFSET),
  }
}

function formatMacAddress(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0').toUpperCase()).join(':')
}

function decodeConnectionDetails(buffer) {
  if (buffer.length < CONNECTION_STRUCT_BYTES) return null
  if (buffer.readUInt32LE(CONNECTION_STATE_OFFSET) !== WLAN_INTERFACE_CONNECTED) return null
  return {
    ssid: decodeSsid(buffer),
    bssid: formatMacAddress(buffer.subarray(CONNECTION_BSSID_OFFSET, CONNECTION_BSSID_OFFSET + DOT11_MAC_ADDRESS_BYTES)),
    phyType: buffer.readUInt32LE(CONNECTION_PHY_TYPE_OFFSET),
    signalPercent: buffer.readUInt32LE(CONNECTION_SIGNAL_QUALITY_OFFSET),
    receiveRateKbps: buffer.readUInt32LE(CONNECTION_RX_RATE_OFFSET),
    transmitRateKbps: buffer.readUInt32LE(CONNECTION_TX_RATE_OFFSET),
    securityEnabled: buffer.readUInt32LE(CONNECTION_SECURITY_ENABLED_OFFSET) !== 0,
    authAlgorithm: buffer.readUInt32LE(CONNECTION_AUTH_ALGORITHM_OFFSET),
  }
}

function decodeBssEntry(buffer, bssid) {
  const count = buffer.readUInt32LE(4)
  for (let index = 0; index < count; index += 1) {
    const base = BSS_LIST_HEADER_BYTES + index * BSS_ENTRY_BYTES
    if (base + BSS_ENTRY_BYTES > buffer.length) return null
    const entryBssid = formatMacAddress(buffer.subarray(base + BSS_ENTRY_BSSID_OFFSET, base + BSS_ENTRY_BSSID_OFFSET + DOT11_MAC_ADDRESS_BYTES))
    if (entryBssid !== bssid) continue
    return {
      rssiDbm: buffer.readInt32LE(base + BSS_ENTRY_RSSI_OFFSET),
      centerFrequencyKhz: buffer.readUInt32LE(base + BSS_ENTRY_CENTER_FREQUENCY_OFFSET),
    }
  }
  return null
}

function decodeWiredConnection(tableBuffer) {
  if (!tableBuffer || tableBuffer.length < MIB_IF_TABLE_HEADER_BYTES) return { connected: false }
  const count = tableBuffer.readUInt32LE(0)
  for (let index = 0; index < count; index += 1) {
    const base = MIB_IF_TABLE_HEADER_BYTES + index * MIB_IF_ROW_BYTES
    if (base + MIB_IF_ROW_BYTES > tableBuffer.length) break
    const flags = tableBuffer.readUInt8(base + MIB_IF_ROW_FLAGS_OFFSET)
    if (
      tableBuffer.readUInt32LE(base + MIB_IF_ROW_TYPE_OFFSET) === IF_TYPE_ETHERNET_CSMACD &&
      (flags & 1) !== 0 &&
      (flags & 4) !== 0 &&
      tableBuffer.readUInt32LE(base + MIB_IF_ROW_OPER_STATUS_OFFSET) === IF_OPER_STATUS_UP &&
      tableBuffer.readUInt32LE(base + MIB_IF_ROW_MEDIA_CONNECT_STATE_OFFSET) === IF_MEDIA_CONNECT_STATE_CONNECTED
    ) return { connected: true }
  }
  return { connected: false }
}

function callOffThread(nativeFunction, ...args) {
  return new Promise((resolve) => {
    nativeFunction.async(...args, (error, status) => resolve(error ? null : status))
  })
}

async function readWiredConnection() {
  const api = loadNativeApi()
  if (!api) return null
  const table = [null]
  const status = await callOffThread(api.GetIfTable2, table)
  if (!table[0]) return null
  try {
    if (status !== ERROR_SUCCESS) return null
    const tableBuffer = bytesAt(api, table[0], 0, MIB_IF_TABLE_HEADER_BYTES)
    const count = tableBuffer.readUInt32LE(0)
    const fullTable = bytesAt(api, table[0], 0, MIB_IF_TABLE_HEADER_BYTES + count * MIB_IF_ROW_BYTES)
    return decodeWiredConnection(fullTable)
  } finally {
    api.FreeMibTable(table[0])
  }
}

async function overWlanInterfacesOffThread(visit) {
  const api = loadNativeApi()
  if (!api) return null
  const client = openWlanClient(api)
  if (!client) return null
  const interfaceList = [null]
  if (await callOffThread(api.WlanEnumInterfaces, client, 0, interfaceList) !== ERROR_SUCCESS) return null
  try {
    const count = bytesAt(api, interfaceList[0], 0, WLAN_INTERFACE_LIST_HEADER_BYTES).readUInt32LE(0)
    for (let index = 0; index < count; index += 1) {
      const guidOffset = WLAN_INTERFACE_LIST_HEADER_BYTES + index * WLAN_INTERFACE_INFO_BYTES
      const guid = bytesAt(api, interfaceList[0], guidOffset, WLAN_INTERFACE_GUID_BYTES)
      const found = await visit(api, client, guid)
      if (found !== null) return found
    }
    return undefined
  } finally {
    api.WlanFreeMemory(interfaceList[0])
  }
}

async function readRadioStateOfInterface(api, client, guid) {
  const buffer = await queryInterfaceBuffer(api, client, guid, WLAN_INTF_OPCODE_RADIO_STATE)
  if (!buffer || buffer.length < WLAN_PHY_COUNT_BYTES) return null
  const decoded = decodeRadioState(buffer)
  return decoded === 'unavailable' ? null : decoded
}

async function readWifiRadioState() {
  const state = await overWlanInterfacesOffThread(readRadioStateOfInterface)
  if (state === null) return null
  return state === undefined ? 'unavailable' : state
}

function queryInterfaceOffThread(api, client, interfaceGuid, opCode, dataSize, data) {
  return new Promise((resolve) => {
    api.WlanQueryInterface.async(client, interfaceGuid, opCode, 0, dataSize, data, 0, (error, status) =>
      resolve(error ? null : status)
    )
  })
}

async function readWifiConnection() {
  const api = loadNativeApi()
  if (!api) return null
  const client = openWlanClient(api)
  if (!client) return null
  const interfaceList = [null]
  if (api.WlanEnumInterfaces(client, 0, interfaceList) !== ERROR_SUCCESS) return null
  try {
    const count = bytesAt(api, interfaceList[0], 0, WLAN_INTERFACE_LIST_HEADER_BYTES).readUInt32LE(0)
    for (let index = 0; index < count; index += 1) {
      const guidOffset = WLAN_INTERFACE_LIST_HEADER_BYTES + index * WLAN_INTERFACE_INFO_BYTES
      const guid = bytesAt(api, interfaceList[0], guidOffset, WLAN_INTERFACE_GUID_BYTES)
      const dataSize = [0]
      const data = [null]
      const status = await queryInterfaceOffThread(api, client, guid, WLAN_INTF_OPCODE_CURRENT_CONNECTION, dataSize, data)
      if (status !== ERROR_SUCCESS) continue
      try {
        const connection = decodeConnection(bytesAt(api, data[0], 0, dataSize[0]))
        if (connection) return connection
      } finally {
        api.WlanFreeMemory(data[0])
      }
    }
    return DISCONNECTED_WIFI
  } finally {
    api.WlanFreeMemory(interfaceList[0])
  }
}

async function queryInterfaceBuffer(api, client, interfaceGuid, opCode) {
  const dataSize = [0]
  const data = [null]
  const status = await queryInterfaceOffThread(api, client, interfaceGuid, opCode, dataSize, data)
  if (status !== ERROR_SUCCESS) return null
  try {
    return bytesAt(api, data[0], 0, dataSize[0])
  } finally {
    api.WlanFreeMemory(data[0])
  }
}

function readBssList(api, client, interfaceGuid) {
  return new Promise((resolve) => {
    const list = [null]
    api.WlanGetNetworkBssList.async(client, interfaceGuid, 0, DOT11_BSS_TYPE_ANY, 0, 0, list, (error, status) => {
      if (error || status !== ERROR_SUCCESS || !list[0]) return resolve(null)
      try {
        const totalSize = bytesAt(api, list[0], 0, 4).readUInt32LE(0)
        resolve(bytesAt(api, list[0], 0, totalSize))
      } finally {
        api.WlanFreeMemory(list[0])
      }
    })
  })
}

async function readLinkOfInterface(api, client, guid) {
  const connectionBuffer = await queryInterfaceBuffer(api, client, guid, WLAN_INTF_OPCODE_CURRENT_CONNECTION)
  const connection = connectionBuffer && decodeConnectionDetails(connectionBuffer)
  if (!connection) return null
  const channelBuffer = await queryInterfaceBuffer(api, client, guid, WLAN_INTF_OPCODE_CHANNEL_NUMBER)
  const rssiBuffer = await queryInterfaceBuffer(api, client, guid, WLAN_INTF_OPCODE_RSSI)
  const bssList = await readBssList(api, client, guid)
  const bss = bssList && decodeBssEntry(bssList, connection.bssid)
  return {
    ...connection,
    channel: channelBuffer && channelBuffer.length >= 4 ? channelBuffer.readUInt32LE(0) : null,
    rssiDbm: rssiBuffer && rssiBuffer.length >= 4 ? rssiBuffer.readInt32LE(0) : (bss?.rssiDbm ?? null),
    centerFrequencyKhz: bss?.centerFrequencyKhz ?? null,
  }
}

async function readWifiLink() {
  const api = loadNativeApi()
  if (!api) return null
  const client = openWlanClient(api)
  if (!client) return null
  const interfaceList = [null]
  if (api.WlanEnumInterfaces(client, 0, interfaceList) !== ERROR_SUCCESS) return null
  try {
    const count = bytesAt(api, interfaceList[0], 0, WLAN_INTERFACE_LIST_HEADER_BYTES).readUInt32LE(0)
    for (let index = 0; index < count; index += 1) {
      const guidOffset = WLAN_INTERFACE_LIST_HEADER_BYTES + index * WLAN_INTERFACE_INFO_BYTES
      const guid = bytesAt(api, interfaceList[0], guidOffset, WLAN_INTERFACE_GUID_BYTES)
      const link = await readLinkOfInterface(api, client, guid)
      if (link) return link
    }
    return null
  } finally {
    api.WlanFreeMemory(interfaceList[0])
  }
}

function buildInterfaceGeneration(entries) {
  return entries
    .map(({ ifIndex, ifType, operStatus }) => `${ifIndex}:${ifType}:${operStatus}`)
    .sort()
    .join('|')
}

function walkAdapterBuffer(api, buffer) {
  const base = BigInt(api.koffi.address(buffer))
  const entries = []
  let offset = 0
  for (let guard = 0; guard < ADAPTER_LIST_LIMIT; guard += 1) {
    if (offset < 0 || offset + ADAPTER_STRUCT_MIN_BYTES > buffer.length) return null
    entries.push({
      ifIndex: buffer.readUInt32LE(offset + ADAPTER_IF_INDEX_OFFSET),
      ifType: buffer.readUInt32LE(offset + ADAPTER_IF_TYPE_OFFSET),
      operStatus: buffer.readUInt32LE(offset + ADAPTER_OPER_STATUS_OFFSET),
    })
    const next = buffer.readBigUInt64LE(offset + ADAPTER_NEXT_OFFSET)
    if (next === 0n) return entries
    offset = Number(next - base)
  }
  return null
}

function adapterBufferOfAtLeast(capacity) {
  if (!adapterBuffer || adapterBuffer.length < capacity) adapterBuffer = Buffer.alloc(capacity)
  return adapterBuffer
}

function readInterfaceGeneration() {
  const api = loadNativeApi()
  if (!api) return null
  let capacity = ADAPTER_INITIAL_BUFFER_BYTES
  while (capacity <= ADAPTER_MAX_BUFFER_BYTES) {
    const buffer = adapterBufferOfAtLeast(capacity)
    const requiredBytes = [buffer.length]
    const status = api.GetAdaptersAddresses(AF_UNSPEC, GAA_FLAG_SKIP_ALL_ADDRESSES, 0, buffer, requiredBytes)
    if (status === ERROR_BUFFER_OVERFLOW) {
      capacity = Math.max(requiredBytes[0], buffer.length * 2)
      continue
    }
    if (status !== ERROR_SUCCESS) return null
    const entries = walkAdapterBuffer(api, buffer)
    return entries ? buildInterfaceGeneration(entries) : null
  }
  return null
}

function disposeNetworkNative() {
  if (wlanClientHandle === null) {
    if (wlanClientOpening) wlanClientDisposeRequested = true
    return
  }
  const api = loadNativeApi()
  if (api) api.WlanCloseHandle(wlanClientHandle, 0)
  wlanClientHandle = null
}

module.exports = {
  buildInterfaceGeneration,
  bytesAt,
  decodeBssEntry,
  decodeConnection,
  decodeConnectionDetails,
  decodeRadioState,
  decodeSsid,
  decodeWiredConnection,
  disposeNetworkNative,
  loadNativeApi,
  openWlanClient,
  openWlanClientAsync,
  readInterfaceGeneration,
  readWiredConnection,
  readWifiConnection,
  readWifiLink,
  readWifiRadioState,
}
