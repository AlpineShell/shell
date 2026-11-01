const HOOK_REFRESH_TICK_MS = 100
const HOOK_STALL_MS = 200
const HOOK_RETRY_MS = 1000

const WM_KEYDOWN = 0x0100
const WM_KEYUP = 0x0101
const WM_SYSKEYDOWN = 0x0104
const WM_SYSKEYUP = 0x0105
const LLKHF_INJECTED = 0x10
const KEY_STRUCT_BYTES = 12

const VERDICT_WAIT_MS = 150
const MAX_VERDICT_SEQ = 0x3FFFFFFF
const VERDICT_SLOT = 0
const CANCELLED_SLOT = 1
const SHARED_SLOTS = 2

function hookRefreshDue({ hooked, now, lastTickAt, lastRefreshAt }) {
  if (!hooked) return now - lastRefreshAt >= HOOK_RETRY_MS
  return now - lastTickAt >= HOOK_REFRESH_TICK_MS + HOOK_STALL_MS
}

function hookFieldsFromStruct(keyStruct) {
  return {
    vkCode: keyStruct.readUInt32LE(0),
    scanCode: keyStruct.readUInt32LE(4),
    flags: keyStruct.readUInt32LE(8),
  }
}

function keyEventFromHookFields(keyMessage, { vkCode, scanCode, flags }) {
  return {
    vkCode,
    scanCode,
    injected: (flags & LLKHF_INJECTED) !== 0,
    isKeyDown: keyMessage === WM_KEYDOWN || keyMessage === WM_SYSKEYDOWN,
    isKeyUp: keyMessage === WM_KEYUP || keyMessage === WM_SYSKEYUP,
  }
}

function keyEventFromHookStruct(keyMessage, keyStruct) {
  return keyEventFromHookFields(keyMessage, hookFieldsFromStruct(keyStruct))
}

function keyNeedsVerdict(flags) {
  return (flags & LLKHF_INJECTED) === 0
}

function nextVerdictSeq(seq) {
  return seq >= MAX_VERDICT_SEQ ? 1 : seq + 1
}

function encodeVerdict(seq, swallow) {
  return seq * 2 + (swallow ? 1 : 0)
}

function verdictSeq(encoded) {
  return Math.floor(encoded / 2)
}

function verdictSwallows(encoded) {
  return encoded % 2 === 1
}

function isVerdictLate(answerBy, now) {
  return !answerBy || now > answerBy
}

function sharedClockNow() {
  return performance.timeOrigin + performance.now()
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
  VERDICT_WAIT_MS,
  MAX_VERDICT_SEQ,
  VERDICT_SLOT,
  CANCELLED_SLOT,
  SHARED_SLOTS,
  hookRefreshDue,
  hookFieldsFromStruct,
  keyEventFromHookFields,
  keyEventFromHookStruct,
  keyNeedsVerdict,
  nextVerdictSeq,
  encodeVerdict,
  verdictSeq,
  verdictSwallows,
  isVerdictLate,
  sharedClockNow,
  routeKeyEvent,
}
