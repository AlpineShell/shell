const windowEnum = require('./windowEnum')

const SHELL_TRAY_CLASS = 'Shell_TrayWnd'
const EXPLORER_PROCESS_NAME = 'explorer'
const MAX_SHELL_TRAY_WINDOWS = 32

let bindings = null

function loadBindings() {
  if (bindings) return bindings
  const koffi = require('koffi')
  const user32 = koffi.load('user32.dll')
  bindings = {
    FindWindowExW: user32.func('__stdcall', 'FindWindowExW', 'uintptr_t', ['uintptr_t', 'uintptr_t', 'str16', 'str16']),
  }
  return bindings
}

function shellTrayWindows() {
  const { FindWindowExW } = loadBindings()
  const handles = []
  let previous = 0
  while (handles.length < MAX_SHELL_TRAY_WINDOWS) {
    const hwnd = FindWindowExW(0, previous, SHELL_TRAY_CLASS, null)
    if (!hwnd) break
    handles.push(hwnd)
    previous = hwnd
  }
  return handles
}

function ownerProcessName(hwnd) {
  const processId = windowEnum.windowProcessId(hwnd)
  if (!processId) return ''
  return windowEnum.processNameFromPath(windowEnum.processImagePath(processId)).toLowerCase()
}

function hostedShellWindows() {
  return shellTrayWindows().filter(hwnd => ownerProcessName(hwnd) === EXPLORER_PROCESS_NAME)
}

function probeHostedShellWindows() {
  try {
    return hostedShellWindows()
  } catch {
    bindings = null
  }
  try {
    return hostedShellWindows()
  } catch (e) {
    console.error('[explorerShell] could not inspect the notification area:', e.message)
    return null
  }
}

function shellHostedByExplorer() {
  const windows = probeHostedShellWindows()
  return windows === null ? null : windows.length > 0
}

module.exports = { shellHostedByExplorer }
