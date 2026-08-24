const koffi = require('koffi')

const advapi32 = koffi.load('advapi32.dll')
const kernel32 = koffi.load('kernel32.dll')

const RegOpenKeyExW = advapi32.func('__stdcall', 'RegOpenKeyExW', 'int32', ['uintptr_t', 'str16', 'uint32', 'uint32', koffi.out(koffi.pointer('uintptr_t'))])
const RegQueryValueExW = advapi32.func('__stdcall', 'RegQueryValueExW', 'int32', ['uintptr_t', 'str16', 'uintptr_t', koffi.out(koffi.pointer('uint32')), koffi.out(koffi.pointer('uint8')), koffi.inout(koffi.pointer('uint32'))])
const RegNotifyChangeKeyValue = advapi32.func('__stdcall', 'RegNotifyChangeKeyValue', 'int32', ['uintptr_t', 'int32', 'uint32', 'uintptr_t', 'int32'])
const CreateEventW = kernel32.func('__stdcall', 'CreateEventW', 'uintptr_t', ['uintptr_t', 'int32', 'int32', 'str16'])
const WaitForSingleObject = kernel32.func('__stdcall', 'WaitForSingleObject', 'uint32', ['uintptr_t', 'uint32'])

const HKEY_CURRENT_USER = 0x80000001
const KEY_READ = 0x20019
const REG_NOTIFY_CHANGE_LAST_SET = 0x00000004
const REG_NOTIFY_THREAD_AGNOSTIC = 0x10000000
const NOTIFY_ASYNCHRONOUSLY = 1
const WAIT_OBJECT_0 = 0
const ERROR_SUCCESS = 0
const VALUE_BUFFER_BYTES = 4096
const UTF16_TERMINATOR_BYTES = 2

function openCurrentUserKey(subKey) {
  const keyHandle = [0]
  const status = RegOpenKeyExW(HKEY_CURRENT_USER, subKey, 0, KEY_READ, keyHandle)
  return status === ERROR_SUCCESS ? keyHandle[0] : null
}

function readStringValue(keyHandle, valueName) {
  const byteCount = [VALUE_BUFFER_BYTES]
  const buffer = Buffer.alloc(VALUE_BUFFER_BYTES)
  const status = RegQueryValueExW(keyHandle, valueName, 0, [0], buffer, byteCount)
  if (status !== ERROR_SUCCESS) return null
  const textBytes = Math.max(0, byteCount[0] - UTF16_TERMINATOR_BYTES)
  return buffer.subarray(0, textBytes).toString('ucs2') || null
}

function armChangeNotification(keyHandle, eventHandle) {
  return RegNotifyChangeKeyValue(
    keyHandle,
    0,
    REG_NOTIFY_CHANGE_LAST_SET | REG_NOTIFY_THREAD_AGNOSTIC,
    eventHandle,
    NOTIFY_ASYNCHRONOUSLY
  ) === ERROR_SUCCESS
}

function watchCurrentUserStringValue({ subKey, valueName, checkIntervalMs, onChange }) {
  const keyHandle = openCurrentUserKey(subKey)
  if (!keyHandle) return { read: () => null }

  const read = () => readStringValue(keyHandle, valueName)
  const eventHandle = CreateEventW(0, 0, 0, null)
  if (!eventHandle || !armChangeNotification(keyHandle, eventHandle)) return { read }

  let lastValue = read()
  setInterval(() => {
    if (WaitForSingleObject(eventHandle, 0) !== WAIT_OBJECT_0) return
    armChangeNotification(keyHandle, eventHandle)
    const value = read()
    if (value === lastValue) return
    lastValue = value
    onChange(value)
  }, checkIntervalMs)

  return { read }
}

module.exports = { watchCurrentUserStringValue }
