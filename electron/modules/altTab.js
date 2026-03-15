const { app, screen, nativeImage } = require('electron')
const koffi = require('koffi')

const user32 = koffi.load('user32.dll')
const gdi32 = koffi.load('gdi32.dll')
const kernel32 = koffi.load('kernel32.dll')

let DwmGetWindowAttribute = null
try {
  const dwmapi = koffi.load('dwmapi.dll')
  DwmGetWindowAttribute = dwmapi.func('__stdcall', 'DwmGetWindowAttribute', 'long', ['uintptr_t', 'uint32', 'void *', 'uint32'])
} catch (_) {}

const LowLevelKeyboardProc = koffi.proto('__stdcall', 'LowLevelKeyboardProc', 'intptr_t', ['int', 'uintptr_t', 'intptr_t'])
const WNDENUMPROC = koffi.proto('__stdcall', 'WNDENUMPROC', 'int', ['uintptr_t', 'intptr_t'])

const SetWindowsHookExW = user32.func('__stdcall', 'SetWindowsHookExW', 'uintptr_t', ['int', 'LowLevelKeyboardProc *', 'uintptr_t', 'uint32'])
const UnhookWindowsHookEx = user32.func('__stdcall', 'UnhookWindowsHookEx', 'int', ['uintptr_t'])
const CallNextHookEx = user32.func('__stdcall', 'CallNextHookEx', 'intptr_t', ['uintptr_t', 'int', 'uintptr_t', 'intptr_t'])
const GetKeyState = user32.func('__stdcall', 'GetKeyState', 'int16', ['int'])

const EnumWindows = user32.func('__stdcall', 'EnumWindows', 'int', ['WNDENUMPROC *', 'intptr_t'])
const IsWindowVisible = user32.func('__stdcall', 'IsWindowVisible', 'int', ['uintptr_t'])
const GetWindowLongW = user32.func('__stdcall', 'GetWindowLongW', 'int32', ['uintptr_t', 'int'])
const GetWindowTextW = user32.func('__stdcall', 'GetWindowTextW', 'int', ['uintptr_t', 'void *', 'int'])
const GetWindowTextLengthW = user32.func('__stdcall', 'GetWindowTextLengthW', 'int', ['uintptr_t'])
const GetWindowThreadProcessId = user32.func('__stdcall', 'GetWindowThreadProcessId', 'uint32', ['uintptr_t', 'void *'])

const SetForegroundWindow = user32.func('__stdcall', 'SetForegroundWindow', 'int', ['uintptr_t'])
const ShowWindow = user32.func('__stdcall', 'ShowWindow', 'int', ['uintptr_t', 'int'])
const IsIconic = user32.func('__stdcall', 'IsIconic', 'int', ['uintptr_t'])
const keybd_event = user32.func('__stdcall', 'keybd_event', 'void', ['uint8', 'uint8', 'uint32', 'uintptr_t'])

const PrintWindow = user32.func('__stdcall', 'PrintWindow', 'int', ['uintptr_t', 'uintptr_t', 'uint32'])
const GetWindowRect = user32.func('__stdcall', 'GetWindowRect', 'int', ['uintptr_t', 'void *'])
const GetWindowPlacement = user32.func('__stdcall', 'GetWindowPlacement', 'int', ['uintptr_t', 'void *'])
const GetDC = user32.func('__stdcall', 'GetDC', 'uintptr_t', ['uintptr_t'])
const ReleaseDC = user32.func('__stdcall', 'ReleaseDC', 'int', ['uintptr_t', 'uintptr_t'])
const CreateCompatibleDC = gdi32.func('__stdcall', 'CreateCompatibleDC', 'uintptr_t', ['uintptr_t'])
const CreateCompatibleBitmap = gdi32.func('__stdcall', 'CreateCompatibleBitmap', 'uintptr_t', ['uintptr_t', 'int', 'int'])
const SelectObject = gdi32.func('__stdcall', 'SelectObject', 'uintptr_t', ['uintptr_t', 'uintptr_t'])
const DeleteObject = gdi32.func('__stdcall', 'DeleteObject', 'int', ['uintptr_t'])
const DeleteDC = gdi32.func('__stdcall', 'DeleteDC', 'int', ['uintptr_t'])
const GetDIBits = gdi32.func('__stdcall', 'GetDIBits', 'int', ['uintptr_t', 'uintptr_t', 'uint32', 'uint32', 'void *', 'void *', 'uint32'])
const BitBlt = gdi32.func('__stdcall', 'BitBlt', 'int', ['uintptr_t', 'int', 'int', 'int', 'int', 'uintptr_t', 'int', 'int', 'uint32'])

const RtlMoveMemory = kernel32.func('__stdcall', 'RtlMoveMemory', 'void', ['void *', 'uintptr_t', 'uintptr_t'])
const OpenProcess = kernel32.func('__stdcall', 'OpenProcess', 'uintptr_t', ['uint32', 'int', 'uint32'])
const CloseHandle = kernel32.func('__stdcall', 'CloseHandle', 'int', ['uintptr_t'])
const QueryFullProcessImageNameW = kernel32.func('__stdcall', 'QueryFullProcessImageNameW', 'int', ['uintptr_t', 'uint32', 'void *', 'void *'])

const WH_KEYBOARD_LL = 13
const WM_KEYDOWN = 0x0100
const WM_KEYUP = 0x0101
const WM_SYSKEYDOWN = 0x0104
const WM_SYSKEYUP = 0x0105
const VK_TAB = 0x09
const VK_ESCAPE = 0x1B
const VK_LMENU = 0xA4
const VK_RMENU = 0xA5
const VK_SHIFT = 0x10
const SW_RESTORE = 9
const SRCCOPY = 0x00CC0020
const PW_RENDERFULLCONTENT = 2
const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
const DWMWA_CLOAKED = 14
const GWL_EXSTYLE = -20
const WS_EX_TOOLWINDOW = 0x80

const THUMBNAIL_MAX_WIDTH = 320
const THUMBNAIL_MAX_HEIGHT = 200

let overlayWindow = null
let shellsRef = null
let hookHandle = null
let hookCallbackPointer = null

let altIsDown = false
let switcherActive = false
let selectedIndex = 0
let windowList = []

const iconCache = new Map()

function getHwnd(win) {
  return win.getNativeWindowHandle().readUInt32LE(0)
}

function isOwnWindow(hwnd) {
  if (overlayWindow && !overlayWindow.isDestroyed() && getHwnd(overlayWindow) === hwnd) return true
  if (!shellsRef) return false
  for (const shell of shellsRef.values()) {
    if (!shell.topBar.isDestroyed() && getHwnd(shell.topBar) === hwnd) return true
    if (!shell.desktop.isDestroyed() && getHwnd(shell.desktop) === hwnd) return true
  }
  return false
}

function readWideString(buf, maxChars) {
  let str = ''
  for (let i = 0; i < maxChars; i++) {
    const code = buf.readUInt16LE(i * 2)
    if (code === 0) break
    str += String.fromCharCode(code)
  }
  return str
}

function getWindowTitle(hwnd) {
  const len = GetWindowTextLengthW(hwnd)
  if (len <= 0) return ''
  const buf = Buffer.alloc((len + 1) * 2)
  GetWindowTextW(hwnd, buf, len + 1)
  return readWideString(buf, len + 1)
}

function getProcessPath(pid) {
  const hProcess = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid)
  if (!hProcess) return null
  try {
    const pathBuf = Buffer.alloc(520 * 2)
    const sizeBuf = Buffer.alloc(4)
    sizeBuf.writeUInt32LE(520, 0)
    const ok = QueryFullProcessImageNameW(hProcess, 0, pathBuf, sizeBuf)
    if (!ok) return null
    const actualLen = sizeBuf.readUInt32LE(0)
    return readWideString(pathBuf, actualLen)
  } finally {
    CloseHandle(hProcess)
  }
}

function isAltTabWindow(hwnd) {
  if (!IsWindowVisible(hwnd)) return false
  const exStyle = GetWindowLongW(hwnd, GWL_EXSTYLE)
  if (exStyle & WS_EX_TOOLWINDOW) return false
  if (DwmGetWindowAttribute) {
    const cloakedBuf = Buffer.alloc(4)
    DwmGetWindowAttribute(hwnd, DWMWA_CLOAKED, cloakedBuf, 4)
    if (cloakedBuf.readUInt32LE(0) !== 0) return false
  }
  const titleLen = GetWindowTextLengthW(hwnd)
  if (titleLen <= 0) return false
  if (isOwnWindow(hwnd)) return false
  return true
}

function enumTaskWindows() {
  const windows = []
  const cb = koffi.register((hwnd, _lParam) => {
    const h = typeof hwnd === 'bigint' ? Number(hwnd) : hwnd
    if (isAltTabWindow(h)) windows.push(h)
    return 1
  }, koffi.pointer(WNDENUMPROC))
  try {
    EnumWindows(cb, 0)
  } finally {
    koffi.unregister(cb)
  }
  return windows
}

function captureWindowThumbnail(hwnd) {
  let srcWidth, srcHeight, left, top

  if (IsIconic(hwnd)) {
    const placementBuf = Buffer.alloc(44)
    placementBuf.writeUInt32LE(44, 0)
    if (!GetWindowPlacement(hwnd, placementBuf)) return null
    const rcLeft = placementBuf.readInt32LE(28)
    const rcTop = placementBuf.readInt32LE(32)
    const rcRight = placementBuf.readInt32LE(36)
    const rcBottom = placementBuf.readInt32LE(40)
    left = rcLeft
    top = rcTop
    srcWidth = rcRight - rcLeft
    srcHeight = rcBottom - rcTop
  } else {
    const rectBuf = Buffer.alloc(16)
    GetWindowRect(hwnd, rectBuf)
    left = rectBuf.readInt32LE(0)
    top = rectBuf.readInt32LE(4)
    srcWidth = rectBuf.readInt32LE(8) - left
    srcHeight = rectBuf.readInt32LE(12) - top
  }

  if (srcWidth <= 0 || srcHeight <= 0) return null

  const screenDC = GetDC(0)
  if (!screenDC) return null
  const memDC = CreateCompatibleDC(screenDC)
  const bmp = CreateCompatibleBitmap(screenDC, srcWidth, srcHeight)
  const oldBmp = SelectObject(memDC, bmp)

  try {
    let captured = PrintWindow(hwnd, memDC, PW_RENDERFULLCONTENT)
    if (!captured) captured = PrintWindow(hwnd, memDC, 0)
    if (!captured) BitBlt(memDC, 0, 0, srcWidth, srcHeight, screenDC, left, top, SRCCOPY)

    const biHeader = Buffer.alloc(40)
    biHeader.writeUInt32LE(40, 0)
    biHeader.writeInt32LE(srcWidth, 4)
    biHeader.writeInt32LE(-srcHeight, 8)
    biHeader.writeUInt16LE(1, 12)
    biHeader.writeUInt16LE(32, 14)

    const pixelData = Buffer.alloc(srcWidth * srcHeight * 4)
    if (!GetDIBits(memDC, bmp, 0, srcHeight, pixelData, biHeader, 0)) return null

    for (let i = 0; i < pixelData.length; i += 4) {
      const b = pixelData[i]
      pixelData[i] = pixelData[i + 2]
      pixelData[i + 2] = b
    }

    const img = nativeImage.createFromBitmap(pixelData, { width: srcWidth, height: srcHeight })
    const scale = Math.min(THUMBNAIL_MAX_WIDTH / srcWidth, THUMBNAIL_MAX_HEIGHT / srcHeight, 1.0)
    const resized = img.resize({ width: Math.round(srcWidth * scale), height: Math.round(srcHeight * scale), quality: 'good' })
    return resized.toDataURL()
  } catch (_) {
    return null
  } finally {
    SelectObject(memDC, oldBmp)
    DeleteObject(bmp)
    DeleteDC(memDC)
    ReleaseDC(0, screenDC)
  }
}

function getIconSync(exePath) {
  if (!exePath) return ''
  const key = exePath.toLowerCase()
  if (iconCache.has(key)) return iconCache.get(key) || ''
  app.getFileIcon(exePath, { size: 'normal' }).then((icon) => {
    iconCache.set(key, icon.toDataURL())
  }).catch(() => {
    iconCache.set(key, null)
  })
  return ''
}

function buildWindowListSync() {
  const hwnds = enumTaskWindows()
  const results = []
  for (const hwnd of hwnds) {
    const title = getWindowTitle(hwnd)
    if (!title) continue
    const pidBuf = Buffer.alloc(4)
    GetWindowThreadProcessId(hwnd, pidBuf)
    const pid = pidBuf.readUInt32LE(0)
    const exePath = getProcessPath(pid)
    const processName = exePath ? exePath.split('\\').pop().replace(/\.exe$/i, '') : 'Unknown'
    const icon = getIconSync(exePath)
    const thumbnail = captureWindowThumbnail(hwnd)
    results.push({ hwnd, title, processName, icon, thumbnail: thumbnail || '' })
  }
  return results
}

function activateWindow(hwnd) {
  if (IsIconic(hwnd)) ShowWindow(hwnd, SW_RESTORE)
  keybd_event(0xA4, 0, 0, 0)
  SetForegroundWindow(hwnd)
  keybd_event(0xA4, 0, 2, 0)
}

function showSwitcher() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return

  windowList = buildWindowListSync()
  if (windowList.length === 0) return

  selectedIndex = windowList.length > 1 ? 1 : 0
  switcherActive = true

  const cursor = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursor)
  const { x, y, width, height } = display.bounds

  overlayWindow.setBounds({ x, y, width, height })

  overlayWindow.showInactive()
  overlayWindow.webContents.send('alttab/show', { windows: windowList, selectedIndex })
}

function hideSwitcher() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return
  switcherActive = false
  windowList = []
  overlayWindow.hide()
  overlayWindow.webContents.send('alttab/hide')
}

function cycleSelection(forward) {
  if (windowList.length === 0) return
  if (forward) {
    selectedIndex = (selectedIndex + 1) % windowList.length
  } else {
    selectedIndex = (selectedIndex - 1 + windowList.length) % windowList.length
  }
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('alttab/selection-changed', selectedIndex)
  }
}

function readVkCode(lParam) {
  const lp = typeof lParam === 'bigint' ? Number(lParam) : lParam
  const buf = Buffer.alloc(4)
  RtlMoveMemory(buf, lp, 4)
  return buf.readUInt32LE(0)
}

function hookCallback(nCode, wParam, lParam) {
  try {
    if (nCode < 0) return CallNextHookEx(hookHandle, nCode, wParam, lParam)

    const vkCode = readVkCode(lParam)
    const wp = Number(wParam)
    const isKeyDown = (wp === WM_KEYDOWN || wp === WM_SYSKEYDOWN)
    const isKeyUp = (wp === WM_KEYUP || wp === WM_SYSKEYUP)

    if (vkCode === VK_TAB && isKeyDown && altIsDown) {
      const shiftDown = (GetKeyState(VK_SHIFT) & 0x8000) !== 0
      if (!switcherActive) {
        showSwitcher()
      } else {
        cycleSelection(!shiftDown)
      }
      return 1
    }

    if (vkCode === VK_LMENU || vkCode === VK_RMENU) {
      if (isKeyDown) {
        altIsDown = true
      }
      if (isKeyUp) {
        altIsDown = false
        if (switcherActive) {
          const selected = windowList[selectedIndex]
          hideSwitcher()
          if (selected) activateWindow(selected.hwnd)
        }
      }
    }

    if (vkCode === VK_ESCAPE && isKeyDown && switcherActive) {
      hideSwitcher()
      altIsDown = false
      return 1
    }
  } catch (e) {
    console.error('[altTab] hook error:', e.message)
  }

  return CallNextHookEx(hookHandle, nCode, wParam, lParam)
}

function installHook() {
  hookCallbackPointer = koffi.register(hookCallback, koffi.pointer(LowLevelKeyboardProc))
  hookHandle = SetWindowsHookExW(WH_KEYBOARD_LL, hookCallbackPointer, 0, 0)
  const h = typeof hookHandle === 'bigint' ? Number(hookHandle) : hookHandle
  if (!h) {
    console.error('[altTab] Failed to install keyboard hook')
  } else {
    console.log('[altTab] Keyboard hook installed, handle:', h)
  }
}

function uninstallHook() {
  if (hookHandle) {
    UnhookWindowsHookEx(hookHandle)
    hookHandle = null
  }
  if (hookCallbackPointer) {
    koffi.unregister(hookCallbackPointer)
    hookCallbackPointer = null
  }
}

module.exports = {
  handlers: {
    'alttab/activate': (_event, hwnd) => {
      activateWindow(hwnd)
    },
  },

  setOverlayWindow(win) {
    overlayWindow = win
  },

  setShells(shells) {
    shellsRef = shells
  },

  start(_broadcast) {
    installHook()
    app.on('will-quit', () => {
      uninstallHook()
    })
  },
}
