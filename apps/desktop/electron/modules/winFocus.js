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

const SW_MAXIMIZE = 3
const SW_MINIMIZE = 6
const WM_CLOSE = 0x0010

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

function insertText(hwnd, text) {
  if (!hwnd || !IsWindow(hwnd) || !text) return Promise.resolve(false)
  forceForeground(hwnd)
  return new Promise((resolve) => {
    setTimeout(() => {
      try {
        resolve(sendUnicode(text))
      } catch (e) {
        console.error('[winFocus] sendUnicode error:', e.message)
        resolve(false)
      }
    }, 40)
  })
}

module.exports = { forceForeground, getForegroundWindow, minimizeWindow, maximizeWindow, closeWindow, sendUnicode, insertText }
