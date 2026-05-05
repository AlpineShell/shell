const koffi = require('koffi')

const user32 = koffi.load('user32.dll')
const kernel32 = koffi.load('kernel32.dll')

const GetForegroundWindow = user32.func('__stdcall', 'GetForegroundWindow', 'uintptr_t', [])
const GetWindowThreadProcessId = user32.func('__stdcall', 'GetWindowThreadProcessId', 'uint32', ['uintptr_t', 'void *'])
const SetForegroundWindow = user32.func('__stdcall', 'SetForegroundWindow', 'int', ['uintptr_t'])
const BringWindowToTop = user32.func('__stdcall', 'BringWindowToTop', 'int', ['uintptr_t'])
const AttachThreadInput = user32.func('__stdcall', 'AttachThreadInput', 'int', ['uint32', 'uint32', 'int'])
const GetCurrentThreadId = kernel32.func('__stdcall', 'GetCurrentThreadId', 'uint32', [])

function toNum(v) {
  return typeof v === 'bigint' ? Number(v) : v
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

module.exports = { forceForeground }
