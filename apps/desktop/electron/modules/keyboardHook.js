const koffi = require('koffi')
const keyboardHookPolicy = require('./keyboardHookPolicy')
const { startKeyboardHookThread } = require('./keyboardHookThread')

const user32 = koffi.load('user32.dll')
const kernel32 = koffi.load('kernel32.dll')

const LowLevelKeyboardProc = koffi.proto('__stdcall', 'LowLevelKeyboardProc', 'intptr_t', ['int', 'uintptr_t', 'intptr_t'])

const SetWindowsHookExW = user32.func('__stdcall', 'SetWindowsHookExW', 'uintptr_t', ['int', 'LowLevelKeyboardProc *', 'uintptr_t', 'uint32'])
const UnhookWindowsHookEx = user32.func('__stdcall', 'UnhookWindowsHookEx', 'int', ['uintptr_t'])
const CallNextHookEx = user32.func('__stdcall', 'CallNextHookEx', 'intptr_t', ['uintptr_t', 'int', 'uintptr_t', 'intptr_t'])
const RtlMoveMemory = kernel32.func('__stdcall', 'RtlMoveMemory', 'void', ['void *', 'uintptr_t', 'uintptr_t'])

const WH_KEYBOARD_LL = 13
const SWALLOW_KEY = 1
const MAX_HOOK_THREAD_STARTS = 4

let keyHandlers = []
let hookHandle = null
let hookCallbackPointer = null
let hookRefreshTimer = null
let hookRefreshTickAt = 0
let hookRefreshedAt = 0
let hookInstallFailing = false
let hookThread = null
let hookThreadStarts = 0
let shuttingDown = false

function readKeyStruct(lParam) {
  const keyStruct = Buffer.alloc(keyboardHookPolicy.KEY_STRUCT_BYTES)
  RtlMoveMemory(keyStruct, Number(lParam), keyboardHookPolicy.KEY_STRUCT_BYTES)
  return keyStruct
}

function reportHandlerError(handleKey, error) {
  console.error(`[keyboardHook] ${handleKey.name || 'key handler'} error:`, error && error.message)
}

function shellSwallowsKey(keyEvent) {
  return keyHandlers.length > 0 && !keyEvent.injected && keyboardHookPolicy.routeKeyEvent(keyHandlers, keyEvent, reportHandlerError)
}

function shellSwallowsThreadRequest(request) {
  return shellSwallowsKey(keyboardHookPolicy.keyEventFromHookFields(request.keyMessage, request))
}

function onLowLevelKey(nCode, wParam, lParam) {
  try {
    if (nCode >= 0 && shellSwallowsKey(keyboardHookPolicy.keyEventFromHookStruct(Number(wParam), readKeyStruct(lParam)))) {
      return SWALLOW_KEY
    }
  } catch (e) {
    console.error('[keyboardHook] hook error:', e.message)
  }
  return CallNextHookEx(hookHandle, nCode, wParam, lParam)
}

function registeredHookCallback() {
  if (!hookCallbackPointer) hookCallbackPointer = koffi.register(onLowLevelKey, koffi.pointer(LowLevelKeyboardProc))
  return hookCallbackPointer
}

function installHook() {
  const replacedHandle = hookHandle
  const installedHandle = SetWindowsHookExW(WH_KEYBOARD_LL, registeredHookCallback(), 0, 0)
  if (!installedHandle) {
    if (!hookInstallFailing) console.error('[keyboardHook] Failed to install keyboard hook, retrying')
    hookInstallFailing = true
    return
  }
  hookHandle = installedHandle
  if (replacedHandle) {
    try { UnhookWindowsHookEx(replacedHandle) } catch (_) {}
  } else {
    console.log('[keyboardHook] Keyboard hook installed')
  }
  hookInstallFailing = false
}

function refreshHookIfDue() {
  const now = performance.now()
  const due = keyboardHookPolicy.hookRefreshDue({
    hooked: Boolean(hookHandle),
    now,
    lastTickAt: hookRefreshTickAt,
    lastRefreshAt: hookRefreshedAt,
  })
  hookRefreshTickAt = now
  if (!due) return
  hookRefreshedAt = now
  installHook()
}

function hookRefresherTick() {
  try {
    refreshHookIfDue()
  } catch (e) {
    console.error('[keyboardHook] hook refresher error:', e.message)
  }
}

function startHookRefresher() {
  hookRefreshTickAt = performance.now()
  hookRefreshedAt = hookRefreshTickAt
  hookRefreshTimer = setInterval(hookRefresherTick, keyboardHookPolicy.HOOK_REFRESH_TICK_MS)
}

function uninstallInProcessHook() {
  if (hookRefreshTimer) clearInterval(hookRefreshTimer)
  hookRefreshTimer = null
  if (hookHandle) {
    UnhookWindowsHookEx(hookHandle)
    hookHandle = null
  }
  if (hookCallbackPointer) {
    koffi.unregister(hookCallbackPointer)
    hookCallbackPointer = null
  }
}

function useInProcessHook() {
  console.error('[keyboardHook] falling back to the keyboard hook on the main thread')
  installHook()
  startHookRefresher()
}

function onHookThreadReady({ hooked }) {
  if (hookThreadStarts === 1) console.log(`[keyboardHook] Keyboard hook ${hooked ? 'installed' : 'pending'} on its own thread`)
}

function onHookThreadLost(reason) {
  hookThread = null
  if (shuttingDown) return
  console.error('[keyboardHook] hook thread lost:', reason)
  if (hookThreadStarts < MAX_HOOK_THREAD_STARTS) startHookThread()
  else useInProcessHook()
}

function startHookThread() {
  hookThreadStarts += 1
  try {
    hookThread = startKeyboardHookThread({ decide: shellSwallowsThreadRequest, onReady: onHookThreadReady, onLost: onHookThreadLost })
  } catch (e) {
    hookThread = null
    console.error('[keyboardHook] hook thread failed to start:', e.message)
    useInProcessHook()
  }
}

function uninstallHook() {
  shuttingDown = true
  if (hookThread) hookThread.stop()
  hookThread = null
  uninstallInProcessHook()
}

function setKeyHandlers(handlers) {
  keyHandlers = handlers.slice()
}

module.exports = {
  setKeyHandlers,

  start() {
    const { app } = require('electron')
    startHookThread()
    app.on('will-quit', uninstallHook)
  },
}
