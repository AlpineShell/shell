const {
  EVENT_SYSTEM_FOREGROUND,
  EVENT_SYSTEM_MINIMIZEEND,
  EVENT_OBJECT_DESTROY,
  EVENT_OBJECT_HIDE,
  OBJECT_WINDOW_EVENTS,
  SYSTEM_WINDOW_EVENTS,
  addSubscriber,
  removeSubscriber,
  dispatchWinEvent,
  needsSystemRangeHook,
  needsObjectRangeHook,
} = require('./winEventDispatch')

const WINEVENT_OUTOFCONTEXT = 0x0000
const WINEVENT_SKIPOWNPROCESS = 0x0002
const HOOK_FLAGS = WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS

const subscribers = []

let native = null
let procPointer = null
let systemRangeHook = null
let objectRangeHook = null

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

function onWinEvent(_hook, event, hwndRaw, idObject, idChild) {
  dispatchWinEvent(subscribers, event, toExactHandle(hwndRaw), idObject, idChild)
}

function ensureProcPointer() {
  if (procPointer) return
  const { koffi, procType } = loadNative()
  procPointer = koffi.register(onWinEvent, procType)
}

function installHook(firstEvent, lastEvent) {
  const handle = loadNative().setWinEventHook(firstEvent, lastEvent, 0, procPointer, 0, 0, HOOK_FLAGS)
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

function syncNativeHooks() {
  const wantsSystemRange = needsSystemRangeHook(subscribers)
  const wantsObjectRange = needsObjectRangeHook(subscribers)
  try {
    if (wantsSystemRange || wantsObjectRange) ensureProcPointer()

    if (wantsSystemRange && !systemRangeHook) {
      systemRangeHook = installHook(EVENT_SYSTEM_FOREGROUND, EVENT_SYSTEM_MINIMIZEEND)
    } else if (!wantsSystemRange && systemRangeHook) {
      removeHook(systemRangeHook)
      systemRangeHook = null
    }

    if (wantsObjectRange && !objectRangeHook) {
      objectRangeHook = installHook(EVENT_OBJECT_DESTROY, EVENT_OBJECT_HIDE)
    } else if (!wantsObjectRange && objectRangeHook) {
      removeHook(objectRangeHook)
      objectRangeHook = null
    }

    if (!systemRangeHook && !objectRangeHook) releaseProcPointer()
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

module.exports = {
  SYSTEM_WINDOW_EVENTS,
  OBJECT_WINDOW_EVENTS,
  subscribe,
}
