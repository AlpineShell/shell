const path = require('path')

const HKEY_CURRENT_USER = 0x80000001
const KEY_READ = 0x20019
const KEY_NOTIFY = 0x0010
const REG_NOTIFY_CHANGE_NAME = 0x00000001
const REG_NOTIFY_CHANGE_LAST_SET = 0x00000004
const ERROR_SUCCESS = 0
const ERROR_MORE_DATA = 234
const MAX_KEY_NAME_CHARS = 512
const FAMILY_MAP_TTL_MS = 300000

const WAIT_WORKER_ENTRY = path.join(__dirname, '..', 'waitForHandleWorker.js')

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
      setEvent: kernel32.func('__stdcall', 'SetEvent', 'int', ['uintptr_t']),
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
    if (rc === ERROR_MORE_DATA) continue
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
let familyMapBuiltAt = 0
let watchedKey = null
let changeEvent = null
let waitWorker = null
let waitWorkerHasExited = true
let watchGeneration = 0
let packagesChangedCallback = null
let watchLostCallback = null
let shutdownCleanupRegistered = false

function armChangeNotification() {
  const api = loadBindings()
  if (!api || watchedKey === null || changeEvent === null) return false
  const rc = api.notifyKey(watchedKey, 1, REG_NOTIFY_CHANGE_NAME | REG_NOTIFY_CHANGE_LAST_SET, changeEvent, 1)
  if (rc !== ERROR_SUCCESS) console.error('[appxPackages] RegNotifyChangeKeyValue failed, code', rc)
  return rc === ERROR_SUCCESS
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

function familyMapIsStale() {
  if (!fullNameByFamily) return true
  if (waitWorker) return false
  return Date.now() - familyMapBuiltAt > FAMILY_MAP_TTL_MS
}

function packageFullNameForFamily(familyName) {
  if (!familyName) return null
  if (familyMapIsStale()) {
    fullNameByFamily = buildFamilyMap()
    familyMapBuiltAt = Date.now()
  }
  return fullNameByFamily.get(String(familyName).toLowerCase()) || null
}

function closeWatchHandles(key, event) {
  const api = loadBindings()
  if (!api) return
  if (key !== null) { try { api.closeKey(key) } catch { void 0 } }
  if (event !== null) { try { api.closeHandle(event) } catch { void 0 } }
}

function stopWaitWorkerThenCloseHandles(stopped, key, event) {
  stopped.removeAllListeners()
  stopped.on('error', () => { void 0 })
  stopped.on('exit', () => closeWatchHandles(key, event))
  const api = loadBindings()
  if (api && event !== null) { try { api.setEvent(event) } catch { void 0 } }
  try { stopped.postMessage({ stop: true }) } catch { void 0 }
}

function releaseWatch() {
  watchGeneration++
  packagesChangedCallback = null
  watchLostCallback = null
  const stopped = waitWorker
  const key = watchedKey
  const event = changeEvent
  waitWorker = null
  watchedKey = null
  changeEvent = null
  if (!stopped || waitWorkerHasExited) closeWatchHandles(key, event)
  else stopWaitWorkerThenCloseHandles(stopped, key, event)
}

function loseWatch(reason) {
  console.error('[appxPackages] package watch lost:', reason)
  const notify = watchLostCallback
  watchLostCallback = null
  releaseWatch()
  if (notify) notify()
}

function registerShutdownCleanup() {
  if (shutdownCleanupRegistered) return
  shutdownCleanupRegistered = true
  try { require('electron').app.on('will-quit', releaseWatch) } catch { void 0 }
  process.on('exit', () => { try { releaseWatch() } catch { void 0 } })
}

function beginWait() {
  if (waitWorker && changeEvent !== null) waitWorker.postMessage({ handle: changeEvent })
}

function watchPackages(onPackagesChanged, onWatchLost) {
  if (waitWorker) return true
  const api = loadBindings()
  if (!api) return false
  watchedKey = openRepositoryKey()
  if (watchedKey === null) { releaseWatch(); return false }
  changeEvent = api.createEvent(null, 1, 0, null)
  if (!changeEvent) { releaseWatch(); return false }
  if (!armChangeNotification()) { releaseWatch(); return false }
  const generation = ++watchGeneration
  try {
    const { Worker } = require('worker_threads')
    waitWorker = new Worker(WAIT_WORKER_ENTRY)
    waitWorkerHasExited = false
  } catch (e) {
    console.error('[appxPackages] wait worker unavailable:', e.message)
    releaseWatch()
    return false
  }
  packagesChangedCallback = onPackagesChanged
  watchLostCallback = onWatchLost
  waitWorker.unref()
  waitWorker.on('error', (e) => { if (generation === watchGeneration) loseWatch(e.message) })
  waitWorker.on('exit', () => {
    waitWorkerHasExited = true
    if (generation === watchGeneration) loseWatch('wait worker exited')
  })
  waitWorker.on('message', (message) => {
    if (generation !== watchGeneration) return
    if (!message.signalled) { loseWatch(`wait returned ${message.detail}`); return }
    api.resetEvent(changeEvent)
    if (!armChangeNotification()) { loseWatch('re-arm failed'); return }
    fullNameByFamily = null
    beginWait()
    try { packagesChangedCallback() } catch (e) { console.error('[appxPackages] change callback error:', e.message) }
  })
  registerShutdownCleanup()
  beginWait()
  return true
}

module.exports = { packageFullNameForFamily, familyNameOfPackage, watchPackages, releaseWatch }
