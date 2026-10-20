const CR_SUCCESS = 0
const CR_BUFFER_SMALL = 0x1a
const CM_GETIDLIST_FILTER_ENUMERATOR = 0x1
const CM_GETIDLIST_FILTER_PRESENT = 0x100
const CM_GET_DEVICE_INTERFACE_LIST_PRESENT = 0
const CM_LOCATE_DEVNODE_NORMAL = 0
const MAX_DEVICE_ID_CHARS = 512
const MAX_CHILD_NODES = 32
const PROPERTY_BUFFER_BYTES = 512
const DEVPROP_TYPE_GUID = 0x0d
const DEVPROP_TYPE_STRING = 0x12
const CLASSIC_ENUMERATOR = 'BTHENUM'
const LE_ENUMERATOR = 'BTHLE'
const STACK_ENUMERATOR = 'BTH'
const DEVICE_NODE_PATTERN = /^(BTHENUM|BTHLE)\\DEV_/i
const BTH_ADDRESS_PATTERN = /^[0-9a-f]{12}$/i

const GENERIC_READ = 0x80000000
const GENERIC_WRITE = 0x40000000
const FILE_SHARE_READ = 0x1
const FILE_SHARE_WRITE = 0x2
const OPEN_EXISTING = 3
const FILE_FLAG_OVERLAPPED = 0x40000000
const INVALID_HANDLE_VALUE = -1
const ERROR_IO_PENDING = 997
const WAIT_TIMEOUT = 258
const CANCEL_WAIT_MS = 2000
const OVERLAPPED_BYTES = 32
const OVERLAPPED_EVENT_OFFSET = 24

const FILE_DEVICE_KS = 0x2f
const FILE_DEVICE_BLUETOOTH = 0x41
const METHOD_BUFFERED = 0
const METHOD_NEITHER = 3
const FILE_ANY_ACCESS = 0
const KSPROPERTY_BYTES = 24
const KSPROPERTY_TYPE_GET = 0x1
const KS_ONESHOT_PROPERTY_IDS = { reconnect: 0, disconnect: 1 }
const BTH_ADDR_BYTES = 8

const KSPROPSETID_BT_AUDIO = '{7fa06c40-b8f6-4c7e-8556-e8c33a12e54d}'
const KSCATEGORY_AUDIO = '{6994ad04-93ef-11d0-a3cc-00a0c9223196}'
const GUID_BTHPORT_DEVICE_INTERFACE = '{0850302a-b344-4fda-9be9-90576b8d46f0}'
const DEVPKEY_DEVICE_FRIENDLY_NAME = { guid: '{a45c254e-df1c-4efd-8020-67d146a850e0}', pid: 14 }
const DEVPKEY_DEVICE_CONTAINER_ID = { guid: '{8c7ed206-3f8a-4827-b3ab-ae9e1faefc6c}', pid: 2 }
const DEVPKEY_DEVICE_CLASS_GUID = { guid: '{a45c254e-df1c-4efd-8020-67d146a850e0}', pid: 10 }
const DEVPKEY_BLUETOOTH_CLASS_OF_DEVICE = { guid: '{2bd67d8b-8beb-48d5-87e0-6cda3428040a}', pid: 10 }
const DEVPROP_TYPE_UINT32 = 0x07
const DESCENDANT_CLASS_DEPTH = 3

function controlCode(deviceType, functionCode, method, access) {
  return ((deviceType << 16) | (access << 14) | (functionCode << 2) | method) >>> 0
}

const IOCTL_KS_PROPERTY = controlCode(FILE_DEVICE_KS, 0, METHOD_NEITHER, FILE_ANY_ACCESS)
const IOCTL_BTH_DISCONNECT_DEVICE = controlCode(FILE_DEVICE_BLUETOOTH, 3, METHOD_BUFFERED, FILE_ANY_ACCESS)

function encodeGuid(text) {
  const hex = String(text).replace(/[{}-]/g, '')
  if (!/^[0-9a-f]{32}$/i.test(hex)) throw new Error(`not a guid: ${text}`)
  const buffer = Buffer.alloc(16)
  buffer.writeUInt32LE(parseInt(hex.slice(0, 8), 16), 0)
  buffer.writeUInt16LE(parseInt(hex.slice(8, 12), 16), 4)
  buffer.writeUInt16LE(parseInt(hex.slice(12, 16), 16), 6)
  Buffer.from(hex.slice(16), 'hex').copy(buffer, 8)
  return buffer
}

function decodeGuid(buffer, offset = 0) {
  if (!buffer || buffer.length < offset + 16) return null
  const hex = (value, width) => value.toString(16).padStart(width, '0')
  const tail = buffer.subarray(offset + 8, offset + 16).toString('hex')
  return `{${hex(buffer.readUInt32LE(offset), 8)}-${hex(buffer.readUInt16LE(offset + 4), 4)}-${hex(buffer.readUInt16LE(offset + 6), 4)}-${tail.slice(0, 4)}-${tail.slice(4)}}`
}

function propertyKeyBuffer({ guid, pid }) {
  const buffer = Buffer.alloc(20)
  encodeGuid(guid).copy(buffer, 0)
  buffer.writeUInt32LE(pid, 16)
  return buffer
}

function decodeMultiSz(buffer) {
  return buffer.toString('utf16le').split('\0').filter(Boolean)
}

function decodeDevpropString(buffer) {
  const text = buffer.toString('utf16le')
  const end = text.indexOf('\0')
  return end === -1 ? text : text.slice(0, end)
}

function encodeKsProperty(setGuid, propertyId, flags) {
  const buffer = Buffer.alloc(KSPROPERTY_BYTES)
  encodeGuid(setGuid).copy(buffer, 0)
  buffer.writeUInt32LE(propertyId, 16)
  buffer.writeUInt32LE(flags, 20)
  return buffer
}

function encodeBthAddress(address) {
  if (!BTH_ADDRESS_PATTERN.test(String(address))) throw new Error(`not a Bluetooth address: ${address}`)
  const buffer = Buffer.alloc(BTH_ADDR_BYTES)
  buffer.writeBigUInt64LE(BigInt(`0x${address}`), 0)
  return buffer
}

const FRIENDLY_NAME_KEY = propertyKeyBuffer(DEVPKEY_DEVICE_FRIENDLY_NAME)
const CONTAINER_ID_KEY = propertyKeyBuffer(DEVPKEY_DEVICE_CONTAINER_ID)
const CLASS_GUID_KEY = propertyKeyBuffer(DEVPKEY_DEVICE_CLASS_GUID)
const CLASS_OF_DEVICE_KEY = propertyKeyBuffer(DEVPKEY_BLUETOOTH_CLASS_OF_DEVICE)
const KSCATEGORY_AUDIO_GUID = encodeGuid(KSCATEGORY_AUDIO)
const BTHPORT_INTERFACE_GUID = encodeGuid(GUID_BTHPORT_DEVICE_INTERFACE)

let nativeApi = null
let nativeApiUnavailable = false
const abandonedRequests = []

function bindApi(koffi) {
  const cfgmgr32 = koffi.load('cfgmgr32.dll')
  const kernel32 = koffi.load('kernel32.dll')
  const outUint32 = koffi.out(koffi.pointer('uint32'))
  return {
    koffi,
    CM_Get_Device_ID_List_SizeW: cfgmgr32.func('__stdcall', 'CM_Get_Device_ID_List_SizeW', 'uint32', [outUint32, 'str16', 'uint32']),
    CM_Get_Device_ID_ListW: cfgmgr32.func('__stdcall', 'CM_Get_Device_ID_ListW', 'uint32', ['str16', 'void *', 'uint32', 'uint32']),
    CM_Locate_DevNodeW: cfgmgr32.func('__stdcall', 'CM_Locate_DevNodeW', 'uint32', [outUint32, 'str16', 'uint32']),
    CM_Get_DevNode_Status: cfgmgr32.func('__stdcall', 'CM_Get_DevNode_Status', 'uint32', [outUint32, outUint32, 'uint32', 'uint32']),
    CM_Get_DevNode_PropertyW: cfgmgr32.func('__stdcall', 'CM_Get_DevNode_PropertyW', 'uint32', ['uint32', 'void *', outUint32, 'void *', koffi.inout(koffi.pointer('uint32')), 'uint32']),
    CM_Get_Device_Interface_List_SizeW: cfgmgr32.func('__stdcall', 'CM_Get_Device_Interface_List_SizeW', 'uint32', [outUint32, 'void *', 'str16', 'uint32']),
    CM_Get_Device_Interface_ListW: cfgmgr32.func('__stdcall', 'CM_Get_Device_Interface_ListW', 'uint32', ['void *', 'str16', 'void *', 'uint32', 'uint32']),
    CM_Get_Child: cfgmgr32.func('__stdcall', 'CM_Get_Child', 'uint32', [outUint32, 'uint32', 'uint32']),
    CM_Get_Sibling: cfgmgr32.func('__stdcall', 'CM_Get_Sibling', 'uint32', [outUint32, 'uint32', 'uint32']),
    CM_Get_Device_IDW: cfgmgr32.func('__stdcall', 'CM_Get_Device_IDW', 'uint32', ['uint32', 'void *', 'uint32', 'uint32']),
    CreateFileW: kernel32.func('__stdcall', 'CreateFileW', 'intptr_t', ['str16', 'uint32', 'uint32', 'void *', 'uint32', 'uint32', 'intptr_t']),
    CreateEventW: kernel32.func('__stdcall', 'CreateEventW', 'intptr_t', ['void *', 'int', 'int', 'void *']),
    DeviceIoControl: kernel32.func('__stdcall', 'DeviceIoControl', 'int', ['intptr_t', 'uint32', 'uintptr_t', 'uint32', 'uintptr_t', 'uint32', 'void *', 'uintptr_t']),
    GetOverlappedResultEx: kernel32.func('__stdcall', 'GetOverlappedResultEx', 'int', ['intptr_t', 'uintptr_t', outUint32, 'uint32', 'int']),
    CancelIoEx: kernel32.func('__stdcall', 'CancelIoEx', 'int', ['intptr_t', 'uintptr_t']),
    CloseHandle: kernel32.func('__stdcall', 'CloseHandle', 'int', ['intptr_t']),
    GetLastError: kernel32.func('__stdcall', 'GetLastError', 'uint32', []),
  }
}

function loadNativeApi() {
  if (nativeApi || nativeApiUnavailable) return nativeApi
  try {
    nativeApi = bindApi(require('koffi'))
  } catch (e) {
    nativeApiUnavailable = true
    console.error('[bluetoothNative] native Bluetooth API unavailable:', e?.message ?? e)
  }
  return nativeApi
}

function listPresentIds(api, enumerator) {
  const flags = CM_GETIDLIST_FILTER_ENUMERATOR | CM_GETIDLIST_FILTER_PRESENT
  const length = [0]
  if (api.CM_Get_Device_ID_List_SizeW(length, enumerator, flags) !== CR_SUCCESS) return null
  const buffer = Buffer.alloc(length[0] * 2)
  if (api.CM_Get_Device_ID_ListW(enumerator, buffer, length[0], flags) !== CR_SUCCESS) return null
  return decodeMultiSz(buffer)
}

function locateDevNode(api, instanceId) {
  const devInst = [0]
  return api.CM_Locate_DevNodeW(devInst, instanceId, CM_LOCATE_DEVNODE_NORMAL) === CR_SUCCESS ? devInst[0] : null
}

function readNodeStatus(api, devInst) {
  const status = [0]
  const problem = [0]
  if (api.CM_Get_DevNode_Status(status, problem, devInst, 0) !== CR_SUCCESS) return null
  return { status: status[0], problem: problem[0] }
}

function readPropertyBytes(api, devInst, key) {
  let capacity = PROPERTY_BUFFER_BYTES
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const buffer = Buffer.alloc(capacity)
    const type = [0]
    const size = [capacity]
    const result = api.CM_Get_DevNode_PropertyW(devInst, key, type, buffer, size, 0)
    if (result === CR_SUCCESS) return { type: type[0], bytes: buffer.subarray(0, size[0]) }
    if (result !== CR_BUFFER_SMALL) return null
    capacity = size[0]
  }
  return null
}

function readStringProperty(api, devInst, key) {
  const property = readPropertyBytes(api, devInst, key)
  return property?.type === DEVPROP_TYPE_STRING ? decodeDevpropString(property.bytes) : null
}

function readGuidProperty(api, devInst, key) {
  const property = readPropertyBytes(api, devInst, key)
  return property?.type === DEVPROP_TYPE_GUID ? decodeGuid(property.bytes) : null
}

function readUint32Property(api, devInst, key) {
  const property = readPropertyBytes(api, devInst, key)
  return property?.type === DEVPROP_TYPE_UINT32 && property.bytes.length >= 4 ? property.bytes.readUInt32LE(0) : null
}

function childDevInsts(api, devInst) {
  const children = []
  const child = [0]
  if (api.CM_Get_Child(child, devInst, 0) !== CR_SUCCESS) return children
  let current = child[0]
  for (let guard = 0; current && guard < MAX_CHILD_NODES; guard += 1) {
    children.push(current)
    const sibling = [0]
    if (api.CM_Get_Sibling(sibling, current, 0) !== CR_SUCCESS) break
    current = sibling[0]
  }
  return children
}

function descendantClassGuids(api, devInst) {
  const classes = new Set()
  let generation = [devInst]
  for (let depth = 0; depth < DESCENDANT_CLASS_DEPTH && generation.length > 0; depth += 1) {
    generation = generation.flatMap((parent) => childDevInsts(api, parent))
    for (const descendant of generation) {
      const classGuid = readGuidProperty(api, descendant, CLASS_GUID_KEY)
      if (classGuid) classes.add(classGuid.toLowerCase())
    }
  }
  return [...classes]
}

function readNode(api, instanceId) {
  const devInst = locateDevNode(api, instanceId)
  if (devInst === null) return null
  const status = readNodeStatus(api, devInst)
  if (!status) return null
  if (!DEVICE_NODE_PATTERN.test(instanceId)) return { instanceId, ...status }
  return {
    instanceId,
    ...status,
    name: readStringProperty(api, devInst, FRIENDLY_NAME_KEY),
    containerId: readGuidProperty(api, devInst, CONTAINER_ID_KEY),
    classOfDevice: readUint32Property(api, devInst, CLASS_OF_DEVICE_KEY),
    childClasses: descendantClassGuids(api, devInst),
  }
}

function readBluetoothNodes() {
  const api = loadNativeApi()
  if (!api) return null
  const classicIds = listPresentIds(api, CLASSIC_ENUMERATOR)
  const leIds = listPresentIds(api, LE_ENUMERATOR)
  const stackIds = listPresentIds(api, STACK_ENUMERATOR)
  if (!classicIds || !leIds || !stackIds) return null
  const nodes = [...classicIds, ...leIds].map((instanceId) => readNode(api, instanceId)).filter(Boolean)
  return { nodes, stackIds }
}

function listInterfacePaths(api, classGuid, instanceId) {
  const length = [0]
  if (api.CM_Get_Device_Interface_List_SizeW(length, classGuid, instanceId, CM_GET_DEVICE_INTERFACE_LIST_PRESENT) !== CR_SUCCESS) return []
  if (length[0] <= 1) return []
  const buffer = Buffer.alloc(length[0] * 2)
  if (api.CM_Get_Device_Interface_ListW(classGuid, instanceId, buffer, length[0], CM_GET_DEVICE_INTERFACE_LIST_PRESENT) !== CR_SUCCESS) return []
  return decodeMultiSz(buffer)
}

function readDeviceId(api, devInst) {
  const buffer = Buffer.alloc(MAX_DEVICE_ID_CHARS * 2)
  if (api.CM_Get_Device_IDW(devInst, buffer, MAX_DEVICE_ID_CHARS, 0) !== CR_SUCCESS) return null
  return decodeDevpropString(buffer)
}

function childInstanceIds(api, devInst) {
  const ids = []
  const child = [0]
  if (api.CM_Get_Child(child, devInst, 0) !== CR_SUCCESS) return ids
  let current = child[0]
  for (let guard = 0; current && guard < MAX_CHILD_NODES; guard += 1) {
    const id = readDeviceId(api, current)
    if (id) ids.push(id)
    const sibling = [0]
    if (api.CM_Get_Sibling(sibling, current, 0) !== CR_SUCCESS) break
    current = sibling[0]
  }
  return ids
}

function audioFilterPathsOf(api, instanceId) {
  const own = listInterfacePaths(api, KSCATEGORY_AUDIO_GUID, instanceId)
  const devInst = locateDevNode(api, instanceId)
  if (devInst === null) return own
  const children = childInstanceIds(api, devInst).flatMap((childId) => listInterfacePaths(api, KSCATEGORY_AUDIO_GUID, childId))
  return [...own, ...children]
}

function findAudioFilterPaths(serviceNodeIds) {
  const api = loadNativeApi()
  if (!api) return null
  return [...new Set(serviceNodeIds.flatMap((instanceId) => audioFilterPathsOf(api, instanceId)))]
}

function openOverlapped(api, devicePath) {
  let win32Error = 0
  for (const access of [(GENERIC_READ | GENERIC_WRITE) >>> 0, 0]) {
    const handle = api.CreateFileW(devicePath, access, FILE_SHARE_READ | FILE_SHARE_WRITE, null, OPEN_EXISTING, FILE_FLAG_OVERLAPPED, 0)
    if (handle !== INVALID_HANDLE_VALUE && handle !== 0) return { handle, win32Error: 0 }
    win32Error = api.GetLastError()
  }
  return { handle: null, win32Error }
}

function awaitCompletion(api, handle, overlappedAddress, timeoutMs) {
  const transferred = [0]
  if (api.GetOverlappedResultEx(handle, overlappedAddress, transferred, timeoutMs, 0)) {
    return { ok: true, win32Error: 0, timedOut: false, settled: true }
  }
  const win32Error = api.GetLastError()
  if (win32Error !== WAIT_TIMEOUT) return { ok: false, win32Error, timedOut: false, settled: true }
  api.CancelIoEx(handle, overlappedAddress)
  const cancelled = api.GetOverlappedResultEx(handle, overlappedAddress, transferred, CANCEL_WAIT_MS, 0)
  const settled = !!cancelled || api.GetLastError() !== WAIT_TIMEOUT
  return { ok: false, win32Error: WAIT_TIMEOUT, timedOut: true, settled }
}

function issueIoctl(api, handle, code, input, timeoutMs) {
  const event = api.CreateEventW(null, 1, 0, null)
  if (!event) return { ok: false, win32Error: api.GetLastError(), timedOut: false, settled: true }
  const overlapped = Buffer.alloc(OVERLAPPED_BYTES)
  overlapped.writeBigUInt64LE(BigInt(event), OVERLAPPED_EVENT_OFFSET)
  const overlappedAddress = api.koffi.address(overlapped)
  let outcome
  if (api.DeviceIoControl(handle, code, api.koffi.address(input), input.length, 0, 0, null, overlappedAddress)) {
    outcome = { ok: true, win32Error: 0, timedOut: false, settled: true }
  } else {
    const win32Error = api.GetLastError()
    outcome = win32Error === ERROR_IO_PENDING
      ? awaitCompletion(api, handle, overlappedAddress, timeoutMs)
      : { ok: false, win32Error, timedOut: false, settled: true }
  }
  if (outcome.settled) api.CloseHandle(event)
  else abandonedRequests.push({ overlapped, input })
  return outcome
}

function sendBoundedIoctl(devicePath, code, input, timeoutMs) {
  const api = loadNativeApi()
  if (!api) return { ok: false, stage: 'unavailable', win32Error: null, timedOut: false, abandoned: false }
  const opened = openOverlapped(api, devicePath)
  if (opened.handle === null) return { ok: false, stage: 'open', win32Error: opened.win32Error, timedOut: false, abandoned: false }
  try {
    const { ok, win32Error, timedOut, settled } = issueIoctl(api, opened.handle, code, input, timeoutMs)
    return { ok, stage: 'ioctl', win32Error, timedOut, abandoned: !settled }
  } finally {
    api.CloseHandle(opened.handle)
  }
}

function sendToEach(devicePaths, code, input, timeoutMs) {
  const outcomes = []
  for (const devicePath of devicePaths) {
    const outcome = sendBoundedIoctl(devicePath, code, input, timeoutMs)
    outcomes.push(outcome)
    if (outcome.timedOut) break
  }
  return outcomes
}

function summarizeOutcomes(method, outcomes) {
  const succeeded = outcomes.some((outcome) => outcome.ok)
  const failure = outcomes.find((outcome) => !outcome.ok) ?? null
  return {
    ok: succeeded,
    method,
    attempts: outcomes.length,
    failedAt: succeeded ? null : failure?.stage ?? null,
    win32Error: succeeded ? 0 : failure?.win32Error ?? null,
    timedOut: outcomes.some((outcome) => outcome.timedOut),
    abandoned: outcomes.some((outcome) => outcome.abandoned),
  }
}

function unattempted(method, failedAt) {
  return { ok: false, method, attempts: 0, failedAt, win32Error: null, timedOut: false, abandoned: false }
}

function requestAudioOneShot({ serviceNodeIds, mode, timeoutMs }) {
  const method = `ks-${mode}`
  const devicePaths = findAudioFilterPaths(serviceNodeIds)
  if (devicePaths === null) return unattempted(method, 'unavailable')
  if (devicePaths.length === 0) return unattempted(method, 'no-audio-filter')
  const input = encodeKsProperty(KSPROPSETID_BT_AUDIO, KS_ONESHOT_PROPERTY_IDS[mode], KSPROPERTY_TYPE_GET)
  return summarizeOutcomes(method, sendToEach(devicePaths, IOCTL_KS_PROPERTY, input, timeoutMs))
}

function disconnectClassicLink({ address, timeoutMs }) {
  const method = 'bth-disconnect'
  const api = loadNativeApi()
  if (!api) return unattempted(method, 'unavailable')
  if (!BTH_ADDRESS_PATTERN.test(String(address))) return unattempted(method, 'no-address')
  const radioPaths = listInterfacePaths(api, BTHPORT_INTERFACE_GUID, null)
  if (radioPaths.length === 0) return unattempted(method, 'no-radio')
  return summarizeOutcomes(method, sendToEach(radioPaths, IOCTL_BTH_DISCONNECT_DEVICE, encodeBthAddress(address), timeoutMs))
}

function connectDevice({ serviceNodeIds, timeoutMs }) {
  return requestAudioOneShot({ serviceNodeIds, mode: 'reconnect', timeoutMs })
}

function disconnectDevice({ serviceNodeIds, address, timeoutMs }) {
  const audio = serviceNodeIds.length > 0 ? requestAudioOneShot({ serviceNodeIds, mode: 'disconnect', timeoutMs }) : null
  if (audio?.ok) return audio
  const link = disconnectClassicLink({ address, timeoutMs })
  return { ...link, audio, abandoned: link.abandoned || !!audio?.abandoned }
}

module.exports = {
  IOCTL_BTH_DISCONNECT_DEVICE,
  IOCTL_KS_PROPERTY,
  connectDevice,
  controlCode,
  decodeDevpropString,
  decodeGuid,
  decodeMultiSz,
  disconnectClassicLink,
  disconnectDevice,
  encodeBthAddress,
  encodeGuid,
  encodeKsProperty,
  findAudioFilterPaths,
  propertyKeyBuffer,
  readBluetoothNodes,
  sendBoundedIoctl,
  summarizeOutcomes,
}
