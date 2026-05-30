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
const GetForegroundWindow = user32.func('__stdcall', 'GetForegroundWindow', 'uintptr_t', [])
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
const VK_S = 0x53
const VK_LWIN = 0x5B
const VK_RWIN = 0x5C
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
let activeTopBar = null
let shellsRef = null
let hookHandle = null
let hookCallbackPointer = null
let screenshotCallback = null
let screenshotCancelCallback = null

let altIsDown = false
let switcherActive = false
let selectedIndex = 0
let windowList = []

let winLauncherEnabled = false
let winLauncherCallback = null
let winDown = false
let winTapped = false

const iconCache = new Map()
const thumbnailCache = new Map()

function getHwnd(win) {
  return win.getNativeWindowHandle().readUInt32LE(0)
}

function isOwnWindow(hwnd) {
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
  if (IsIconic(hwnd)) return thumbnailCache.get(hwnd) || null

  const rectBuf = Buffer.alloc(16)
  GetWindowRect(hwnd, rectBuf)
  const left = rectBuf.readInt32LE(0)
  const top = rectBuf.readInt32LE(4)
  const srcWidth = rectBuf.readInt32LE(8) - left
  const srcHeight = rectBuf.readInt32LE(12) - top
  if (srcWidth <= 0 || srcHeight <= 0) return thumbnailCache.get(hwnd) || null

  const screenDC = GetDC(0)
  if (!screenDC) return thumbnailCache.get(hwnd) || null
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
    if (!GetDIBits(memDC, bmp, 0, srcHeight, pixelData, biHeader, 0)) return thumbnailCache.get(hwnd) || null

    for (let i = 3; i < pixelData.length; i += 4) {
      pixelData[i] = 255
    }

    const img = nativeImage.createFromBitmap(pixelData, { width: srcWidth, height: srcHeight })
    const scale = Math.min(THUMBNAIL_MAX_WIDTH / srcWidth, THUMBNAIL_MAX_HEIGHT / srcHeight, 1.0)
    const resized = img.resize({ width: Math.round(srcWidth * scale), height: Math.round(srcHeight * scale), quality: 'good' })
    const dataUrl = resized.toDataURL()
    thumbnailCache.set(hwnd, dataUrl)
    return dataUrl
  } catch (_) {
    return thumbnailCache.get(hwnd) || null
  } finally {
    SelectObject(memDC, oldBmp)
    DeleteObject(bmp)
    DeleteDC(memDC)
    ReleaseDC(0, screenDC)
  }
}

async function getIcon(exePath) {
  if (!exePath) return ''
  const key = exePath.toLowerCase()
  if (iconCache.has(key)) return iconCache.get(key) || ''
  try {
    const icon = await app.getFileIcon(exePath, { size: 'normal' })
    const dataUrl = icon.toDataURL()
    iconCache.set(key, dataUrl)
    return dataUrl
  } catch {
    iconCache.set(key, null)
    return ''
  }
}

const SHELL_PROCESS_NAMES = new Set(['electron', 'alpine-shell', 'alpine shell'])

const { SETTINGS_ICON_DATA_URL } = require('../settingsIcon')

async function buildWindowList() {
  const hwnds = enumTaskWindows()
  const results = []
  for (const hwnd of hwnds) {
    const title = getWindowTitle(hwnd)
    if (!title) continue
    const pidBuf = Buffer.alloc(4)
    GetWindowThreadProcessId(hwnd, pidBuf)
    const pid = pidBuf.readUInt32LE(0)
    const exePath = getProcessPath(pid)
    const rawProcessName = exePath ? exePath.split('\\').pop().replace(/\.exe$/i, '') : 'Unknown'
    const isAlpineShell = SHELL_PROCESS_NAMES.has(rawProcessName.toLowerCase())
    const processName = isAlpineShell ? title : rawProcessName
    const icon = isAlpineShell && title === 'Settings'
      ? SETTINGS_ICON_DATA_URL
      : await getIcon(exePath)
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

function moveOffscreen() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return
  overlayWindow.setBounds({ x: -10000, y: -10000, width: 1, height: 1 })
}

function getActiveDisplay() {
  const fgRaw = GetForegroundWindow()
  const fgHwnd = typeof fgRaw === 'bigint' ? Number(fgRaw) : fgRaw

  if (fgHwnd && !isOwnWindow(fgHwnd)) {
    const rectBuf = Buffer.alloc(16)
    if (GetWindowRect(fgHwnd, rectBuf)) {
      const left = rectBuf.readInt32LE(0)
      const top = rectBuf.readInt32LE(4)
      const right = rectBuf.readInt32LE(8)
      const bottom = rectBuf.readInt32LE(12)
      if (right > left && bottom > top) {
        const centerScreen = { x: Math.round((left + right) / 2), y: Math.round((top + bottom) / 2) }
        let centerDip = centerScreen
        try {
          centerDip = screen.screenToDipPoint(centerScreen)
        } catch {}

        const allDisplays = screen.getAllDisplays()
        const containing = allDisplays.find((d) =>
          centerDip.x >= d.bounds.x &&
          centerDip.x < d.bounds.x + d.bounds.width &&
          centerDip.y >= d.bounds.y &&
          centerDip.y < d.bounds.y + d.bounds.height
        )
        if (containing) return containing
        return screen.getDisplayNearestPoint(centerDip)
      }
    }
  }
  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
}

async function showSwitcher() {
  if (!shellsRef) return

  windowList = await buildWindowList()
  if (windowList.length === 0) return

  selectedIndex = windowList.length > 1 ? 1 : 0
  switcherActive = true

  const display = getActiveDisplay()
  const shell = shellsRef.get(display.id)
  if (!shell || shell.topBar.isDestroyed()) return

  const topBar = shell.topBar
  activeTopBar = topBar

  const bounds = topBar.getBounds()
  topBar.setBounds({ ...bounds, height: 600 })
  topBar.setAlwaysOnTop(true, 'screen-saver')
  topBar.setIgnoreMouseEvents(false)

  topBar.webContents.send('alttab/show', { windows: windowList, selectedIndex })
}

function hideSwitcher() {
  switcherActive = false
  windowList = []
  if (activeTopBar && !activeTopBar.isDestroyed()) {
    activeTopBar.webContents.send('alttab/hide')
    activeTopBar.setAlwaysOnTop(false)
    activeTopBar.setBounds({ ...activeTopBar.getBounds(), height: 24 })
  }
  activeTopBar = null
}

function cycleSelection(forward) {
  if (windowList.length === 0) return
  if (forward) {
    selectedIndex = (selectedIndex + 1) % windowList.length
  } else {
    selectedIndex = (selectedIndex - 1 + windowList.length) % windowList.length
  }
  if (activeTopBar && !activeTopBar.isDestroyed()) {
    activeTopBar.webContents.send('alttab/selection-changed', selectedIndex)
  }
}

function readVkCode(lParam) {
  const lp = typeof lParam === 'bigint' ? Number(lParam) : lParam
  const buf = Buffer.alloc(4)
  RtlMoveMemory(buf, lp, 4)
  return buf.readUInt32LE(0)
}

function readKeyFlags(lParam) {
  const lp = typeof lParam === 'bigint' ? Number(lParam) : lParam
  const buf = Buffer.alloc(4)
  RtlMoveMemory(buf, lp + 8, 4)
  return buf.readUInt32LE(0)
}

const LLKHF_INJECTED = 0x10
const KEYEVENTF_KEYUP = 0x0002

function hookCallback(nCode, wParam, lParam) {
  try {
    if (nCode < 0) return CallNextHookEx(hookHandle, nCode, wParam, lParam)

    const flags = readKeyFlags(lParam)
    if (flags & LLKHF_INJECTED) {
      return CallNextHookEx(hookHandle, nCode, wParam, lParam)
    }

    const vkCode = readVkCode(lParam)
    const wp = Number(wParam)
    const isKeyDown = (wp === WM_KEYDOWN || wp === WM_SYSKEYDOWN)
    const isKeyUp = (wp === WM_KEYUP || wp === WM_SYSKEYUP)

    if (winLauncherEnabled) {
      if (vkCode === VK_LWIN || vkCode === VK_RWIN) {
        if (isKeyDown && !winDown) {
          winDown = true
          winTapped = true
        } else if (isKeyUp) {
          const fired = winTapped
          winDown = false
          winTapped = false
          if (fired && winLauncherCallback) {
            setImmediate(() => {
              keybd_event(VK_LWIN, 0, KEYEVENTF_KEYUP, 0)
              keybd_event(VK_RWIN, 0, KEYEVENTF_KEYUP, 0)
              winLauncherCallback()
            })
            return 1
          }
        }
      } else if (isKeyDown && winDown) {
        winTapped = false
      }
    }

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

    if (vkCode === VK_S && isKeyDown) {
      const shiftDown = (GetKeyState(VK_SHIFT) & 0x8000) !== 0
      const winDown = (GetKeyState(VK_LWIN) & 0x8000) !== 0 || (GetKeyState(VK_RWIN) & 0x8000) !== 0
      if (shiftDown && winDown && screenshotCallback) {
        setImmediate(() => screenshotCallback())
        return 1
      }
    }

    if (vkCode === VK_ESCAPE && isKeyDown && screenshotCancelCallback) {
      const handled = screenshotCancelCallback()
      if (handled) return 1
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

  isAltTabActive(win) {
    return activeTopBar === win
  },

  isSwitcherActive() {
    return switcherActive
  },

  setShells(shells) {
    shellsRef = shells
  },

  onScreenshot(callback, cancelCallback) {
    screenshotCallback = callback
    screenshotCancelCallback = cancelCallback
  },

  setWinLauncherEnabled(enabled) {
    winLauncherEnabled = !!enabled
    if (!winLauncherEnabled) {
      winDown = false
      winTapped = false
    }
  },

  onWinLauncher(callback) {
    winLauncherCallback = callback
  },

  start(_broadcast) {
    installHook()
    app.on('will-quit', () => {
      uninstallHook()
    })
  },
}
