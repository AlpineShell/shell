const HOOK_REFRESH_TICK_MS = 100
const HOOK_STALL_MS = 200
const HOOK_RETRY_MS = 1000

const WM_KEYDOWN = 0x0100
const WM_KEYUP = 0x0101
const WM_SYSKEYDOWN = 0x0104
const WM_SYSKEYUP = 0x0105
const LLKHF_INJECTED = 0x10
const KEY_STRUCT_BYTES = 12

function hookRefreshDue({ hooked, now, lastTickAt, lastRefreshAt }) {
  if (!hooked) return now - lastRefreshAt >= HOOK_RETRY_MS
  return now - lastTickAt >= HOOK_REFRESH_TICK_MS + HOOK_STALL_MS
}

function keyEventFromHookStruct(keyMessage, keyStruct) {
  return {
    vkCode: keyStruct.readUInt32LE(0),
    scanCode: keyStruct.readUInt32LE(4),
    injected: (keyStruct.readUInt32LE(8) & LLKHF_INJECTED) !== 0,
    isKeyDown: keyMessage === WM_KEYDOWN || keyMessage === WM_SYSKEYDOWN,
    isKeyUp: keyMessage === WM_KEYUP || keyMessage === WM_SYSKEYUP,
  }
}

function routeKeyEvent(keyHandlers, keyEvent, reportHandlerError) {
  for (const handleKey of keyHandlers) {
    try {
      if (handleKey(keyEvent)) return true
    } catch (error) {
      reportHandlerError(handleKey, error)
    }
  }
  return false
}

module.exports = {
  HOOK_REFRESH_TICK_MS,
  HOOK_STALL_MS,
  HOOK_RETRY_MS,
  WM_KEYDOWN,
  WM_KEYUP,
  WM_SYSKEYDOWN,
  WM_SYSKEYUP,
  LLKHF_INJECTED,
  KEY_STRUCT_BYTES,
  hookRefreshDue,
  keyEventFromHookStruct,
  routeKeyEvent,
}
