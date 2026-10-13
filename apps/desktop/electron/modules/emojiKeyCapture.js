const koffi = require('koffi')
const winEvents = require('./winEvents')
const shellSurfaces = require('./shellSurfaces')
const { emojiKeyMessage, createKeyCapture } = require('./keyCapturePolicy')
const { VK_SHIFT, VK_CONTROL, VK_MENU, VK_CAPITAL } = require('./virtualKeys')

const user32 = koffi.load('user32.dll')

const GetKeyState = user32.func('__stdcall', 'GetKeyState', 'int16', ['int'])
const GetForegroundWindow = user32.func('__stdcall', 'GetForegroundWindow', 'uintptr_t', [])
const GetWindowThreadProcessId = user32.func('__stdcall', 'GetWindowThreadProcessId', 'uint32', ['uintptr_t', 'void *'])
const GetKeyboardLayout = user32.func('__stdcall', 'GetKeyboardLayout', 'uintptr_t', ['uint32'])
const ToUnicodeEx = user32.func('__stdcall', 'ToUnicodeEx', 'int', ['uint32', 'uint32', 'void *', 'void *', 'int', 'uint32', 'uintptr_t'])

const EVENT_SYSTEM_FOREGROUND = 0x0003
const KEY_DOWN_BIT = 0x8000
const KEY_TOGGLED_BIT = 0x0001
const KEY_STATE_DOWN = 0x80
const KEY_STATE_TOGGLED = 0x01
const TO_UNICODE_NO_MENU_CHANGE = 4
const FIRST_PRINTABLE_CODE = 0x20
const DELETE_CODE = 0x7F

let keyCallback = null
let closeCallback = null
let targetWindow = 0
let unsubscribeForeground = null

function toHandle(value) {
  return typeof value === 'bigint' ? Number(value) : value
}

function currentKeyState() {
  const state = Buffer.alloc(256)
  for (const vkCode of [VK_SHIFT, VK_CONTROL, VK_MENU]) {
    if (GetKeyState(vkCode) & KEY_DOWN_BIT) state[vkCode] = KEY_STATE_DOWN
  }
  if (GetKeyState(VK_CAPITAL) & KEY_TOGGLED_BIT) state[VK_CAPITAL] = KEY_STATE_TOGGLED
  return state
}

function foregroundKeyboardLayout() {
  const threadId = GetWindowThreadProcessId(GetForegroundWindow(), null)
  return GetKeyboardLayout(threadId)
}

function translateChar(vkCode, scanCode) {
  const out = Buffer.alloc(16)
  const count = ToUnicodeEx(vkCode, scanCode, currentKeyState(), out, 8, TO_UNICODE_NO_MENU_CHANGE, foregroundKeyboardLayout())
  if (count !== 1) return null
  const code = out.readUInt16LE(0)
  return code >= FIRST_PRINTABLE_CODE && code !== DELETE_CODE ? String.fromCharCode(code) : null
}

const capture = createKeyCapture({
  repeatsHeldKeys: true,
  decideKey({ vkCode, scanCode }) {
    const message = emojiKeyMessage(vkCode, (key) => translateChar(key, scanCode))
    return { swallow: Boolean(message), action: message }
  },
})

function closeWhenFocusLeavesTarget() {
  if (!targetWindow) return
  const current = toHandle(GetForegroundWindow())
  if (!current || current === targetWindow || shellSurfaces.isShellSurface(current)) return
  try { if (closeCallback) closeCallback() } catch (e) { console.error('[emojiKeyCapture] close error:', e.message) }
}

function watchForeground(watching) {
  if (watching && !unsubscribeForeground) {
    unsubscribeForeground = winEvents.subscribe('emojiKeyCapture', [EVENT_SYSTEM_FOREGROUND], closeWhenFocusLeavesTarget)
  } else if (!watching && unsubscribeForeground) {
    unsubscribeForeground()
    unsubscribeForeground = null
  }
}

function setActive(active, foregroundWindow) {
  capture.setActive(active)
  targetWindow = active ? (foregroundWindow || 0) : 0
  watchForeground(capture.isActive())
}

function handleEmojiKey(keyEvent) {
  const { swallow, action } = capture.handleKey(keyEvent)
  if (action && keyCallback) {
    setImmediate(() => {
      try { keyCallback(action) } catch (e) { console.error('[emojiKeyCapture] key error:', e.message) }
    })
  }
  return swallow
}

module.exports = {
  setActive,
  handleKey: handleEmojiKey,
  onKey(callback) {
    keyCallback = callback
  },
  onClose(callback) {
    closeCallback = callback
  },
}
