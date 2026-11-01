const { parentPort, workerData } = require('worker_threads')
const koffi = require('koffi')
const keyboardHookPolicy = require('./modules/keyboardHookPolicy')

const user32 = koffi.load('user32.dll')
const kernel32 = koffi.load('kernel32.dll')

const LowLevelKeyboardProc = koffi.proto('__stdcall', 'HookThreadLowLevelKeyboardProc', 'intptr_t', ['int', 'uintptr_t', 'intptr_t'])

const SetWindowsHookExW = user32.func('__stdcall', 'SetWindowsHookExW', 'uintptr_t', ['int', 'HookThreadLowLevelKeyboardProc *', 'uintptr_t', 'uint32'])
const UnhookWindowsHookEx = user32.func('__stdcall', 'UnhookWindowsHookEx', 'int', ['uintptr_t'])
const CallNextHookEx = user32.func('__stdcall', 'CallNextHookEx', 'intptr_t', ['uintptr_t', 'int', 'uintptr_t', 'intptr_t'])
const GetMessageW = user32.func('__stdcall', 'GetMessageW', 'int', ['void *', 'uintptr_t', 'uint32', 'uint32'])
const PeekMessageW = user32.func('__stdcall', 'PeekMessageW', 'int', ['void *', 'uintptr_t', 'uint32', 'uint32', 'uint32'])
const SetTimer = user32.func('__stdcall', 'SetTimer', 'uintptr_t', ['uintptr_t', 'uintptr_t', 'uint32', 'void *'])
const KillTimer = user32.func('__stdcall', 'KillTimer', 'int', ['uintptr_t', 'uintptr_t'])
const RtlMoveMemory = kernel32.func('__stdcall', 'RtlMoveMemory', 'void', ['void *', 'uintptr_t', 'uintptr_t'])
const GetCurrentThreadId = kernel32.func('__stdcall', 'GetCurrentThreadId', 'uint32', [])
const GetCurrentThread = kernel32.func('__stdcall', 'GetCurrentThread', 'uintptr_t', [])
const SetThreadPriority = kernel32.func('__stdcall', 'SetThreadPriority', 'int', ['uintptr_t', 'int'])

const WH_KEYBOARD_LL = 13
const SWALLOW_KEY = 1
const WM_TIMER = 0x0113
const PM_NOREMOVE = 0
const MSG_BYTES = 48
const MSG_MESSAGE_OFFSET = 8
const THREAD_PRIORITY_HIGHEST = 2

const shared = new Int32Array(workerData.sharedBuffer)

let hookHandle = 0
let hookCallbackPointer = null
let lastPostedSeq = 0
let hookRefreshTickAt = 0
let hookRefreshedAt = 0
let hookInstallFailing = false

function isCancelled() {
  return Atomics.load(shared, keyboardHookPolicy.CANCELLED_SLOT) !== 0
}

function readHookFields(lParam) {
  const keyStruct = Buffer.alloc(keyboardHookPolicy.KEY_STRUCT_BYTES)
  RtlMoveMemory(keyStruct, Number(lParam), keyboardHookPolicy.KEY_STRUCT_BYTES)
  return keyboardHookPolicy.hookFieldsFromStruct(keyStruct)
}

function mainAnsweredEveryKey() {
  return keyboardHookPolicy.verdictSeq(Atomics.load(shared, keyboardHookPolicy.VERDICT_SLOT)) === lastPostedSeq
}

function awaitVerdict(seq) {
  const giveUpAt = performance.now() + keyboardHookPolicy.VERDICT_WAIT_MS
  for (;;) {
    const verdict = Atomics.load(shared, keyboardHookPolicy.VERDICT_SLOT)
    if (keyboardHookPolicy.verdictSeq(verdict) === seq) return keyboardHookPolicy.verdictSwallows(verdict)
    const remaining = giveUpAt - performance.now()
    if (remaining <= 0) return false
    Atomics.wait(shared, keyboardHookPolicy.VERDICT_SLOT, verdict, remaining)
  }
}

function shellSwallows(keyMessage, fields) {
  const mainIsListening = mainAnsweredEveryKey()
  const seq = keyboardHookPolicy.nextVerdictSeq(lastPostedSeq)
  lastPostedSeq = seq
  const answerBy = mainIsListening ? keyboardHookPolicy.sharedClockNow() + keyboardHookPolicy.VERDICT_WAIT_MS : 0
  parentPort.postMessage({ type: 'key', seq, keyMessage, ...fields, answerBy })
  return mainIsListening && awaitVerdict(seq)
}

function onLowLevelKey(nCode, wParam, lParam) {
  try {
    if (nCode >= 0 && !isCancelled()) {
      const fields = readHookFields(lParam)
      if (keyboardHookPolicy.keyNeedsVerdict(fields.flags) && shellSwallows(Number(wParam), fields)) return SWALLOW_KEY
    }
  } catch (e) {
    console.error('[keyboardHookWorker] hook error:', e.message)
  }
  return CallNextHookEx(hookHandle, nCode, wParam, lParam)
}

function installHook() {
  const replacedHandle = hookHandle
  const installedHandle = SetWindowsHookExW(WH_KEYBOARD_LL, hookCallbackPointer, 0, 0)
  if (!installedHandle) {
    if (!hookInstallFailing) console.error('[keyboardHookWorker] Failed to install keyboard hook, retrying')
    hookInstallFailing = true
    return
  }
  hookHandle = installedHandle
  if (replacedHandle) UnhookWindowsHookEx(replacedHandle)
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

function pumpUntilQuitOrCancelled() {
  const message = Buffer.alloc(MSG_BYTES)
  for (;;) {
    const result = GetMessageW(message, 0, 0, 0)
    if (result === 0 || result === -1 || isCancelled()) return
    if (message.readUInt32LE(MSG_MESSAGE_OFFSET) === WM_TIMER) refreshHookIfDue()
  }
}

function releaseHook(refreshTimer) {
  KillTimer(0, refreshTimer)
  if (hookHandle) UnhookWindowsHookEx(hookHandle)
  hookHandle = 0
  koffi.unregister(hookCallbackPointer)
  hookCallbackPointer = null
}

function runHookThread() {
  SetThreadPriority(GetCurrentThread(), THREAD_PRIORITY_HIGHEST)
  PeekMessageW(Buffer.alloc(MSG_BYTES), 0, 0, 0, PM_NOREMOVE)
  if (isCancelled()) return
  hookCallbackPointer = koffi.register(onLowLevelKey, koffi.pointer(LowLevelKeyboardProc))
  hookRefreshTickAt = performance.now()
  hookRefreshedAt = hookRefreshTickAt
  installHook()
  const refreshTimer = SetTimer(0, 0, keyboardHookPolicy.HOOK_REFRESH_TICK_MS, null)
  parentPort.postMessage({ type: 'ready', threadId: GetCurrentThreadId(), hooked: Boolean(hookHandle) })
  try {
    pumpUntilQuitOrCancelled()
  } finally {
    releaseHook(refreshTimer)
  }
}

runHookThread()
