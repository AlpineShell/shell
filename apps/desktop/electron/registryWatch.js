const { createSharedIntervals } = require('./sharedIntervals')

const HKEY_CURRENT_USER = 0x80000001
const KEY_READ = 0x20019
const REG_NOTIFY_CHANGE_NAME = 0x00000001
const REG_NOTIFY_CHANGE_LAST_SET = 0x00000004
const REG_NOTIFY_THREAD_AGNOSTIC = 0x10000000
const NOTIFY_ASYNCHRONOUSLY = 1
const WAIT_OBJECT_0 = 0
const ERROR_SUCCESS = 0
const ERROR_MORE_DATA = 234
const REG_SZ = 1
const REG_EXPAND_SZ = 2
const INITIAL_VALUE_BUFFER_BYTES = 4096
const MAX_VALUE_BUFFER_BYTES = 1048576
const FALLBACK_POLL_INTERVAL_MS = 5000

const notificationChecks = createSharedIntervals()

let registryApi = null
let registryApiUnavailable = false

function loadRegistryApi() {
  if (registryApi || registryApiUnavailable) return registryApi
  try {
    const koffi = require('koffi')
    const advapi32 = koffi.load('advapi32.dll')
    const kernel32 = koffi.load('kernel32.dll')
    registryApi = {
      RegOpenKeyExW: advapi32.func('__stdcall', 'RegOpenKeyExW', 'int32', ['uintptr_t', 'str16', 'uint32', 'uint32', koffi.out(koffi.pointer('uintptr_t'))]),
      RegCloseKey: advapi32.func('__stdcall', 'RegCloseKey', 'int32', ['uintptr_t']),
      RegQueryValueExW: advapi32.func('__stdcall', 'RegQueryValueExW', 'int32', ['uintptr_t', 'str16', 'uintptr_t', koffi.out(koffi.pointer('uint32')), koffi.out(koffi.pointer('uint8')), koffi.inout(koffi.pointer('uint32'))]),
      RegNotifyChangeKeyValue: advapi32.func('__stdcall', 'RegNotifyChangeKeyValue', 'int32', ['uintptr_t', 'int32', 'uint32', 'uintptr_t', 'int32']),
      CreateEventW: kernel32.func('__stdcall', 'CreateEventW', 'uintptr_t', ['uintptr_t', 'int32', 'int32', 'str16']),
      CloseHandle: kernel32.func('__stdcall', 'CloseHandle', 'int32', ['uintptr_t']),
      WaitForSingleObject: kernel32.func('__stdcall', 'WaitForSingleObject', 'uint32', ['uintptr_t', 'uint32']),
    }
  } catch (e) {
    registryApiUnavailable = true
    console.error('[registryWatch] registry API unavailable:', e.message)
  }
  return registryApi
}

function decodeRegistryString(buffer, byteCount) {
  const readableBytes = Math.min(Math.max(byteCount, 0), buffer.length)
  const text = buffer.subarray(0, readableBytes - (readableBytes % 2)).toString('ucs2')
  const terminator = text.indexOf(String.fromCharCode(0))
  return (terminator === -1 ? text : text.slice(0, terminator)) || null
}

function openCurrentUserKey(api, subKey) {
  const keyHandle = [0]
  const status = api.RegOpenKeyExW(HKEY_CURRENT_USER, subKey, 0, KEY_READ, keyHandle)
  return status === ERROR_SUCCESS ? keyHandle[0] : null
}

function readStringValue(api, keyHandle, valueName) {
  let capacity = INITIAL_VALUE_BUFFER_BYTES
  while (capacity <= MAX_VALUE_BUFFER_BYTES) {
    const buffer = Buffer.alloc(capacity)
    const byteCount = [capacity]
    const valueType = [0]
    const status = api.RegQueryValueExW(keyHandle, valueName, 0, valueType, buffer, byteCount)
    if (status === ERROR_MORE_DATA) {
      capacity = Math.max(byteCount[0], capacity * 2)
      continue
    }
    if (status !== ERROR_SUCCESS) return null
    if (valueType[0] !== REG_SZ && valueType[0] !== REG_EXPAND_SZ) return null
    return decodeRegistryString(buffer, byteCount[0])
  }
  return null
}

function armChangeNotification(api, keyHandle, eventHandle, changeFilter, watchSubtree) {
  return api.RegNotifyChangeKeyValue(
    keyHandle,
    watchSubtree ? 1 : 0,
    changeFilter | REG_NOTIFY_THREAD_AGNOSTIC,
    eventHandle,
    NOTIFY_ASYNCHRONOUSLY
  ) === ERROR_SUCCESS
}

function readCurrentUserStringValue(subKey, valueName) {
  const api = loadRegistryApi()
  if (!api) return null
  const keyHandle = openCurrentUserKey(api, subKey)
  if (!keyHandle) return null
  try {
    return readStringValue(api, keyHandle, valueName)
  } finally {
    api.RegCloseKey(keyHandle)
  }
}

function watchCurrentUserKeyChanges({ subKey, label, checkIntervalMs, changeFilter = REG_NOTIFY_CHANGE_LAST_SET, watchSubtree = false, onNotify }) {
  const api = loadRegistryApi()
  const keyHandle = api ? openCurrentUserKey(api, subKey) : null
  if (!api || !keyHandle) {
    console.error(`[registryWatch] cannot open HKCU\\${subKey}, ${label} changes will go unnoticed`)
    return { stop: () => {} }
  }

  let eventHandle = null
  let fallbackPollTimer = null
  let stopCheckingNotification = () => {}

  function releaseEvent() {
    if (!eventHandle) return
    api.CloseHandle(eventHandle)
    eventHandle = null
  }

  function arm() {
    return armChangeNotification(api, keyHandle, eventHandle, changeFilter, watchSubtree)
  }

  function fallBackToPoll(reason) {
    console.error(`[registryWatch] HKCU\\${subKey} (${label}): ${reason}, falling back to a ${FALLBACK_POLL_INTERVAL_MS} ms poll`)
    stopCheckingNotification()
    if (fallbackPollTimer) clearInterval(fallbackPollTimer)
    fallbackPollTimer = setInterval(onNotify, FALLBACK_POLL_INTERVAL_MS)
  }

  function checkNotification() {
    if (api.WaitForSingleObject(eventHandle, 0) !== WAIT_OBJECT_0) return
    const rearmed = arm()
    onNotify()
    if (rearmed) return
    releaseEvent()
    fallBackToPoll('re-arming the change notification failed')
  }

  eventHandle = api.CreateEventW(0, 0, 0, null)
  if (!eventHandle) {
    fallBackToPoll('CreateEventW failed')
  } else if (!arm()) {
    releaseEvent()
    fallBackToPoll('RegNotifyChangeKeyValue failed')
  } else {
    stopCheckingNotification = notificationChecks.add(checkIntervalMs, checkNotification)
  }

  function stop() {
    stopCheckingNotification()
    if (fallbackPollTimer) {
      clearInterval(fallbackPollTimer)
      fallbackPollTimer = null
    }
    releaseEvent()
    api.RegCloseKey(keyHandle)
  }

  return { stop }
}

function watchCurrentUserStringValue({ subKey, valueName, checkIntervalMs, onChange }) {
  let lastValue = readCurrentUserStringValue(subKey, valueName)

  function emitChange() {
    const value = readCurrentUserStringValue(subKey, valueName)
    if (value === lastValue) return
    lastValue = value
    onChange(value)
  }

  return watchCurrentUserKeyChanges({ subKey, label: valueName, checkIntervalMs, onNotify: emitChange })
}

module.exports = {
  REG_NOTIFY_CHANGE_NAME,
  REG_NOTIFY_CHANGE_LAST_SET,
  decodeRegistryString,
  readCurrentUserStringValue,
  watchCurrentUserKeyChanges,
  watchCurrentUserStringValue,
}
