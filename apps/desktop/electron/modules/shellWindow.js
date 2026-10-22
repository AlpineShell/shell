const koffi = require('koffi')
const { shellHookAppCommand } = require('./appCommandPolicy')

const user32 = koffi.load('user32.dll')
const gdi32 = koffi.load('gdi32.dll')
const kernel32 = koffi.load('kernel32.dll')

const WNDPROC = koffi.proto('__stdcall', 'ShellWndProc', 'intptr_t', ['uintptr_t', 'uint32', 'uintptr_t', 'intptr_t'])

const WNDCLASSEXW = koffi.struct('WNDCLASSEXW_SHELL', {
  cbSize: 'uint32',
  style: 'uint32',
  lpfnWndProc: koffi.pointer(WNDPROC),
  cbClsExtra: 'int32',
  cbWndExtra: 'int32',
  hInstance: 'uintptr_t',
  hIcon: 'uintptr_t',
  hCursor: 'uintptr_t',
  hbrBackground: 'uintptr_t',
  lpszMenuName: 'str16',
  lpszClassName: 'str16',
  hIconSm: 'uintptr_t',
})

const INITCOMMONCONTROLSEX = koffi.struct('INITCOMMONCONTROLSEX_SHELL', {
  dwSize: 'uint32',
  dwICC: 'uint32',
})

const RegisterClassExW = user32.func('__stdcall', 'RegisterClassExW', 'uint16', [koffi.pointer(WNDCLASSEXW)])
const CreateWindowExW = user32.func('__stdcall', 'CreateWindowExW', 'uintptr_t', ['uint32', 'str16', 'str16', 'uint32', 'int', 'int', 'int', 'int', 'uintptr_t', 'uintptr_t', 'uintptr_t', 'void *'])
const DefWindowProcW = user32.func('__stdcall', 'DefWindowProcW', 'intptr_t', ['uintptr_t', 'uint32', 'uintptr_t', 'intptr_t'])
const DestroyWindow = user32.func('__stdcall', 'DestroyWindow', 'int', ['uintptr_t'])
const ShowWindow = user32.func('__stdcall', 'ShowWindow', 'int', ['uintptr_t', 'int'])
const SetWindowPos = user32.func('__stdcall', 'SetWindowPos', 'int', ['uintptr_t', 'uintptr_t', 'int', 'int', 'int', 'int', 'uint32'])
const GetSystemMetrics = user32.func('__stdcall', 'GetSystemMetrics', 'int', ['int'])
const SetShellWindow = user32.func('__stdcall', 'SetShellWindow', 'int', ['uintptr_t'])
const SetTaskmanWindow = user32.func('__stdcall', 'SetTaskmanWindow', 'int', ['uintptr_t'])
const RegisterShellHookWindow = user32.func('__stdcall', 'RegisterShellHookWindow', 'int', ['uintptr_t'])
const RegisterWindowMessageW = user32.func('__stdcall', 'RegisterWindowMessageW', 'uint32', ['str16'])
const GetShellWindow = user32.func('__stdcall', 'GetShellWindow', 'uintptr_t', [])
const GetWindow = user32.func('__stdcall', 'GetWindow', 'uintptr_t', ['uintptr_t', 'uint32'])
const IsWindowVisible = user32.func('__stdcall', 'IsWindowVisible', 'int', ['uintptr_t'])
const MoveWindow = user32.func('__stdcall', 'MoveWindow', 'int', ['uintptr_t', 'int', 'int', 'int', 'int', 'int'])
const GetModuleHandleW = kernel32.func('__stdcall', 'GetModuleHandleW', 'uintptr_t', ['str16'])
const GetLastError = kernel32.func('__stdcall', 'GetLastError', 'uint32', [])
const GetStockObject = gdi32.func('__stdcall', 'GetStockObject', 'uintptr_t', ['int'])

let InitCommonControlsEx = null
try {
  const comctl32 = koffi.load('comctl32.dll')
  InitCommonControlsEx = comctl32.func('__stdcall', 'InitCommonControlsEx', 'int', [koffi.pointer(INITCOMMONCONTROLSEX)])
} catch {}

const SM_XVIRTUALSCREEN = 76
const SM_YVIRTUALSCREEN = 77
const SM_CXVIRTUALSCREEN = 78
const SM_CYVIRTUALSCREEN = 79

const WS_POPUP = 0x80000000
const WS_CHILD = 0x40000000
const WS_VISIBLE = 0x10000000
const WS_CLIPCHILDREN = 0x02000000
const WS_CLIPSIBLINGS = 0x04000000
const SW_SHOWNA = 8
const BLACK_BRUSH = 4
const HWND_BOTTOM = 1
const SWP_NOSIZE = 0x0001
const SWP_NOMOVE = 0x0002
const SWP_NOACTIVATE = 0x0010
const ICC_LISTVIEW_CLASSES = 0x00000001
const GW_HWNDNEXT = 2
const GW_CHILD = 5
const WM_MOUSEACTIVATE = 0x0021
const MA_NOACTIVATE = 3

const PROGMAN_STYLE = (WS_POPUP | WS_CLIPCHILDREN | WS_CLIPSIBLINGS) >>> 0
const CHILD_STYLE = (WS_CHILD | WS_VISIBLE | WS_CLIPSIBLINGS) >>> 0

let progman = 0
let workerw = 0
let defview = 0
let listview = 0
let wndProcPtr = null
let registered = false
let shellHookMessage = 0
let appCommandListener = null

function toNum(value) {
  return typeof value === 'bigint' ? Number(value) : value
}

function dispatchAppCommand(hookCode, lParam) {
  const appCommand = shellHookAppCommand(hookCode, lParam)
  if (appCommand === null || !appCommandListener) return
  setImmediate(() => {
    try { appCommandListener(appCommand) } catch (e) { console.error('[shellWindow] app command error:', e.message) }
  })
}

function shellWndProc(h, msg, wParam, lParam) {
  if (msg === WM_MOUSEACTIVATE) return MA_NOACTIVATE
  if (shellHookMessage && msg === shellHookMessage) dispatchAppCommand(wParam, lParam)
  return DefWindowProcW(h, msg, wParam, lParam)
}

function onAppCommand(listener) {
  appCommandListener = typeof listener === 'function' ? listener : null
}

function registerClass(name, hInstance) {
  const wc = {
    cbSize: koffi.sizeof(WNDCLASSEXW),
    style: 0,
    lpfnWndProc: wndProcPtr,
    cbClsExtra: 0,
    cbWndExtra: 0,
    hInstance,
    hIcon: 0,
    hCursor: 0,
    hbrBackground: GetStockObject(BLACK_BRUSH),
    lpszMenuName: null,
    lpszClassName: name,
    hIconSm: 0,
  }
  return RegisterClassExW(wc) !== 0
}

function virtualScreenBounds() {
  return {
    x: GetSystemMetrics(SM_XVIRTUALSCREEN),
    y: GetSystemMetrics(SM_YVIRTUALSCREEN),
    cx: GetSystemMetrics(SM_CXVIRTUALSCREEN),
    cy: GetSystemMetrics(SM_CYVIRTUALSCREEN),
  }
}

function create() {
  if (toNum(progman)) return progman
  const hInstance = GetModuleHandleW(null)
  wndProcPtr = koffi.register(shellWndProc, koffi.pointer(WNDPROC))

  const { x, y, cx, cy } = virtualScreenBounds()

  if (!registerClass('Progman', hInstance)) {
    console.error('[shellWindow] RegisterClassExW(Progman) failed')
    return 0
  }
  registerClass('WorkerW', hInstance)
  registerClass('SHELLDLL_DefView', hInstance)

  progman = CreateWindowExW(0, 'Progman', 'Program Manager', PROGMAN_STYLE, x, y, cx, cy, 0, 0, hInstance, null)
  if (!toNum(progman)) {
    console.error(`[shellWindow] CreateWindowExW(Progman) failed err=${GetLastError()}`)
    return 0
  }
  ShowWindow(progman, SW_SHOWNA)
  SetWindowPos(progman, HWND_BOTTOM, 0, 0, 0, 0, SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE)

  workerw = CreateWindowExW(0, 'WorkerW', null, CHILD_STYLE, 0, 0, cx, cy, progman, 0, hInstance, null)
  defview = CreateWindowExW(0, 'SHELLDLL_DefView', null, CHILD_STYLE, 0, 0, cx, cy, progman, 0, hInstance, null)

  if (InitCommonControlsEx && toNum(defview)) {
    try {
      InitCommonControlsEx({ dwSize: koffi.sizeof(INITCOMMONCONTROLSEX), dwICC: ICC_LISTVIEW_CLASSES })
      listview = CreateWindowExW(0, 'SysListView32', 'FolderView', CHILD_STYLE, 0, 0, cx, cy, defview, 0, hInstance, null)
      if (!toNum(listview)) console.warn(`[shellWindow] SysListView32 create failed err=${GetLastError()}`)
    } catch (e) {
      console.warn('[shellWindow] listview init error:', e.message)
    }
  }

  return progman
}

function register() {
  if (registered) return
  try {
    create()
    if (!toNum(progman)) return

    const existing = GetShellWindow()
    if (toNum(existing) && toNum(existing) !== toNum(progman)) {
      console.warn(`[shellWindow] a shell window already exists (hwnd=${toNum(existing)}); explorer or another shell may still own it`)
    }

    const shellOk = SetShellWindow(progman)
    const shellErr = toNum(shellOk) ? 0 : GetLastError()
    const taskmanOk = SetTaskmanWindow(progman)
    shellHookMessage = RegisterWindowMessageW('SHELLHOOK')
    const hookOk = RegisterShellHookWindow(progman)
    const current = GetShellWindow()
    const match = toNum(current) === toNum(progman)

    console.log(`[shellWindow] progman=${toNum(progman)} workerw=${toNum(workerw)} defview=${toNum(defview)} listview=${toNum(listview)} SetShellWindow=${toNum(shellOk)}${shellErr ? ` err=${shellErr}` : ''} SetTaskmanWindow=${toNum(taskmanOk)} RegisterShellHookWindow=${toNum(hookOk)} GetShellWindow=${toNum(current)} match=${match}`)
    registered = true
  } catch (e) {
    console.error('[shellWindow] register error:', e.message)
  }
}

function fitToVirtualScreen() {
  if (!toNum(progman)) return
  try {
    const { x, y, cx, cy } = virtualScreenBounds()
    SetWindowPos(progman, HWND_BOTTOM, x, y, cx, cy, SWP_NOACTIVATE)
    for (const child of [workerw, defview, listview]) {
      if (toNum(child)) MoveWindow(child, 0, 0, cx, cy, 1)
    }
  } catch (e) {
    console.error('[shellWindow] fitToVirtualScreen error:', e.message)
  }
}

function hasLiveWallpaper() {
  if (!toNum(workerw)) return false
  let child = GetWindow(workerw, GW_CHILD)
  while (toNum(child)) {
    if (IsWindowVisible(child)) return true
    child = GetWindow(child, GW_HWNDNEXT)
  }
  return false
}

function destroy() {
  for (const handle of [listview, defview, workerw, progman]) {
    try {
      if (toNum(handle)) DestroyWindow(handle)
    } catch {}
  }
  progman = 0
  workerw = 0
  defview = 0
  listview = 0
  registered = false
}

module.exports = { register, destroy, onAppCommand, fitToVirtualScreen, hasLiveWallpaper }
