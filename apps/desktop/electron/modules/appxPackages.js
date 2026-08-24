const HKEY_CURRENT_USER = 0x80000001
const KEY_READ = 0x20019
const KEY_NOTIFY = 0x0010
const REG_NOTIFY_CHANGE_NAME = 0x00000001
const REG_NOTIFY_CHANGE_LAST_SET = 0x00000004
const WAIT_OBJECT_0 = 0
const ERROR_SUCCESS = 0
const MAX_KEY_NAME_CHARS = 512
const PACKAGE_POLL_INTERVAL = 5000

const PACKAGE_REPOSITORY_KEY =
  'Software\\Classes\\Local Settings\\Software\\Microsoft\\Windows\\CurrentVersion\\AppModel\\Repository\\Packages'

let bindings = null
let bindingsUnavailable = false

function loadBindings() {
  if (bindings || bindingsUnavailable) return bindings
  try {
    const koffi = require('koffi')
    const advapi32 = koffi.load('advapi32.dll')
    const kernel32 = koffi.load('kernel32.dll')
    bindings = {
      openKey: advapi32.func('__stdcall', 'RegOpenKeyExW', 'long', ['uintptr_t', 'str16', 'uint32', 'uint32', 'void *']),
      enumKey: advapi32.func('__stdcall', 'RegEnumKeyExW', 'long', ['uintptr_t', 'uint32', 'void *', 'void *', 'void *', 'void *', 'void *', 'void *']),
      notifyKey: advapi32.func('__stdcall', 'RegNotifyChangeKeyValue', 'long', ['uintptr_t', 'int', 'uint32', 'uintptr_t', 'int']),
      closeKey: advapi32.func('__stdcall', 'RegCloseKey', 'long', ['uintptr_t']),
      createEvent: kernel32.func('__stdcall', 'CreateEventW', 'uintptr_t', ['void *', 'int', 'int', 'void *']),
      resetEvent: kernel32.func('__stdcall', 'ResetEvent', 'int', ['uintptr_t']),
      waitForObject: kernel32.func('__stdcall', 'WaitForSingleObject', 'uint32', ['uintptr_t', 'uint32']),
      closeHandle: kernel32.func('__stdcall', 'CloseHandle', 'int', ['uintptr_t']),
    }
  } catch (e) {
    bindingsUnavailable = true
    console.error('[appxPackages] registry binding unavailable:', e.message)
  }
  return bindings
}

function openRepositoryKey() {
  const api = loadBindings()
  if (!api) return null
  const handleOut = Buffer.alloc(8)
  const rc = api.openKey(HKEY_CURRENT_USER, PACKAGE_REPOSITORY_KEY, 0, KEY_READ | KEY_NOTIFY, handleOut)
  if (rc !== ERROR_SUCCESS) return null
  return handleOut.readBigUInt64LE(0)
}

function readPackageFullNames(keyHandle) {
  const api = loadBindings()
  const names = []
  if (!api || keyHandle === null) return names
  const nameBuffer = Buffer.alloc(MAX_KEY_NAME_CHARS * 2)
  const lengthBuffer = Buffer.alloc(4)
  for (let subkeyIndex = 0; ; subkeyIndex++) {
    lengthBuffer.writeUInt32LE(MAX_KEY_NAME_CHARS, 0)
    const rc = api.enumKey(keyHandle, subkeyIndex, nameBuffer, lengthBuffer, null, null, null, null)
    if (rc !== ERROR_SUCCESS) break
    names.push(nameBuffer.toString('utf16le', 0, lengthBuffer.readUInt32LE(0) * 2))
  }
  return names
}

function familyNameOfPackage(fullName) {
  const parts = String(fullName || '').split('_')
  if (parts.length !== 5 || !parts[0] || !parts[4]) return null
  return `${parts[0]}_${parts[4]}`
}

let fullNameByFamily = null
let watchedKey = null
let changeEvent = null
let pollTimer = null
let quitCleanupRegistered = false

function armChangeNotification() {
  const api = loadBindings()
  if (!api || watchedKey === null || changeEvent === null) return
  api.notifyKey(watchedKey, 1, REG_NOTIFY_CHANGE_NAME | REG_NOTIFY_CHANGE_LAST_SET, changeEvent, 1)
}

function buildFamilyMap() {
  const map = new Map()
  const keyHandle = watchedKey !== null ? watchedKey : openRepositoryKey()
  if (keyHandle === null) return map
  try {
    for (const fullName of readPackageFullNames(keyHandle)) {
      const family = familyNameOfPackage(fullName)
      if (family) map.set(family.toLowerCase(), fullName)
    }
  } finally {
    if (watchedKey === null) {
      const api = loadBindings()
      if (api) api.closeKey(keyHandle)
    }
  }
  return map
}

function packageFullNameForFamily(familyName) {
  if (!familyName) return null
  if (!fullNameByFamily) fullNameByFamily = buildFamilyMap()
  return fullNameByFamily.get(String(familyName).toLowerCase()) || null
}

function releaseWatch() {
  const api = loadBindings()
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
  if (!api) return
  if (changeEvent !== null) { try { api.closeHandle(changeEvent) } catch { void 0 } changeEvent = null }
  if (watchedKey !== null) { try { api.closeKey(watchedKey) } catch { void 0 } watchedKey = null }
}

function registerQuitCleanup() {
  if (quitCleanupRegistered) return
  quitCleanupRegistered = true
  try { require('electron').app.on('will-quit', releaseWatch) } catch { void 0 }
}

function watchPackages(onPackagesChanged) {
  if (pollTimer) return true
  const api = loadBindings()
  if (!api) return false
  watchedKey = openRepositoryKey()
  if (watchedKey === null) return false
  changeEvent = api.createEvent(null, 1, 0, null)
  if (!changeEvent) { releaseWatch(); return false }
  armChangeNotification()
  registerQuitCleanup()
  pollTimer = setInterval(() => {
    try {
      if (api.waitForObject(changeEvent, 0) !== WAIT_OBJECT_0) return
      api.resetEvent(changeEvent)
      armChangeNotification()
      fullNameByFamily = null
      onPackagesChanged()
    } catch (e) {
      console.error('[appxPackages] change poll error:', e.message)
    }
  }, PACKAGE_POLL_INTERVAL)
  return true
}

module.exports = { packageFullNameForFamily, familyNameOfPackage, watchPackages, releaseWatch }
