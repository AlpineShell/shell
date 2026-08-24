const fs = require('fs')
const koffi = require('koffi')

const GWL_EXSTYLE = -20
const GW_OWNER = 4
const WS_EX_TOOLWINDOW = 0x00000080
const WS_EX_APPWINDOW = 0x00040000
const DWMWA_CLOAKED = 14
const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
const MAX_IMAGE_PATH_CHARS = 520

let bindings = null
let enumeratedHandles = []
let enumeratingPredicate = null

function toWindowHandle(value) {
  return typeof value === 'bigint' ? Number(value) : value
}

function loadBindings() {
  if (bindings) return bindings

  const user32 = koffi.load('user32.dll')
  const kernel32 = koffi.load('kernel32.dll')

  const WINDOW_ENUM_PROC = koffi.proto('__stdcall', 'WindowEnumCallback', 'int', ['uintptr_t', 'intptr_t'])

  let DwmGetWindowAttribute = null
  try {
    const dwmapi = koffi.load('dwmapi.dll')
    DwmGetWindowAttribute = dwmapi.func('__stdcall', 'DwmGetWindowAttribute', 'long', ['uintptr_t', 'uint32', 'void *', 'uint32'])
  } catch (_) {}

  let GetFileVersionInfoSizeW = null
  let GetFileVersionInfoW = null
  let VerQueryValueW = null
  try {
    const version = koffi.load('version.dll')
    GetFileVersionInfoSizeW = version.func('__stdcall', 'GetFileVersionInfoSizeW', 'uint32', ['str16', 'void *'])
    GetFileVersionInfoW = version.func('__stdcall', 'GetFileVersionInfoW', 'int', ['str16', 'uint32', 'uint32', 'void *'])
    VerQueryValueW = version.func('__stdcall', 'VerQueryValueW', 'int', ['void *', 'str16', koffi.out(koffi.pointer('void *')), koffi.out(koffi.pointer('uint32'))])
  } catch (_) {}

  const enumProc = koffi.register((hwnd) => {
    const handle = toWindowHandle(hwnd)
    if (enumeratingPredicate(handle, windowProbe)) enumeratedHandles.push(handle)
    return 1
  }, koffi.pointer(WINDOW_ENUM_PROC))

  bindings = {
    EnumWindows: user32.func('__stdcall', 'EnumWindows', 'int', ['WindowEnumCallback *', 'intptr_t']),
    IsWindowVisible: user32.func('__stdcall', 'IsWindowVisible', 'int', ['uintptr_t']),
    GetWindowLongW: user32.func('__stdcall', 'GetWindowLongW', 'int32', ['uintptr_t', 'int']),
    GetWindow: user32.func('__stdcall', 'GetWindow', 'uintptr_t', ['uintptr_t', 'uint32']),
    GetWindowTextW: user32.func('__stdcall', 'GetWindowTextW', 'int', ['uintptr_t', 'void *', 'int']),
    GetWindowTextLengthW: user32.func('__stdcall', 'GetWindowTextLengthW', 'int', ['uintptr_t']),
    GetWindowThreadProcessId: user32.func('__stdcall', 'GetWindowThreadProcessId', 'uint32', ['uintptr_t', 'void *']),
    OpenProcess: kernel32.func('__stdcall', 'OpenProcess', 'uintptr_t', ['uint32', 'int', 'uint32']),
    CloseHandle: kernel32.func('__stdcall', 'CloseHandle', 'int', ['uintptr_t']),
    QueryFullProcessImageNameW: kernel32.func('__stdcall', 'QueryFullProcessImageNameW', 'int', ['uintptr_t', 'uint32', 'void *', 'void *']),
    GetFileVersionInfoSizeW,
    GetFileVersionInfoW,
    VerQueryValueW,
    DwmGetWindowAttribute,
    enumProc,
  }
  return bindings
}

function readWideString(buffer, maxChars) {
  let text = ''
  for (let i = 0; i < maxChars; i++) {
    const code = buffer.readUInt16LE(i * 2)
    if (code === 0) break
    text += String.fromCharCode(code)
  }
  return text
}

function processNameFromPath(exePath) {
  if (!exePath) return ''
  const segment = String(exePath).split(/[\\/]/).pop()
  if (!segment) return ''
  return segment.replace(/\.exe$/i, '')
}

function taskbarWindowPredicate(hwnd, probe) {
  if (!probe.isVisible(hwnd)) return false
  if (probe.titleLength(hwnd) <= 0) return false
  const exStyle = probe.exStyle(hwnd)
  if ((exStyle & WS_EX_TOOLWINDOW) !== 0) return false
  if (probe.hasOwner(hwnd) && (exStyle & WS_EX_APPWINDOW) === 0) return false
  return !probe.isCloaked(hwnd)
}

const windowProbe = {
  isVisible(hwnd) {
    return loadBindings().IsWindowVisible(hwnd) !== 0
  },
  titleLength(hwnd) {
    return loadBindings().GetWindowTextLengthW(hwnd)
  },
  exStyle(hwnd) {
    return loadBindings().GetWindowLongW(hwnd, GWL_EXSTYLE)
  },
  hasOwner(hwnd) {
    return Boolean(loadBindings().GetWindow(hwnd, GW_OWNER))
  },
  isCloaked(hwnd) {
    const { DwmGetWindowAttribute } = loadBindings()
    if (!DwmGetWindowAttribute) return false
    const cloaked = Buffer.alloc(4)
    DwmGetWindowAttribute(hwnd, DWMWA_CLOAKED, cloaked, 4)
    return cloaked.readUInt32LE(0) !== 0
  },
}

function enumerateWindows(predicate) {
  const native = loadBindings()
  enumeratedHandles = []
  enumeratingPredicate = predicate
  try {
    native.EnumWindows(native.enumProc, 0)
  } finally {
    enumeratingPredicate = null
  }
  return enumeratedHandles
}

function windowTitle(hwnd) {
  const native = loadBindings()
  const length = native.GetWindowTextLengthW(hwnd)
  if (length <= 0) return ''
  const buffer = Buffer.alloc((length + 1) * 2)
  native.GetWindowTextW(hwnd, buffer, length + 1)
  return readWideString(buffer, length + 1)
}

function windowProcessId(hwnd) {
  const native = loadBindings()
  const buffer = Buffer.alloc(4)
  native.GetWindowThreadProcessId(hwnd, buffer)
  return buffer.readUInt32LE(0)
}

function processImagePath(processId) {
  const native = loadBindings()
  const handle = native.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, processId)
  if (!handle) return null
  try {
    const pathBuffer = Buffer.alloc(MAX_IMAGE_PATH_CHARS * 2)
    const sizeBuffer = Buffer.alloc(4)
    sizeBuffer.writeUInt32LE(MAX_IMAGE_PATH_CHARS, 0)
    if (!native.QueryFullProcessImageNameW(handle, 0, pathBuffer, sizeBuffer)) return null
    return readWideString(pathBuffer, sizeBuffer.readUInt32LE(0))
  } finally {
    native.CloseHandle(handle)
  }
}

function readVersionString(native, block, language, codePage, field) {
  const key = `\\StringFileInfo\\${language.toString(16).padStart(4, '0')}${codePage.toString(16).padStart(4, '0')}\\${field}`
  const valuePointer = [null]
  const valueLength = [0]
  if (!native.VerQueryValueW(block, key, valuePointer, valueLength)) return null
  if (!valueLength[0] || !valuePointer[0]) return null
  const codes = koffi.decode(valuePointer[0], koffi.array('uint16', valueLength[0]))
  let text = ''
  for (const code of codes) {
    if (code === 0) break
    text += String.fromCharCode(code)
  }
  return text || null
}

function readFileDescription(exePath) {
  const native = loadBindings()
  if (!native.GetFileVersionInfoSizeW || !native.GetFileVersionInfoW || !native.VerQueryValueW) return null
  const versionHandle = Buffer.alloc(4)
  const size = native.GetFileVersionInfoSizeW(exePath, versionHandle)
  if (!size) return null
  const block = Buffer.alloc(size)
  if (!native.GetFileVersionInfoW(exePath, 0, size, block)) return null
  const translationPointer = [null]
  const translationLength = [0]
  if (!native.VerQueryValueW(block, '\\VarFileInfo\\Translation', translationPointer, translationLength)) return null
  if (!translationLength[0] || !translationPointer[0]) return null
  const language = koffi.decode(translationPointer[0], 'uint16')
  const codePage = koffi.decode(translationPointer[0], 2, 'uint16')
  return readVersionString(native, block, language, codePage, 'FileDescription')
    || readVersionString(native, block, language, codePage, 'ProductName')
}

const fileDescriptionCache = new Map()

function fileVersionStamp(exePath) {
  try {
    const stats = fs.statSync(exePath)
    return `${stats.mtimeMs}:${stats.size}`
  } catch {
    return null
  }
}

function fileDescription(exePath) {
  if (!exePath) return null
  const stamp = fileVersionStamp(exePath)
  if (!stamp) return null
  const cached = fileDescriptionCache.get(exePath)
  if (cached && cached.stamp === stamp) return cached.description
  let description = null
  try {
    description = readFileDescription(exePath)
  } catch (e) {
    console.error('[windowEnum] version info read failed:', exePath, '-', e?.message ?? e)
  }
  fileDescriptionCache.set(exePath, { stamp, description })
  return description
}

module.exports = {
  WS_EX_TOOLWINDOW,
  WS_EX_APPWINDOW,
  readWideString,
  processNameFromPath,
  taskbarWindowPredicate,
  windowProbe,
  enumerateWindows,
  windowTitle,
  windowProcessId,
  processImagePath,
  fileDescription,
}
