const koffi = require('koffi')
const { klidToLayoutWord } = require('./languageParser')

const user32 = koffi.load('user32.dll')

let shlwapi = null
try {
  shlwapi = koffi.load('shlwapi.dll')
} catch (e) {
  console.error('[keyboardLayout] shlwapi.dll load error:', e.message)
}

const GetForegroundWindow = user32.func('__stdcall', 'GetForegroundWindow', 'uintptr_t', [])
const GetWindowThreadProcessId = user32.func('__stdcall', 'GetWindowThreadProcessId', 'uint32', ['uintptr_t', 'void *'])
const GetKeyboardLayout = user32.func('__stdcall', 'GetKeyboardLayout', 'uintptr_t', ['uint32'])
const GetKeyboardLayoutList = user32.func('__stdcall', 'GetKeyboardLayoutList', 'int', ['int', 'void *'])
const LoadKeyboardLayoutW = user32.func('__stdcall', 'LoadKeyboardLayoutW', 'uintptr_t', ['str16', 'uint32'])
const PostMessageW = user32.func('__stdcall', 'PostMessageW', 'int', ['uintptr_t', 'uint32', 'uintptr_t', 'intptr_t'])
const GetGUIThreadInfo = user32.func('__stdcall', 'GetGUIThreadInfo', 'int', ['uint32', 'void *'])
const IsWindow = user32.func('__stdcall', 'IsWindow', 'int', ['uintptr_t'])

let SHLoadIndirectString = null
if (shlwapi) {
  try {
    SHLoadIndirectString = shlwapi.func('__stdcall', 'SHLoadIndirectString', 'long', ['str16', 'void *', 'uint32', 'void *'])
  } catch (e) {
    console.error('[keyboardLayout] SHLoadIndirectString bind error:', e.message)
  }
}

const WM_INPUTLANGCHANGEREQUEST = 0x0050
const INPUTLANGCHANGE_SYSCHARSET = 0x0001
const HKL_SLOT_BYTES = 8
const HANDLE_MASK = 0xffffffffn
const GUI_THREAD_INFO_BYTES = 72
const GUI_THREAD_INFO_FOCUS_OFFSET = 16
const INDIRECT_STRING_BYTES = 1024

function toHandleNumber(value) {
  return Number(BigInt(value) & HANDLE_MASK)
}

function foregroundWindow() {
  return GetForegroundWindow()
}

function windowProcessId(hwnd) {
  if (!hwnd) return 0
  const buffer = Buffer.alloc(4)
  GetWindowThreadProcessId(hwnd, buffer)
  return buffer.readUInt32LE(0)
}

function loadedLayouts() {
  const count = GetKeyboardLayoutList(0, null)
  if (!count || count < 1) return []
  const buffer = Buffer.alloc(count * HKL_SLOT_BYTES)
  const written = GetKeyboardLayoutList(count, buffer)
  const layouts = []
  for (let index = 0; index < Math.min(written, count); index += 1) {
    layouts.push(Number(buffer.readBigUInt64LE(index * HKL_SLOT_BYTES) & HANDLE_MASK))
  }
  return layouts
}

function layoutForWindow(hwnd) {
  if (!hwnd || !IsWindow(hwnd)) return 0
  const threadId = GetWindowThreadProcessId(hwnd, null)
  if (!threadId) return 0
  return toHandleNumber(GetKeyboardLayout(threadId))
}

function matchLayout(layouts, langWord, layoutWord) {
  return layouts.find((hkl) => {
    if ((hkl & 0xffff) !== langWord) return false
    return layoutWord === null || ((hkl >>> 16) & 0xffff) === layoutWord
  })
}

function resolveLayoutHandle(langId, klid) {
  const langWord = parseInt(langId, 16)
  if (!Number.isInteger(langWord)) return 0
  const layoutWord = klidToLayoutWord(klid)
  const existing = matchLayout(loadedLayouts(), langWord, layoutWord)
  if (existing) return existing
  const loaded = LoadKeyboardLayoutW(klid, 0)
  if (!loaded) return 0
  const rescanned = matchLayout(loadedLayouts(), langWord, layoutWord)
  if (rescanned) return rescanned
  return toHandleNumber(loaded)
}

function focusWindowForThread(threadId, fallbackHwnd) {
  const info = Buffer.alloc(GUI_THREAD_INFO_BYTES)
  info.writeUInt32LE(GUI_THREAD_INFO_BYTES, 0)
  if (!GetGUIThreadInfo(threadId, info)) return fallbackHwnd
  const focus = Number(info.readBigUInt64LE(GUI_THREAD_INFO_FOCUS_OFFSET))
  return focus || fallbackHwnd
}

function activateInputMethod(hwnd, langId, klid) {
  if (!hwnd || !IsWindow(hwnd)) return false
  const hkl = resolveLayoutHandle(langId, klid)
  if (!hkl) return false
  const threadId = GetWindowThreadProcessId(hwnd, null)
  const target = threadId ? focusWindowForThread(threadId, hwnd) : hwnd
  return PostMessageW(target, WM_INPUTLANGCHANGEREQUEST, INPUTLANGCHANGE_SYSCHARSET, hkl) !== 0
}

function resolveIndirectString(indirect, fallback) {
  if (!SHLoadIndirectString || typeof indirect !== 'string' || indirect.charAt(0) !== '@') return fallback
  try {
    const buffer = Buffer.alloc(INDIRECT_STRING_BYTES)
    if (SHLoadIndirectString(indirect, buffer, INDIRECT_STRING_BYTES / 2, null) !== 0) return fallback
    const decoded = buffer.toString('utf16le')
    const terminator = decoded.indexOf(String.fromCharCode(0))
    const text = terminator === -1 ? decoded : decoded.slice(0, terminator)
    return text || fallback
  } catch (e) {
    console.error('[keyboardLayout] indirect string error:', e.message)
    return fallback
  }
}

module.exports = {
  foregroundWindow,
  windowProcessId,
  loadedLayouts,
  layoutForWindow,
  activateInputMethod,
  resolveIndirectString,
}
