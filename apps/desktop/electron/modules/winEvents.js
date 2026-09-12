const {
  EVENT_SYSTEM_FOREGROUND,
  EVENT_SYSTEM_MINIMIZEEND,
  EVENT_OBJECT_SHOW,
  SYSTEM_WINDOW_EVENTS,
  addSubscriber,
  removeSubscriber,
  dispatchWinEvent,
  needsSystemRangeHook,
  needsObjectShowHook,
} = require('./winEventDispatch')
const { isExposedOwnWindow } = require('./exposedOwnWindows')

const WINEVENT_OUTOFCONTEXT = 0x0000
const WINEVENT_SKIPOWNPROCESS = 0x0002

const subscribers = []

let native = null
let exposedOwnWindowsProvider = null

function toExactHandle(value) {
  if (typeof value !== 'bigint') return value
  const asNumber = Number(value)
  return BigInt(asNumber) === value ? asNumber : value
}

function loadNative() {
  if (native) return native
  const koffi = require('koffi')
  const user32 = koffi.load('user32.dll')
  const signature = koffi.proto('__stdcall', 'SharedWinEventProc', 'void', ['uintptr_t', 'uint32', 'uintptr_t', 'int32', 'int32', 'uint32', 'uint32'])
  native = {
    koffi,
    procType: koffi.pointer(signature),
    setWinEventHook: user32.func('__stdcall', 'SetWinEventHook', 'uintptr_t', ['uint32', 'uint32', 'uintptr_t', 'SharedWinEventProc *', 'uint32', 'uint32', 'uint32']),
    unhookWinEvent: user32.func('__stdcall', 'UnhookWinEvent', 'int', ['uintptr_t']),
  }
  return native
}

function createHookSet(listener, processId, flags) {
  let procPointer = null
  let systemRangeHook = null
  let objectShowHook = null

  function ensureProcPointer() {
    if (procPointer) return
    const { koffi, procType } = loadNative()
    procPointer = koffi.register((_hook, event, hwndRaw, idObject, idChild) => {
      listener(event, toExactHandle(hwndRaw), idObject, idChild)
    }, procType)
  }

  function installHook(firstEvent, lastEvent) {
    const handle = loadNative().setWinEventHook(firstEvent, lastEvent, 0, procPointer, processId, 0, flags)
    if (!handle) {
      console.error(`[winEvents] Failed to install hook for events ${firstEvent}-${lastEvent}`)
      return null
    }
    return handle
  }

  function removeHook(handle) {
    if (!handle) return
    try { loadNative().unhookWinEvent(handle) } catch (_) {}
  }

  function releaseProcPointer() {
    if (!procPointer) return
    try { loadNative().koffi.unregister(procPointer) } catch (_) {}
    procPointer = null
  }

  return function sync(wantsSystemRange, wantsObjectShow) {
    if (wantsSystemRange || wantsObjectShow) ensureProcPointer()

    if (wantsSystemRange && !systemRangeHook) {
      systemRangeHook = installHook(EVENT_SYSTEM_FOREGROUND, EVENT_SYSTEM_MINIMIZEEND)
    } else if (!wantsSystemRange && systemRangeHook) {
      removeHook(systemRangeHook)
      systemRangeHook = null
    }

    if (wantsObjectShow && !objectShowHook) {
      objectShowHook = installHook(EVENT_OBJECT_SHOW, EVENT_OBJECT_SHOW)
    } else if (!wantsObjectShow && objectShowHook) {
      removeHook(objectShowHook)
      objectShowHook = null
    }

    if (!systemRangeHook && !objectShowHook) releaseProcPointer()
  }
}

function deliver(event, hwnd, idObject, idChild) {
  dispatchWinEvent(subscribers, event, hwnd, idObject, idChild)
}

function deliverExposedOwnWindow(event, hwnd, idObject, idChild) {
  if (!isExposedOwnWindow(hwnd, exposedOwnWindowsProvider)) return
  deliver(event, hwnd, idObject, idChild)
}

const syncForeignHooks = createHookSet(deliver, 0, WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS)
const syncOwnHooks = createHookSet(deliverExposedOwnWindow, process.pid, WINEVENT_OUTOFCONTEXT)

function syncNativeHooks() {
  const wantsSystemRange = needsSystemRangeHook(subscribers)
  const wantsObjectShow = needsObjectShowHook(subscribers)
  try {
    syncForeignHooks(wantsSystemRange, wantsObjectShow)
    syncOwnHooks(wantsSystemRange, wantsObjectShow)
  } catch (e) {
    console.error('[winEvents] hook sync error:', e.message)
  }
}

function subscribe(name, eventIds, listener) {
  const subscriber = addSubscriber(subscribers, name, eventIds, listener)
  syncNativeHooks()
  return () => {
    if (!removeSubscriber(subscribers, subscriber)) return
    syncNativeHooks()
  }
}

function setExposedOwnWindows(provider) {
  exposedOwnWindowsProvider = typeof provider === 'function' ? provider : null
}

module.exports = {
  SYSTEM_WINDOW_EVENTS,
  subscribe,
  setExposedOwnWindows,
}
