const fs = require('fs')

const GWL_EXSTYLE = -20
const GW_OWNER = 4
const WS_EX_TRANSPARENT = 0x00000020
const WS_EX_TOOLWINDOW = 0x00000080
const WS_EX_APPWINDOW = 0x00040000
const WS_EX_NOACTIVATE = 0x08000000
const OVERLAY_WINDOW_EX_STYLES = WS_EX_TRANSPARENT | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE
const DESKTOP_WINDOW_CLASSES = new Set(['Progman', 'WorkerW'])
const DWMWA_EXTENDED_FRAME_BOUNDS = 9
const DWMWA_CLOAKED = 14
const RECT_BYTES = 16
const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
const MAX_CLASS_NAME_CHARS = 256
const MAX_IMAGE_PATH_CHARS = 520
const DESCRIPTION_REVALIDATE_MS = 60000
const DESCRIPTION_READ_TIMEOUT_MS = 2000
const DESCRIPTION_CACHE_LIMIT = 512

let koffiModule = null
let windowEnumCallbackType = null
let bindings = null
let loadedLibraries = []
let enumerationContext = null

function koffiInterface() {
  if (!koffiModule) koffiModule = require('koffi')
  return koffiModule
}

function windowEnumCallbackProto() {
  if (!windowEnumCallbackType) {
    windowEnumCallbackType = koffiInterface().proto('__stdcall', 'WindowEnumCallback', 'int', ['uintptr_t', 'intptr_t'])
  }
  return windowEnumCallbackType
}

function toWindowHandle(value) {
  return typeof value === 'bigint' ? Number(value) : value
}

function collectEnumeratedWindow(context, handle, probe) {
  if (!context || context.failure) return 0
  try {
    if (context.predicate(handle, probe)) context.handles.push(handle)
    return 1
  } catch (e) {
    context.failure = e
    return 0
  }
}

function loadBindings() {
  if (bindings) return bindings

  const koffi = koffiInterface()
  const user32 = koffi.load('user32.dll')
  const kernel32 = koffi.load('kernel32.dll')
  loadedLibraries = [user32, kernel32]

  let DwmGetWindowAttribute = null
  try {
    const dwmapi = koffi.load('dwmapi.dll')
    loadedLibraries.push(dwmapi)
    DwmGetWindowAttribute = dwmapi.func('__stdcall', 'DwmGetWindowAttribute', 'long', ['uintptr_t', 'uint32', 'void *', 'uint32'])
  } catch (_) {}

  let GetFileVersionInfoSizeW = null
  let GetFileVersionInfoW = null
  let VerQueryValueW = null
  try {
    const version = koffi.load('version.dll')
    loadedLibraries.push(version)
    GetFileVersionInfoSizeW = version.func('__stdcall', 'GetFileVersionInfoSizeW', 'uint32', ['str16', 'void *'])
    GetFileVersionInfoW = version.func('__stdcall', 'GetFileVersionInfoW', 'int', ['str16', 'uint32', 'uint32', 'void *'])
    VerQueryValueW = version.func('__stdcall', 'VerQueryValueW', 'int', ['void *', 'str16', koffi.out(koffi.pointer('void *')), koffi.out(koffi.pointer('uint32'))])
  } catch (_) {}

  const enumProc = koffi.register(
    (hwnd) => collectEnumeratedWindow(enumerationContext, toWindowHandle(hwnd), windowProbe),
    koffi.pointer(windowEnumCallbackProto())
  )

  bindings = {
    EnumWindows: user32.func('__stdcall', 'EnumWindows', 'int', ['WindowEnumCallback *', 'intptr_t']),
    IsWindowVisible: user32.func('__stdcall', 'IsWindowVisible', 'int', ['uintptr_t']),
    IsIconic: user32.func('__stdcall', 'IsIconic', 'int', ['uintptr_t']),
    GetClassNameW: user32.func('__stdcall', 'GetClassNameW', 'int', ['uintptr_t', 'void *', 'int']),
    GetWindowRect: user32.func('__stdcall', 'GetWindowRect', 'int', ['uintptr_t', 'void *']),
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

function releaseBindings() {
  if (!bindings) return
  try { koffiInterface().unregister(bindings.enumProc) } catch (_) {}
  for (const library of loadedLibraries) {
    try { library.unload() } catch (_) {}
  }
  loadedLibraries = []
  bindings = null
}

function callNativeAsync(nativeFunction, args) {
  return new Promise((resolve, reject) => {
    nativeFunction.async(...args, (error, result) => (error ? reject(error) : resolve(result)))
  })
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

function onScreenWindowPredicate(hwnd, probe) {
  if (!probe.isVisible(hwnd)) return false
  if (probe.isMinimized(hwnd)) return false
  if ((probe.exStyle(hwnd) & OVERLAY_WINDOW_EX_STYLES) !== 0) return false
  if (DESKTOP_WINDOW_CLASSES.has(probe.className(hwnd))) return false
  return !probe.isCloaked(hwnd)
}

const windowProbe = {
  isVisible(hwnd) {
    return loadBindings().IsWindowVisible(hwnd) !== 0
  },
  isMinimized(hwnd) {
    return loadBindings().IsIconic(hwnd) !== 0
  },
  titleLength(hwnd) {
    return loadBindings().GetWindowTextLengthW(hwnd)
  },
  className(hwnd) {
    const buffer = Buffer.alloc(MAX_CLASS_NAME_CHARS * 2)
    const length = loadBindings().GetClassNameW(hwnd, buffer, MAX_CLASS_NAME_CHARS)
    return readWideString(buffer, length)
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
  const outerContext = enumerationContext
  const context = { predicate, handles: [], failure: null }
  enumerationContext = context
  try {
    native.EnumWindows(native.enumProc, 0)
  } finally {
    enumerationContext = outerContext
  }
  if (context.failure) throw context.failure
  return context.handles
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

function readRect(buffer) {
  return {
    left: buffer.readInt32LE(0),
    top: buffer.readInt32LE(4),
    right: buffer.readInt32LE(8),
    bottom: buffer.readInt32LE(12),
  }
}

function windowFrameBounds(hwnd) {
  const native = loadBindings()
  const buffer = Buffer.alloc(RECT_BYTES)
  if (native.DwmGetWindowAttribute && native.DwmGetWindowAttribute(hwnd, DWMWA_EXTENDED_FRAME_BOUNDS, buffer, RECT_BYTES) === 0) {
    return readRect(buffer)
  }
  return native.GetWindowRect(hwnd, buffer) ? readRect(buffer) : null
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
  const koffi = koffiInterface()
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

async function readFileDescription(exePath) {
  const koffi = koffiInterface()
  const native = loadBindings()
  if (!native.GetFileVersionInfoSizeW || !native.GetFileVersionInfoW || !native.VerQueryValueW) return null
  const versionHandle = Buffer.alloc(4)
  const size = await callNativeAsync(native.GetFileVersionInfoSizeW, [exePath, versionHandle])
  if (!size) return null
  const block = Buffer.alloc(size)
  if (!(await callNativeAsync(native.GetFileVersionInfoW, [exePath, 0, size, block]))) return null
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
const pendingFileDescriptions = new Map()

function rememberFileDescription(exePath, entry) {
  if (!fileDescriptionCache.has(exePath) && fileDescriptionCache.size >= DESCRIPTION_CACHE_LIMIT) {
    fileDescriptionCache.delete(fileDescriptionCache.keys().next().value)
  }
  fileDescriptionCache.set(exePath, entry)
}

function settleWithin(promise, timeoutMs, fallback) {
  let timer = null
  const expiry = new Promise((resolve) => { timer = setTimeout(() => resolve(fallback), timeoutMs) })
  return Promise.race([promise, expiry]).finally(() => clearTimeout(timer))
}

async function fileVersionStamp(exePath) {
  try {
    const stats = await fs.promises.stat(exePath)
    return `${stats.mtimeMs}:${stats.size}`
  } catch {
    return null
  }
}

async function readCurrentFileDescription(exePath, cached) {
  const known = cached ? cached.description : null
  const stamp = await fileVersionStamp(exePath)
  if (!stamp) return { stamp: null, description: known }
  if (cached && cached.stamp === stamp) return { stamp, description: known }
  return { stamp, description: await readFileDescription(exePath) }
}

function resolveFileDescription(exePath) {
  if (!exePath) return Promise.resolve(null)
  const cached = fileDescriptionCache.get(exePath)
  if (cached && Date.now() - cached.checkedAt < DESCRIPTION_REVALIDATE_MS) return Promise.resolve(cached.description)
  const inFlight = pendingFileDescriptions.get(exePath)
  if (inFlight) return inFlight
  const unchanged = { stamp: null, description: cached ? cached.description : null }
  const read = readCurrentFileDescription(exePath, cached).catch((e) => {
    console.error('[windowEnum] version info read failed:', exePath, '-', e?.message ?? e)
    return unchanged
  })
  const attempt = settleWithin(read, DESCRIPTION_READ_TIMEOUT_MS, unchanged)
    .then((result) => {
      rememberFileDescription(exePath, { ...result, checkedAt: Date.now() })
      return result.description
    })
    .finally(() => pendingFileDescriptions.delete(exePath))
  pendingFileDescriptions.set(exePath, attempt)
  return attempt
}

module.exports = {
  WS_EX_TRANSPARENT,
  WS_EX_TOOLWINDOW,
  WS_EX_APPWINDOW,
  WS_EX_NOACTIVATE,
  readWideString,
  processNameFromPath,
  taskbarWindowPredicate,
  onScreenWindowPredicate,
  collectEnumeratedWindow,
  windowProbe,
  enumerateWindows,
  releaseBindings,
  windowTitle,
  windowProcessId,
  windowFrameBounds,
  processImagePath,
  resolveFileDescription,
}
