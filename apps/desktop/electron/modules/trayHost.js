const { app } = require('electron')
const koffi = require('koffi')
const winFocus = require('./winFocus')
const { renderIconPixels, encodeIconPixelsReusing } = require('./iconHandle')

const user32 = koffi.load('user32.dll')
const kernel32 = koffi.load('kernel32.dll')

const WNDPROC = koffi.proto('__stdcall', 'TrayHostWndProc', 'intptr_t', ['uintptr_t', 'uint32', 'uintptr_t', 'intptr_t'])

const WNDCLASSEXW = koffi.struct('WNDCLASSEXW_TRAY', {
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

const RegisterClassExW = user32.func('__stdcall', 'RegisterClassExW', 'uint16', [koffi.pointer(WNDCLASSEXW)])
const UnregisterClassW = user32.func('__stdcall', 'UnregisterClassW', 'int', ['str16', 'uintptr_t'])
const CreateWindowExW = user32.func('__stdcall', 'CreateWindowExW', 'uintptr_t', ['uint32', 'str16', 'str16', 'uint32', 'int', 'int', 'int', 'int', 'uintptr_t', 'uintptr_t', 'uintptr_t', 'void *'])
const DestroyWindow = user32.func('__stdcall', 'DestroyWindow', 'int', ['uintptr_t'])
const DefWindowProcW = user32.func('__stdcall', 'DefWindowProcW', 'intptr_t', ['uintptr_t', 'uint32', 'uintptr_t', 'intptr_t'])
const FindWindowW = user32.func('__stdcall', 'FindWindowW', 'uintptr_t', ['str16', 'str16'])
const RegisterWindowMessageW = user32.func('__stdcall', 'RegisterWindowMessageW', 'uint32', ['str16'])
const SendNotifyMessageW = user32.func('__stdcall', 'SendNotifyMessageW', 'int', ['uintptr_t', 'uint32', 'uintptr_t', 'intptr_t'])
const PostMessageW = user32.func('__stdcall', 'PostMessageW', 'int', ['uintptr_t', 'uint32', 'uintptr_t', 'intptr_t'])
const IsWindow = user32.func('__stdcall', 'IsWindow', 'int', ['uintptr_t'])
const GetWindowThreadProcessId = user32.func('__stdcall', 'GetWindowThreadProcessId', 'uint32', ['uintptr_t', 'void *'])
const GetSystemMetrics = user32.func('__stdcall', 'GetSystemMetrics', 'int', ['int'])

const GetModuleHandleW = kernel32.func('__stdcall', 'GetModuleHandleW', 'uintptr_t', ['str16'])
const RtlMoveMemory = kernel32.func('__stdcall', 'RtlMoveMemory', 'void', ['void *', 'uintptr_t', 'uintptr_t'])
const OpenProcess = kernel32.func('__stdcall', 'OpenProcess', 'uintptr_t', ['uint32', 'int', 'uint32'])
const QueryFullProcessImageNameW = kernel32.func('__stdcall', 'QueryFullProcessImageNameW', 'int', ['uintptr_t', 'uint32', 'void *', 'void *'])
const CloseHandle = kernel32.func('__stdcall', 'CloseHandle', 'int', ['uintptr_t'])


const WM_COPYDATA = 0x004a
const WM_LBUTTONDOWN = 0x0201
const WM_LBUTTONUP = 0x0202
const WM_RBUTTONDOWN = 0x0204
const WM_RBUTTONUP = 0x0205
const WM_CONTEXTMENU = 0x007b
const NIN_SELECT = 0x0400
const HWND_BROADCAST = 0xffff
const SM_CXSMICON = 49
const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000

const NIF_MESSAGE = 0x01
const NIF_ICON = 0x02
const NIF_TIP = 0x04
const NIF_GUID = 0x20

const NIM_ADD = 0
const NIM_MODIFY = 1
const NIM_DELETE = 2
const NIM_SETVERSION = 4

const TRAY_CLASS = 'Shell_TrayWnd'
const NOTIFY_CLASS = 'TrayNotifyWnd'

const OFF64 = { hWnd: 8, uID: 16, uFlags: 20, uCallback: 24, hIcon: 32, szTip: 40, uVersion: 816, guid: 952 }
const OFF32 = { hWnd: 4, uID: 8, uFlags: 12, uCallback: 16, hIcon: 20, szTip: 24, uVersion: 800, guid: 936 }

const icons = new Map()
const processPathCache = new Map()
let broadcastRef = null
let wndProcPtr = null
let trayHwnd = 0
let notifyHwnd = 0
let hostInst = 0
let reaper = null
let broadcastScheduled = false
let iconSize = 32

function toNum(v) {
  return typeof v === 'bigint' ? Number(v) : v
}

function readWideString(buf, off, maxChars) {
  let s = ''
  for (let i = 0; i < maxChars; i++) {
    const c = buf.readUInt16LE(off + i * 2)
    if (c === 0) break
    s += String.fromCharCode(c)
  }
  return s
}

function getOwnerExeName(hWndRaw) {
  const key = toNum(hWndRaw)
  const cached = processPathCache.get(key)
  if (cached) return cached
  let exe = null
  try {
    const pidBuf = Buffer.alloc(4)
    GetWindowThreadProcessId(hWndRaw, pidBuf)
    const pid = pidBuf.readUInt32LE(0)
    if (pid) {
      const hProcess = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid)
      if (toNum(hProcess)) {
        try {
          const pathBuf = Buffer.alloc(520 * 2)
          const sizeBuf = Buffer.alloc(4)
          sizeBuf.writeUInt32LE(520, 0)
          if (QueryFullProcessImageNameW(hProcess, 0, pathBuf, sizeBuf)) {
            const len = sizeBuf.readUInt32LE(0)
            const base = readWideString(pathBuf, 0, len).split('\\').pop()
            if (base) exe = base.toLowerCase()
          }
        } finally {
          CloseHandle(hProcess)
        }
      }
    }
  } catch (_) {
    exe = null
  }
  if (exe) processPathCache.set(key, exe)
  return exe
}

function readGuid(buf, off) {
  const d1 = buf.readUInt32LE(off).toString(16).padStart(8, '0')
  const d2 = buf.readUInt16LE(off + 4).toString(16).padStart(4, '0')
  const d3 = buf.readUInt16LE(off + 6).toString(16).padStart(4, '0')
  let rest = ''
  for (let i = 8; i < 16; i++) rest += buf.readUInt8(off + i).toString(16).padStart(2, '0')
  return `${d1}-${d2}-${d3}-${rest.slice(0, 4)}-${rest.slice(4)}`
}

function isZeroBytes(buf, off, len) {
  for (let i = 0; i < len; i++) if (buf.readUInt8(off + i) !== 0) return false
  return true
}

function scheduleBroadcast() {
  if (broadcastScheduled || !broadcastRef) return
  broadcastScheduled = true
  setTimeout(() => {
    broadcastScheduled = false
    if (broadcastRef) broadcastRef('tray/icons-changed', publicState())
  }, 50)
}

function publicIcon(r) {
  return {
    id: r.id,
    hWnd: toNum(r.hWndRaw),
    uID: r.uID,
    guid: r.guid,
    tooltip: r.tooltip,
    icon: r.iconUrl,
    version: r.version,
  }
}

function publicState() {
  return [...icons.values()].map(publicIcon)
}

function samePublicIcon(a, b) {
  if (!a || !b) return false
  return Object.keys(a).every((field) => a[field] === b[field])
}

function computeId(guid, hWndRaw, uID) {
  if (guid) return `guid:${guid}`
  const exe = getOwnerExeName(hWndRaw)
  if (exe) return `app:${exe}:${uID}`
  return `w:${toNum(hWndRaw)}:${uID}`
}

function parseLayout(buf, cbData) {
  const base = 8
  const hWnd64 = buf.readBigUInt64LE(base + 8)
  const hWnd32 = BigInt(buf.readUInt32LE(base + 4))
  let is64 = true
  if (IsWindow(hWnd64)) is64 = true
  else if (IsWindow(hWnd32)) is64 = false
  else is64 = cbData >= 980
  return is64 ? { O: OFF64, hWndRaw: hWnd64 } : { O: OFF32, hWndRaw: hWnd32 }
}

function handleTrayData(buf, cbData) {
  const dwMessage = buf.readUInt32LE(4)
  const base = 8
  const { O, hWndRaw } = parseLayout(buf, cbData)

  const uID = buf.readUInt32LE(base + O.uID)
  const uFlags = buf.readUInt32LE(base + O.uFlags)
  const hasGuid = (uFlags & NIF_GUID) && !isZeroBytes(buf, base + O.guid, 16)
  const guid = hasGuid ? readGuid(buf, base + O.guid) : null
  const id = computeId(guid, hWndRaw, uID)

  if (dwMessage === NIM_DELETE) {
    if (icons.delete(id)) scheduleBroadcast()
    return
  }

  const previous = icons.get(id)
  const publicBefore = previous ? publicIcon(previous) : null
  const record = recordForMessage(previous, dwMessage, id, hWndRaw, uID, guid)
  applyTrayMessage(record, dwMessage, uFlags, buf, base, O)
  if (!samePublicIcon(publicBefore, publicIcon(record))) scheduleBroadcast()
}

function recordForMessage(previous, dwMessage, id, hWndRaw, uID, guid) {
  let record = previous
  if (!record || dwMessage === NIM_ADD) {
    record = { id, hWndRaw, uID, guid, tooltip: '', iconUrl: '', iconEncoding: previous?.iconEncoding ?? null, callbackMsg: 0, version: 0 }
    icons.set(id, record)
  }
  record.hWndRaw = hWndRaw
  record.uID = uID
  record.guid = guid
  return record
}

function applyTrayMessage(record, dwMessage, uFlags, buf, base, O) {
  if (dwMessage === NIM_SETVERSION) {
    record.version = buf.readUInt32LE(base + O.uVersion)
    return
  }
  if (uFlags & NIF_MESSAGE) record.callbackMsg = buf.readUInt32LE(base + O.uCallback)
  if (uFlags & NIF_TIP) record.tooltip = readWideString(buf, base + O.szTip, 128)
  if (uFlags & NIF_ICON) {
    const hIconRaw = O === OFF64 ? buf.readBigUInt64LE(base + O.hIcon) : BigInt(buf.readUInt32LE(base + O.hIcon))
    record.iconEncoding = encodeIconPixelsReusing(record.iconEncoding, renderIconPixels(hIconRaw, iconSize), iconSize)
    record.iconUrl = record.iconEncoding.dataUrl
  }
}

function trayWndProc(hwnd, msg, wParam, lParam) {
  try {
    if (msg === WM_COPYDATA) {
      const cds = Buffer.alloc(24)
      RtlMoveMemory(cds, lParam, 24n)
      const dwData = Number(cds.readBigUInt64LE(0))
      const cbData = cds.readUInt32LE(8)
      const lpData = cds.readBigUInt64LE(16)
      if (dwData === 1 && lpData && cbData >= 48) {
        const buf = Buffer.alloc(cbData)
        RtlMoveMemory(buf, lpData, BigInt(cbData))
        handleTrayData(buf, cbData)
      }
      return 1
    }
  } catch (e) {
    console.error('[trayHost] wndProc error:', e.message)
  }
  return DefWindowProcW(hwnd, msg, wParam, lParam)
}

function forwardClick(id, button, x, y) {
  const r = icons.get(id)
  if (!r || !r.callbackMsg) return
  if (!IsWindow(r.hWndRaw)) {
    icons.delete(id)
    scheduleBroadcast()
    return
  }
  const hwnd = r.hWndRaw
  const cb = r.callbackMsg
  const ax = x & 0xffff
  const ay = y & 0xffff
  if (button === 'right') {
    try { winFocus.forceForeground(toNum(hwnd)) } catch {}
  }
  const send = (mouseMsg) => {
    if (r.version >= 4) {
      const wParam = ax | (ay << 16)
      const lParam = (mouseMsg & 0xffff) | ((r.uID & 0xffff) << 16)
      PostMessageW(hwnd, cb, wParam, lParam)
    } else {
      PostMessageW(hwnd, cb, r.uID, mouseMsg)
    }
  }
  if (button === 'right') {
    if (r.version >= 4) {
      send(WM_CONTEXTMENU)
    } else {
      send(WM_RBUTTONDOWN)
      send(WM_RBUTTONUP)
    }
  } else {
    if (r.version >= 4) {
      send(NIN_SELECT)
    } else {
      send(WM_LBUTTONDOWN)
      send(WM_LBUTTONUP)
    }
  }
}

function createHost() {
  hostInst = GetModuleHandleW(null)
  iconSize = GetSystemMetrics(SM_CXSMICON) * 2 || 32
  wndProcPtr = koffi.register(trayWndProc, koffi.pointer(WNDPROC))

  const existing = FindWindowW(TRAY_CLASS, null)
  if (toNum(existing)) {
    console.warn('[trayHost] an existing Shell_TrayWnd was found (explorer or another shell may be running)')
  }

  const wc = {
    cbSize: koffi.sizeof(WNDCLASSEXW),
    style: 0,
    lpfnWndProc: wndProcPtr,
    cbClsExtra: 0,
    cbWndExtra: 0,
    hInstance: hostInst,
    hIcon: 0,
    hCursor: 0,
    hbrBackground: 0,
    lpszMenuName: null,
    lpszClassName: TRAY_CLASS,
    hIconSm: 0,
  }
  if (!RegisterClassExW(wc)) {
    console.error('[trayHost] RegisterClassExW failed for Shell_TrayWnd')
    return false
  }
  trayHwnd = CreateWindowExW(0, TRAY_CLASS, '', 0, 0, 0, 0, 0, 0, 0, hostInst, null)
  if (!toNum(trayHwnd)) {
    console.error('[trayHost] CreateWindowExW failed for Shell_TrayWnd')
    return false
  }

  const wcNotify = { ...wc, lpszClassName: NOTIFY_CLASS }
  if (RegisterClassExW(wcNotify)) {
    notifyHwnd = CreateWindowExW(0, NOTIFY_CLASS, '', 0x40000000, 0, 0, 0, 0, trayHwnd, 0, hostInst, null)
  }

  console.log(`[trayHost] Shell_TrayWnd created hwnd=${toNum(trayHwnd)} iconSize=${iconSize}`)
  return true
}

function broadcastTaskbarCreated() {
  const msg = RegisterWindowMessageW('TaskbarCreated')
  if (msg) SendNotifyMessageW(HWND_BROADCAST, msg, 0, 0)
}

function announceTaskbar() {
  if (!toNum(trayHwnd)) return
  try {
    broadcastTaskbarCreated()
  } catch (e) {
    console.error('[trayHost] announce error:', e.message)
  }
}

function reapDeadOwners() {
  let changed = false
  for (const [id, r] of icons) {
    if (!IsWindow(r.hWndRaw)) {
      icons.delete(id)
      processPathCache.delete(toNum(r.hWndRaw))
      changed = true
    }
  }
  if (changed) scheduleBroadcast()
}

module.exports = {
  handlers: {
    'tray/icons': () => publicState(),
    'tray/click': (_event, { id, button, x, y }) => {
      forwardClick(id, button === 'right' ? 'right' : 'left', x | 0, y | 0)
    },
  },

  announceTaskbar,

  start(broadcast) {
    broadcastRef = broadcast
    setImmediate(() => {
      try {
        if (!createHost()) return
        broadcastTaskbarCreated()
        reaper = setInterval(reapDeadOwners, 2000)
      } catch (e) {
        console.error('[trayHost] start error:', e.message)
        return
      }
      app.on('will-quit', () => {
        try {
          if (reaper) clearInterval(reaper)
          if (notifyHwnd) DestroyWindow(notifyHwnd)
          if (trayHwnd) DestroyWindow(trayHwnd)
        } catch {}
      })
    })
  },
}
