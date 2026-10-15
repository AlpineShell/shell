const koffi = require('koffi')

const user32 = koffi.load('user32.dll')
const kernel32 = koffi.load('kernel32.dll')

const GetForegroundWindow = user32.func('__stdcall', 'GetForegroundWindow', 'uintptr_t', [])
const GetWindowThreadProcessId = user32.func('__stdcall', 'GetWindowThreadProcessId', 'uint32', ['uintptr_t', 'void *'])
const SetForegroundWindow = user32.func('__stdcall', 'SetForegroundWindow', 'int', ['uintptr_t'])
const BringWindowToTop = user32.func('__stdcall', 'BringWindowToTop', 'int', ['uintptr_t'])
const AttachThreadInput = user32.func('__stdcall', 'AttachThreadInput', 'int', ['uint32', 'uint32', 'int'])
const GetCurrentThreadId = kernel32.func('__stdcall', 'GetCurrentThreadId', 'uint32', [])
const ShowWindow = user32.func('__stdcall', 'ShowWindow', 'int', ['uintptr_t', 'int'])
const PostMessageW = user32.func('__stdcall', 'PostMessageW', 'int', ['uintptr_t', 'uint32', 'uintptr_t', 'intptr_t'])
const IsWindow = user32.func('__stdcall', 'IsWindow', 'int', ['uintptr_t'])
const SendInput = user32.func('__stdcall', 'SendInput', 'uint32', ['uint32', 'void *', 'int'])
const AllowSetForegroundWindow = user32.func('__stdcall', 'AllowSetForegroundWindow', 'int', ['uint32'])
const IsIconic = user32.func('__stdcall', 'IsIconic', 'int', ['uintptr_t'])
const keybd_event = user32.func('__stdcall', 'keybd_event', 'void', ['uint8', 'uint8', 'uint32', 'uintptr_t'])

const SW_MAXIMIZE = 3
const SW_MINIMIZE = 6
const SW_RESTORE = 9
const VK_LMENU = 0xA4
const VK_CONTROL = 0x11
const VK_V = 0x56
const FOCUS_SETTLE_MS = 40
const WM_CLOSE = 0x0010
const ASFW_ANY = 0xFFFFFFFF

const INPUT_KEYBOARD = 1
const KEYEVENTF_KEYUP = 0x0002
const KEYEVENTF_UNICODE = 0x0004
const INPUT_STRUCT_SIZE = 40
const KEYBDINPUT_OFFSET = 8

function toNum(v) {
  return typeof v === 'bigint' ? Number(v) : v
}

function getForegroundWindow() {
  return toNum(GetForegroundWindow())
}

function minimizeWindow(hwnd) {
  if (hwnd && IsWindow(hwnd)) ShowWindow(hwnd, SW_MINIMIZE)
}

function maximizeWindow(hwnd) {
  if (hwnd && IsWindow(hwnd)) ShowWindow(hwnd, SW_MAXIMIZE)
}

function closeWindow(hwnd) {
  if (hwnd && IsWindow(hwnd)) PostMessageW(hwnd, WM_CLOSE, 0, 0)
}

function forceForeground(hwnd) {
  if (!hwnd) return
  const fg = toNum(GetForegroundWindow())
  if (!fg || fg === hwnd) {
    SetForegroundWindow(hwnd)
    BringWindowToTop(hwnd)
    return
  }
  const fgThread = GetWindowThreadProcessId(fg, null)
  const myThread = GetCurrentThreadId()
  if (fgThread === myThread) {
    SetForegroundWindow(hwnd)
    BringWindowToTop(hwnd)
    return
  }
  try {
    AttachThreadInput(fgThread, myThread, 1)
    SetForegroundWindow(hwnd)
    BringWindowToTop(hwnd)
  } finally {
    AttachThreadInput(fgThread, myThread, 0)
  }
}

function activateWindow(hwnd) {
  if (!hwnd || !IsWindow(hwnd)) return
  if (IsIconic(hwnd)) ShowWindow(hwnd, SW_RESTORE)
  keybd_event(VK_LMENU, 0, 0, 0)
  SetForegroundWindow(hwnd)
  keybd_event(VK_LMENU, 0, KEYEVENTF_KEYUP, 0)
}

function letLaunchedAppComeForward() {
  return AllowSetForegroundWindow(ASFW_ANY) !== 0
}

function writeUnicodeInput(buf, offset, codeUnit, keyUp) {
  buf.writeUInt32LE(INPUT_KEYBOARD, offset)
  buf.writeUInt16LE(0, offset + KEYBDINPUT_OFFSET)
  buf.writeUInt16LE(codeUnit, offset + KEYBDINPUT_OFFSET + 2)
  buf.writeUInt32LE(KEYEVENTF_UNICODE | (keyUp ? KEYEVENTF_KEYUP : 0), offset + KEYBDINPUT_OFFSET + 4)
}

function sendUnicode(text) {
  if (!text) return 0
  const codeUnits = []
  for (let i = 0; i < text.length; i++) codeUnits.push(text.charCodeAt(i))
  const buf = Buffer.alloc(codeUnits.length * 2 * INPUT_STRUCT_SIZE)
  let offset = 0
  for (const codeUnit of codeUnits) {
    writeUnicodeInput(buf, offset, codeUnit, false)
    offset += INPUT_STRUCT_SIZE
    writeUnicodeInput(buf, offset, codeUnit, true)
    offset += INPUT_STRUCT_SIZE
  }
  const expected = codeUnits.length * 2
  const sent = Number(SendInput(expected, buf, INPUT_STRUCT_SIZE))
  if (sent !== expected) console.error('[winFocus] SendInput inserted', sent, 'of', expected, 'events')
  return sent === expected
}

function writeVirtualKeyInput(buf, offset, vkCode, keyUp) {
  buf.writeUInt32LE(INPUT_KEYBOARD, offset)
  buf.writeUInt16LE(vkCode, offset + KEYBDINPUT_OFFSET)
  buf.writeUInt16LE(0, offset + KEYBDINPUT_OFFSET + 2)
  buf.writeUInt32LE(keyUp ? KEYEVENTF_KEYUP : 0, offset + KEYBDINPUT_OFFSET + 4)
}

function sendPasteShortcut() {
  const strokes = [[VK_CONTROL, false], [VK_V, false], [VK_V, true], [VK_CONTROL, true]]
  const buf = Buffer.alloc(strokes.length * INPUT_STRUCT_SIZE)
  strokes.forEach(([vkCode, keyUp], index) => writeVirtualKeyInput(buf, index * INPUT_STRUCT_SIZE, vkCode, keyUp))
  const sent = Number(SendInput(strokes.length, buf, INPUT_STRUCT_SIZE))
  if (sent !== strokes.length) console.error('[winFocus] SendInput pasted', sent, 'of', strokes.length, 'events')
  return sent === strokes.length
}

function sendToWindowOnceFocused(hwnd, send) {
  if (!hwnd || !IsWindow(hwnd)) return Promise.resolve(false)
  forceForeground(hwnd)
  return new Promise((resolve) => {
    setTimeout(() => {
      try {
        resolve(send())
      } catch (e) {
        console.error('[winFocus] send input error:', e.message)
        resolve(false)
      }
    }, FOCUS_SETTLE_MS)
  })
}

function insertText(hwnd, text) {
  if (!text) return Promise.resolve(false)
  return sendToWindowOnceFocused(hwnd, () => sendUnicode(text))
}

function pasteInto(hwnd) {
  return sendToWindowOnceFocused(hwnd, sendPasteShortcut)
}

module.exports = { activateWindow, forceForeground, getForegroundWindow, letLaunchedAppComeForward, minimizeWindow, maximizeWindow, closeWindow, sendUnicode, insertText, pasteInto }
