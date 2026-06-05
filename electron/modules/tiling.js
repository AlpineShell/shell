const { app, screen } = require('electron')
const path = require('path')
const fs = require('fs')
const koffi = require('koffi')

const user32 = koffi.load('user32.dll')
let dwmapi = null
try { dwmapi = koffi.load('dwmapi.dll') } catch (_) {}

const WNDENUMPROC = koffi.proto('__stdcall', 'TilingEnumProc', 'int', ['uintptr_t', 'intptr_t'])

const SetWindowPos = user32.func('__stdcall', 'SetWindowPos', 'int', ['uintptr_t', 'uintptr_t', 'int', 'int', 'int', 'int', 'uint32'])
const GetWindowRect = user32.func('__stdcall', 'GetWindowRect', 'int', ['uintptr_t', 'void *'])
const GetForegroundWindow = user32.func('__stdcall', 'GetForegroundWindow', 'uintptr_t', [])
const ShowWindow = user32.func('__stdcall', 'ShowWindow', 'int', ['uintptr_t', 'int'])
const IsIconic = user32.func('__stdcall', 'IsIconic', 'int', ['uintptr_t'])
const IsZoomed = user32.func('__stdcall', 'IsZoomed', 'int', ['uintptr_t'])
const IsWindow = user32.func('__stdcall', 'IsWindow', 'int', ['uintptr_t'])
const IsWindowVisible = user32.func('__stdcall', 'IsWindowVisible', 'int', ['uintptr_t'])
const EnumWindows = user32.func('__stdcall', 'EnumWindows', 'int', ['TilingEnumProc *', 'intptr_t'])
const GetWindowLongW = user32.func('__stdcall', 'GetWindowLongW', 'int32', ['uintptr_t', 'int'])
const GetWindowTextLengthW = user32.func('__stdcall', 'GetWindowTextLengthW', 'int', ['uintptr_t'])
const GetWindowThreadProcessId = user32.func('__stdcall', 'GetWindowThreadProcessId', 'uint32', ['uintptr_t', 'void *'])
const GetWindow = user32.func('__stdcall', 'GetWindow', 'uintptr_t', ['uintptr_t', 'uint32'])
const SendMessageTimeoutW = user32.func('__stdcall', 'SendMessageTimeoutW', 'intptr_t', ['uintptr_t', 'uint32', 'uintptr_t', 'void *', 'uint32', 'uint32', 'void *'])

const WINEVENTPROC = koffi.proto('__stdcall', 'TilingWinEventProc', 'void', ['uintptr_t', 'uint32', 'uintptr_t', 'int32', 'int32', 'uint32', 'uint32'])
const SetWinEventHook = user32.func('__stdcall', 'SetWinEventHook', 'uintptr_t', ['uint32', 'uint32', 'uintptr_t', 'TilingWinEventProc *', 'uint32', 'uint32', 'uint32'])
const UnhookWinEvent = user32.func('__stdcall', 'UnhookWinEvent', 'int', ['uintptr_t'])

let DwmGetWindowAttribute = null
if (dwmapi) {
  DwmGetWindowAttribute = dwmapi.func('__stdcall', 'DwmGetWindowAttribute', 'long', ['uintptr_t', 'uint32', 'void *', 'uint32'])
}

const GWL_STYLE = -16
const GWL_EXSTYLE = -20
const WS_THICKFRAME = 0x00040000
const WS_CHILD = 0x40000000
const WS_EX_TOOLWINDOW = 0x00000080
const WS_EX_NOACTIVATE = 0x08000000
const GW_OWNER = 4
const WM_GETMINMAXINFO = 0x0024
const SMTO_ABORTIFHUNG = 0x0002
const SW_MINIMIZE = 6
const SW_MAXIMIZE = 3
const SW_RESTORE = 9
const SWP_NOZORDER = 0x0004
const SWP_NOACTIVATE = 0x0010
const SWP_FRAMECHANGED = 0x0020
const SWP_ASYNCWINDOWPOS = 0x4000
const DWMWA_CLOAKED = 14
const DWMWA_EXTENDED_FRAME_BOUNDS = 9
const EVENT_SYSTEM_FOREGROUND = 0x0003
const EVENT_SYSTEM_MOVESIZESTART = 0x000A
const EVENT_SYSTEM_MOVESIZEEND = 0x000B
const EVENT_SYSTEM_MINIMIZESTART = 0x0016
const EVENT_SYSTEM_MINIMIZEEND = 0x0017
const EVENT_OBJECT_SHOW = 0x8002
const WINEVENT_OUTOFCONTEXT = 0x0000
const WINEVENT_SKIPOWNPROCESS = 0x0002
const OBJID_WINDOW = 0
const CHILDID_SELF = 0

const STORE_FILE = 'tiling.json'
const DEFAULT_CONFIG = {
  enabled: false,
  mode: 'snap',
  gap: 8,
  margin: 0,
  hotkeys: true,
  dragToZone: false,
  dynamicLayout: 'bsp',
  ratios: {},
  handleOversized: true,
  centerOversized: false,
}

let config = { ...DEFAULT_CONFIG }
let storePath = null
let broadcastRef = null
let shellsRef = null
let dynamicTimer = null
let lastDynamicSnapshot = ''
const snapStateByHwnd = new Map()
const lastAppliedDipByHwnd = new Map()
const minSizeByHwnd = new Map()

let windowOrder = []
let winEventHookHandle = null
let winEventProcPointer = null
let objectHookHandle = null
let objectHookPointer = null
let dynamicApplyTimers = []
let dragActive = false
let dragHwnd = 0
let dragMode = null
let dragWasDragToZone = false
let dragStartZone = null
let dragStartDisplayId = null
let dragStartRect = null
let dragWatchdog = null

const DYNAMIC_APPLY_DELAYS = [8, 24, 80, 200, 420]
const DRAG_WATCHDOG_MS = 4000
const RESIZE_THRESHOLD = 6
const MIN_FRACTION = 0.05
const OVERSIZE_TOLERANCE = 8
const SNAP_CORRECT_DELAY = 60

function toNum(v) {
  return typeof v === 'bigint' ? Number(v) : v
}

function getStorePath() {
  if (!storePath) storePath = path.join(app.getPath('userData'), STORE_FILE)
  return storePath
}

function clampFraction(value) {
  if (typeof value !== 'number' || !isFinite(value)) return null
  return Math.max(MIN_FRACTION, Math.min(1 - MIN_FRACTION, value))
}

function normalizeFractionArray(arr, length) {
  if (!Array.isArray(arr) || arr.length !== length) return null
  const clamped = arr.map(clampFraction)
  if (clamped.some((v) => v === null)) return null
  const sum = clamped.reduce((a, b) => a + b, 0)
  if (sum <= 0) return null
  return clamped.map((v) => v / sum)
}

function sanitizeRatios(raw) {
  const out = {}
  if (!raw || typeof raw !== 'object') return out
  for (const layout of ['master-stack', 'columns', 'bsp']) {
    const byCount = raw[layout]
    if (!byCount || typeof byCount !== 'object') continue
    const cleanByCount = {}
    for (const countKey of Object.keys(byCount)) {
      const count = Number(countKey)
      if (!Number.isInteger(count) || count < 1) continue
      const entry = byCount[countKey]
      if (!entry || typeof entry !== 'object') continue
      if (layout === 'master-stack') {
        const master = clampFraction(entry.master)
        if (master === null) continue
        if (count > 1) {
          const stack = normalizeFractionArray(entry.stack, count - 1)
          if (stack === null) continue
          cleanByCount[countKey] = { master, stack }
        } else {
          cleanByCount[countKey] = { master }
        }
      } else if (layout === 'columns') {
        const widths = normalizeFractionArray(entry.widths, count)
        if (widths === null) continue
        cleanByCount[countKey] = { widths }
      } else {
        const nodes = {}
        if (entry.nodes && typeof entry.nodes === 'object') {
          for (const nodeKey of Object.keys(entry.nodes)) {
            const idx = Number(nodeKey)
            const ratio = clampFraction(entry.nodes[nodeKey])
            if (Number.isInteger(idx) && idx >= 0 && ratio !== null) nodes[nodeKey] = ratio
          }
        }
        cleanByCount[countKey] = { nodes }
      }
    }
    if (Object.keys(cleanByCount).length) out[layout] = cleanByCount
  }
  return out
}

function sanitizeConfig(raw) {
  const next = { ...DEFAULT_CONFIG }
  next.ratios = {}
  if (!raw || typeof raw !== 'object') return next
  if (typeof raw.enabled === 'boolean') next.enabled = raw.enabled
  if (raw.mode === 'snap' || raw.mode === 'dynamic') next.mode = raw.mode
  if (typeof raw.gap === 'number' && isFinite(raw.gap)) next.gap = Math.max(0, Math.min(64, Math.round(raw.gap)))
  if (typeof raw.margin === 'number' && isFinite(raw.margin)) next.margin = Math.max(0, Math.min(96, Math.round(raw.margin)))
  if (typeof raw.hotkeys === 'boolean') next.hotkeys = raw.hotkeys
  if (typeof raw.dragToZone === 'boolean') next.dragToZone = raw.dragToZone
  if (typeof raw.handleOversized === 'boolean') next.handleOversized = raw.handleOversized
  if (typeof raw.centerOversized === 'boolean') next.centerOversized = raw.centerOversized
  if (raw.dynamicLayout === 'bsp' || raw.dynamicLayout === 'columns' || raw.dynamicLayout === 'master-stack') {
    next.dynamicLayout = raw.dynamicLayout
  }
  next.ratios = sanitizeRatios(raw.ratios)
  return next
}

function loadConfig() {
  try {
    const file = getStorePath()
    if (fs.existsSync(file)) config = sanitizeConfig(JSON.parse(fs.readFileSync(file, 'utf8')))
  } catch (e) {
    console.error('[tiling] load error:', e.message)
  }
}

function saveConfig() {
  try {
    const dir = path.dirname(getStorePath())
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(getStorePath(), JSON.stringify(config))
  } catch (e) {
    console.error('[tiling] save error:', e.message)
  }
}

function readRect(hwnd) {
  const buf = Buffer.alloc(16)
  if (!GetWindowRect(hwnd, buf)) return null
  return {
    left: buf.readInt32LE(0),
    top: buf.readInt32LE(4),
    right: buf.readInt32LE(8),
    bottom: buf.readInt32LE(12),
  }
}

function readExtendedFrame(hwnd) {
  if (!DwmGetWindowAttribute) return null
  const buf = Buffer.alloc(16)
  const hr = DwmGetWindowAttribute(hwnd, DWMWA_EXTENDED_FRAME_BOUNDS, buf, 16)
  if (hr !== 0) return null
  return {
    left: buf.readInt32LE(0),
    top: buf.readInt32LE(4),
    right: buf.readInt32LE(8),
    bottom: buf.readInt32LE(12),
  }
}

function frameInsets(hwnd) {
  const win = readRect(hwnd)
  const ext = readExtendedFrame(hwnd)
  if (!win || !ext) return { left: 0, top: 0, right: 0, bottom: 0 }
  return {
    left: ext.left - win.left,
    top: ext.top - win.top,
    right: win.right - ext.right,
    bottom: win.bottom - ext.bottom,
  }
}

function isCloaked(hwnd) {
  if (!DwmGetWindowAttribute) return false
  const buf = Buffer.alloc(4)
  DwmGetWindowAttribute(hwnd, DWMWA_CLOAKED, buf, 4)
  return buf.readUInt32LE(0) !== 0
}

function ownPid() {
  return process.pid
}

function windowPid(hwnd) {
  const buf = Buffer.alloc(4)
  GetWindowThreadProcessId(hwnd, buf)
  return buf.readUInt32LE(0)
}

function isManageable(hwnd) {
  if (!IsWindow(hwnd) || !IsWindowVisible(hwnd)) return false
  if (IsIconic(hwnd)) return false
  if (GetWindowTextLengthW(hwnd) <= 0) return false
  if (windowPid(hwnd) === ownPid()) return false
  const style = GetWindowLongW(hwnd, GWL_STYLE)
  if (style & WS_CHILD) return false
  if (!(style & WS_THICKFRAME)) return false
  const exStyle = GetWindowLongW(hwnd, GWL_EXSTYLE)
  if (exStyle & WS_EX_TOOLWINDOW) return false
  if (exStyle & WS_EX_NOACTIVATE) return false
  if (toNum(GetWindow(hwnd, GW_OWNER)) !== 0) return false
  if (isCloaked(hwnd)) return false
  return true
}

function enumManageableWindows() {
  const windows = []
  const cb = koffi.register((hwnd) => {
    const h = toNum(hwnd)
    if (isManageable(h)) windows.push(h)
    return 1
  }, koffi.pointer(WNDENUMPROC))
  try {
    EnumWindows(cb, 0)
  } finally {
    koffi.unregister(cb)
  }
  return windows
}

function rectCenterDip(hwnd) {
  const r = readRect(hwnd)
  if (!r) return null
  const centerPhysical = { x: Math.round((r.left + r.right) / 2), y: Math.round((r.top + r.bottom) / 2) }
  try {
    return screen.screenToDipPoint(centerPhysical)
  } catch {
    return centerPhysical
  }
}

function screenToDipRect(physicalRect) {
  try {
    const topLeft = screen.screenToDipPoint({ x: physicalRect.left, y: physicalRect.top })
    const bottomRight = screen.screenToDipPoint({ x: physicalRect.right, y: physicalRect.bottom })
    return { x: topLeft.x, y: topLeft.y, width: bottomRight.x - topLeft.x, height: bottomRight.y - topLeft.y }
  } catch {
    return {
      x: physicalRect.left,
      y: physicalRect.top,
      width: physicalRect.right - physicalRect.left,
      height: physicalRect.bottom - physicalRect.top,
    }
  }
}

function contentDipRect(hwnd) {
  const win = readRect(hwnd)
  if (!win) return null
  const insets = frameInsets(hwnd)
  return screenToDipRect({
    left: win.left + insets.left,
    top: win.top + insets.top,
    right: win.right - insets.right,
    bottom: win.bottom - insets.bottom,
  })
}

function queryMinTrackDip(hwnd, display) {
  const info = Buffer.alloc(40)
  const result = Buffer.alloc(8)
  const ok = SendMessageTimeoutW(hwnd, WM_GETMINMAXINFO, 0, info, SMTO_ABORTIFHUNG, 120, result)
  if (!ok) return null
  const trackX = info.readInt32LE(24)
  const trackY = info.readInt32LE(28)
  if (trackX <= 0 && trackY <= 0) return null
  const scale = display.scaleFactor || 1
  return { w: Math.round(trackX / scale), h: Math.round(trackY / scale) }
}

function ensureMinSize(hwnd, display) {
  if (minSizeByHwnd.has(hwnd)) return
  const min = queryMinTrackDip(hwnd, display)
  if (min) minSizeByHwnd.set(hwnd, min)
}

function positionPhysical(hwnd, dipRect) {
  let physical
  try {
    physical = screen.dipToScreenRect(null, dipRect)
  } catch {
    physical = dipRect
  }
  const insets = frameInsets(hwnd)
  const flags = SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED | SWP_ASYNCWINDOWPOS
  SetWindowPos(
    hwnd,
    0,
    physical.x - insets.left,
    physical.y - insets.top,
    physical.width + insets.left + insets.right,
    physical.height + insets.top + insets.bottom,
    flags
  )
}

function placeFloating(hwnd, display) {
  if (!hwnd || !IsWindow(hwnd)) return
  if (IsZoomed(hwnd) || IsIconic(hwnd)) ShowWindow(hwnd, SW_RESTORE)
  const wa = display.workArea
  const min = minSizeByHwnd.get(hwnd)
  let widthDip = min && min.w ? min.w : Math.round(wa.width * 0.6)
  let heightDip = min && min.h ? min.h : Math.round(wa.height * 0.6)
  widthDip = Math.min(widthDip, wa.width)
  heightDip = Math.min(heightDip, wa.height)
  const dipRect = {
    x: Math.round(wa.x + (wa.width - widthDip) / 2),
    y: Math.round(wa.y + (wa.height - heightDip) / 2),
    width: widthDip,
    height: heightDip,
  }
  positionPhysical(hwnd, dipRect)
  lastAppliedDipByHwnd.set(hwnd, { displayId: display.id, layoutIndex: -1, count: -1, dipRect })
}

function oversizedSnapshotKey() {
  return [...minSizeByHwnd.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([hwnd, min]) => `${hwnd}:${min.w}x${min.h}`)
    .join(',')
}

function pruneRuntimeMaps(windows) {
  const present = new Set(windows)
  for (const hwnd of [...lastAppliedDipByHwnd.keys()]) if (!present.has(hwnd)) lastAppliedDipByHwnd.delete(hwnd)
  for (const hwnd of [...minSizeByHwnd.keys()]) if (!present.has(hwnd)) minSizeByHwnd.delete(hwnd)
}

function alignOversizedInZone(hwnd, zoneName, display, content) {
  const wa = display.workArea
  const margin = config.margin
  const width = content.width
  const height = content.height
  let dipX
  let dipY
  if (config.centerOversized) {
    dipX = wa.x + (wa.width - width) / 2
    dipY = wa.y + (wa.height - height) / 2
  } else {
    const isRight = zoneName.indexOf('right') !== -1
    const isBottom = zoneName.indexOf('bottom') !== -1
    dipX = isRight ? wa.x + wa.width - width - margin : wa.x + margin
    dipY = isBottom ? wa.y + wa.height - height - margin : wa.y + margin
  }
  positionPhysical(hwnd, {
    x: Math.max(wa.x, Math.round(dipX)),
    y: Math.max(wa.y, Math.round(dipY)),
    width: Math.round(width),
    height: Math.round(height),
  })
}

function correctSnapOversize(hwnd, zoneName, display) {
  if (!config.handleOversized || !ZONES[zoneName]) return
  setTimeout(() => {
    try {
      if (!IsWindow(hwnd)) return
      const cell = zoneRectDip(display, ZONES[zoneName])
      const content = contentDipRect(hwnd)
      if (!content) return
      const overW = content.width - cell.width
      const overH = content.height - cell.height
      if (overW <= OVERSIZE_TOLERANCE && overH <= OVERSIZE_TOLERANCE) return
      const min = minSizeByHwnd.get(hwnd) || { w: 0, h: 0 }
      minSizeByHwnd.set(hwnd, {
        w: overW > OVERSIZE_TOLERANCE ? Math.round(content.width) : min.w,
        h: overH > OVERSIZE_TOLERANCE ? Math.round(content.height) : min.h,
      })
      alignOversizedInZone(hwnd, zoneName, display, content)
    } catch (e) { /* skip */ }
  }, SNAP_CORRECT_DELAY)
}

function displayForWindow(hwnd) {
  const center = rectCenterDip(hwnd)
  if (!center) return screen.getPrimaryDisplay()
  const displays = screen.getAllDisplays()
  const containing = displays.find((d) =>
    center.x >= d.bounds.x && center.x < d.bounds.x + d.bounds.width &&
    center.y >= d.bounds.y && center.y < d.bounds.y + d.bounds.height
  )
  return containing || screen.getDisplayNearestPoint(center)
}

const ZONES = {
  left: { x: 0, y: 0, w: 0.5, h: 1 },
  right: { x: 0.5, y: 0, w: 0.5, h: 1 },
  'top-left': { x: 0, y: 0, w: 0.5, h: 0.5 },
  'bottom-left': { x: 0, y: 0.5, w: 0.5, h: 0.5 },
  'top-right': { x: 0.5, y: 0, w: 0.5, h: 0.5 },
  'bottom-right': { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
  full: { x: 0, y: 0, w: 1, h: 1 },
}

function zoneRectDip(display, normRect) {
  const wa = display.workArea
  const margin = config.margin
  const halfGap = config.gap / 2
  const innerX = wa.x + margin
  const innerY = wa.y + margin
  const innerW = Math.max(1, wa.width - margin * 2)
  const innerH = Math.max(1, wa.height - margin * 2)
  return {
    x: Math.round(innerX + normRect.x * innerW + halfGap),
    y: Math.round(innerY + normRect.y * innerH + halfGap),
    width: Math.max(1, Math.round(normRect.w * innerW - config.gap)),
    height: Math.max(1, Math.round(normRect.h * innerH - config.gap)),
  }
}

function tileWindow(hwnd, normRect, display) {
  if (!hwnd || !IsWindow(hwnd)) return false
  if (IsZoomed(hwnd) || IsIconic(hwnd)) ShowWindow(hwnd, SW_RESTORE)

  const dipRect = zoneRectDip(display, normRect)
  let physical
  try {
    physical = screen.dipToScreenRect(null, dipRect)
  } catch {
    physical = dipRect
  }

  const insets = frameInsets(hwnd)
  const x = physical.x - insets.left
  const y = physical.y - insets.top
  const w = physical.width + insets.left + insets.right
  const h = physical.height + insets.top + insets.bottom

  const flags = SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED | SWP_ASYNCWINDOWPOS
  SetWindowPos(hwnd, 0, x, y, w, h, flags)
  return true
}

function transitionZone(current, direction) {
  switch (direction) {
    case 'left':
      if (current === 'right') return 'left'
      if (current === 'top-right') return 'top-left'
      if (current === 'bottom-right') return 'bottom-left'
      return 'left'
    case 'right':
      if (current === 'left') return 'right'
      if (current === 'top-left') return 'top-right'
      if (current === 'bottom-left') return 'bottom-right'
      return 'right'
    case 'up':
      if (current === 'left') return 'top-left'
      if (current === 'right') return 'top-right'
      if (current === 'bottom-left') return 'top-left'
      if (current === 'bottom-right') return 'top-right'
      return 'maximize'
    case 'down':
      if (current === 'left') return 'bottom-left'
      if (current === 'right') return 'bottom-right'
      if (current === 'top-left') return 'bottom-left'
      if (current === 'top-right') return 'bottom-right'
      if (current === 'maximize') return 'restore'
      return 'minimize'
    default:
      return current
  }
}

function neighborDisplay(display, direction) {
  const displays = screen.getAllDisplays().slice().sort((a, b) => a.bounds.x - b.bounds.x)
  const index = displays.findIndex((d) => d.id === display.id)
  if (index === -1) return display
  const target = direction === 'left' ? index - 1 : index + 1
  if (target < 0 || target >= displays.length) return null
  return displays[target]
}

function doSnap(direction, shift) {
  const hwnd = toNum(GetForegroundWindow())
  if (!hwnd || !IsWindow(hwnd) || windowPid(hwnd) === ownPid()) return
  const display = displayForWindow(hwnd)

  if (shift && (direction === 'left' || direction === 'right')) {
    const target = neighborDisplay(display, direction)
    if (!target) return
    const current = snapStateByHwnd.get(hwnd)
    const zoneName = current && ZONES[current] ? current : 'full'
    tileWindow(hwnd, ZONES[zoneName], target)
    snapStateByHwnd.set(hwnd, zoneName)
    correctSnapOversize(hwnd, zoneName, target)
    return
  }

  const current = snapStateByHwnd.get(hwnd) || null
  const next = transitionZone(current, direction)

  if (next === 'maximize') {
    ShowWindow(hwnd, SW_MAXIMIZE)
    snapStateByHwnd.set(hwnd, 'maximize')
    return
  }
  if (next === 'minimize') {
    ShowWindow(hwnd, SW_MINIMIZE)
    snapStateByHwnd.delete(hwnd)
    return
  }
  if (next === 'restore') {
    ShowWindow(hwnd, SW_RESTORE)
    snapStateByHwnd.delete(hwnd)
    return
  }
  if (ZONES[next]) {
    tileWindow(hwnd, ZONES[next], display)
    snapStateByHwnd.set(hwnd, next)
    correctSnapOversize(hwnd, next, display)
  }
}

function layoutColumns(count, ratios) {
  const widths = ratios.widths
  const rects = []
  let x = 0
  for (let i = 0; i < count; i++) {
    rects.push({ x, y: 0, w: widths[i], h: 1 })
    x += widths[i]
  }
  return rects
}

function layoutMasterStack(count, ratios) {
  if (count === 1) return [{ x: 0, y: 0, w: 1, h: 1 }]
  const master = ratios.master
  const fractions = ratios.stack
  const stackCount = count - 1
  const rects = [{ x: 0, y: 0, w: master, h: 1 }]
  let y = 0
  for (let i = 0; i < stackCount; i++) {
    rects.push({ x: master, y, w: 1 - master, h: fractions[i] })
    y += fractions[i]
  }
  return rects
}

function layoutSpiral(count, ratios) {
  const nodes = (ratios && ratios.nodes) || {}
  const rects = []
  let x = 0
  let y = 0
  let w = 1
  let h = 1
  for (let i = 0; i < count; i++) {
    if (i === count - 1) {
      rects.push({ x, y, w, h })
      break
    }
    const r = nodes[i] != null ? nodes[i] : 0.5
    if (i % 2 === 0) {
      rects.push({ x, y, w: w * r, h })
      x += w * r
      w *= 1 - r
    } else {
      rects.push({ x, y, w, h: h * r })
      y += h * r
      h *= 1 - r
    }
  }
  return rects
}

function getRatioStore(layout, count) {
  if (!config.ratios[layout]) config.ratios[layout] = {}
  const byCount = config.ratios[layout]
  const key = String(count)
  if (!byCount[key]) {
    if (layout === 'master-stack') {
      byCount[key] = count > 1
        ? { master: 0.6, stack: Array(count - 1).fill(1 / (count - 1)) }
        : { master: 0.6, stack: [] }
    } else if (layout === 'columns') {
      byCount[key] = { widths: Array(count).fill(1 / count) }
    } else {
      byCount[key] = { nodes: {} }
    }
  }
  return byCount[key]
}

function spiralSubRects(count) {
  const nodes = getRatioStore('bsp', count).nodes
  const subs = []
  let x = 0
  let y = 0
  let w = 1
  let h = 1
  for (let i = 0; i < count; i++) {
    subs.push({ x, y, w, h })
    if (i === count - 1) break
    const r = nodes[i] != null ? nodes[i] : 0.5
    if (i % 2 === 0) {
      x += w * r
      w *= 1 - r
    } else {
      y += h * r
      h *= 1 - r
    }
  }
  return subs
}

function computeLayout(count, ratioStore) {
  if (count <= 0) return []
  if (config.dynamicLayout === 'columns') return layoutColumns(count, ratioStore)
  if (config.dynamicLayout === 'master-stack') return layoutMasterStack(count, ratioStore)
  return layoutSpiral(count, ratioStore)
}

function reconcileOrder(currentHwnds) {
  const present = new Set(currentHwnds)
  windowOrder = windowOrder.filter((h) => present.has(h))
  const known = new Set(windowOrder)
  const added = currentHwnds.filter((h) => !known.has(h)).sort((a, b) => a - b)
  for (const h of added) windowOrder.push(h)
}

function orderIndex() {
  const map = new Map()
  windowOrder.forEach((h, i) => map.set(h, i))
  return map
}

function orderedForDisplay(hwnds) {
  const index = orderIndex()
  const rank = (h) => (index.has(h) ? index.get(h) : Number.MAX_SAFE_INTEGER)
  return hwnds.slice().sort((a, b) => rank(a) - rank(b))
}

function swapInOrder(a, b) {
  const ia = windowOrder.indexOf(a)
  const ib = windowOrder.indexOf(b)
  if (ia === -1 || ib === -1 || ia === ib) return
  windowOrder[ia] = b
  windowOrder[ib] = a
}

function groupByDisplay(windows) {
  const byDisplay = new Map()
  for (const hwnd of windows) {
    const display = displayForWindow(hwnd)
    if (!byDisplay.has(display.id)) byDisplay.set(display.id, { display, hwnds: [] })
    byDisplay.get(display.id).hwnds.push(hwnd)
  }
  return byDisplay
}

function layoutRectsForDisplay(display, ordered) {
  const ratioStore = getRatioStore(config.dynamicLayout, ordered.length)
  const rects = computeLayout(ordered.length, ratioStore)
  return ordered.map((hwnd, i) => ({ hwnd, rect: zoneRectDip(display, rects[i]) }))
}

function applyTile(hwnd, normRect, display, layoutIndex, count) {
  const cellDip = zoneRectDip(display, normRect)
  try { tileWindow(hwnd, normRect, display) } catch (e) { return }
  lastAppliedDipByHwnd.set(hwnd, { displayId: display.id, layoutIndex, count, dipRect: cellDip })
}

function layoutDisplay(display, ordered) {
  const ratioStore = getRatioStore(config.dynamicLayout, ordered.length)
  const rects = computeLayout(ordered.length, ratioStore)

  if (!config.handleOversized) {
    for (let i = 0; i < ordered.length; i++) applyTile(ordered[i], rects[i], display, i, ordered.length)
    return
  }

  const fits = []
  const oversized = []
  for (let i = 0; i < ordered.length; i++) {
    const cell = zoneRectDip(display, rects[i])
    const min = minSizeByHwnd.get(ordered[i])
    if (min && (cell.width < min.w - OVERSIZE_TOLERANCE || cell.height < min.h - OVERSIZE_TOLERANCE)) {
      oversized.push(ordered[i])
    } else {
      fits.push(ordered[i])
    }
  }

  if (oversized.length && fits.length) {
    const fitStore = getRatioStore(config.dynamicLayout, fits.length)
    const fitRects = computeLayout(fits.length, fitStore)
    for (let i = 0; i < fits.length; i++) applyTile(fits[i], fitRects[i], display, i, fits.length)
    for (const hwnd of oversized) {
      try { placeFloating(hwnd, display) } catch (e) { /* skip */ }
    }
  } else {
    for (let i = 0; i < ordered.length; i++) applyTile(ordered[i], rects[i], display, i, ordered.length)
  }
}

function applyDynamic() {
  if (dragActive && (!dragHwnd || !IsWindow(dragHwnd))) resetDragState()
  if (dragActive) return
  const windows = enumManageableWindows()
  reconcileOrder(windows)
  pruneRuntimeMaps(windows)
  if (config.handleOversized) {
    for (const hwnd of windows) ensureMinSize(hwnd, displayForWindow(hwnd))
  }
  const byDisplay = groupByDisplay(windows)

  const snapshot = JSON.stringify(
    [...byDisplay.values()].map((g) => [g.display.id, orderedForDisplay(g.hwnds)])
      .sort((a, b) => a[0] - b[0])
  ) + `|${config.dynamicLayout}|${config.gap}|${config.margin}` +
    `|${JSON.stringify(config.ratios[config.dynamicLayout] || {})}` +
    `|${config.handleOversized ? oversizedSnapshotKey() : ''}`
  if (snapshot === lastDynamicSnapshot) return
  lastDynamicSnapshot = snapshot

  for (const { display, hwnds } of byDisplay.values()) {
    layoutDisplay(display, orderedForDisplay(hwnds))
  }
}

function runDynamicApply() {
  if (!config.enabled || config.mode !== 'dynamic' || dragActive) return
  try { applyDynamic() } catch (e) { console.error('[tiling] apply error:', e.message) }
}

function clearDynamicApplyTimers() {
  for (const timer of dynamicApplyTimers) clearTimeout(timer)
  dynamicApplyTimers = []
}

function scheduleDynamicApply() {
  if (dynamicApplyTimers.length) return
  for (const delay of DYNAMIC_APPLY_DELAYS) {
    const timer = setTimeout(() => {
      dynamicApplyTimers = dynamicApplyTimers.filter((t) => t !== timer)
      runDynamicApply()
    }, delay)
    dynamicApplyTimers.push(timer)
  }
}

function stopDynamic() {
  if (dynamicTimer) {
    clearInterval(dynamicTimer)
    dynamicTimer = null
  }
  clearDynamicApplyTimers()
  lastDynamicSnapshot = ''
}

function startDynamic() {
  if (dynamicTimer) return
  applyDynamic()
  dynamicTimer = setInterval(() => {
    try { applyDynamic() } catch (e) { console.error('[tiling] dynamic error:', e.message) }
  }, 1000)
}

function syncRuntime() {
  if (config.enabled) installWinEventHook()
  else uninstallWinEventHook()
  if (config.enabled && config.mode === 'dynamic') startDynamic()
  else stopDynamic()
}

function pointInRect(point, rect) {
  return point.x >= rect.x && point.x < rect.x + rect.width &&
    point.y >= rect.y && point.y < rect.y + rect.height
}

function displayForPoint(point) {
  const displays = screen.getAllDisplays()
  const containing = displays.find((d) =>
    point.x >= d.bounds.x && point.x < d.bounds.x + d.bounds.width &&
    point.y >= d.bounds.y && point.y < d.bounds.y + d.bounds.height
  )
  return containing || screen.getDisplayNearestPoint(point)
}

function zoneFromPoint(display, point) {
  const wa = display.workArea
  const rx = wa.width > 0 ? (point.x - wa.x) / wa.width : 0.5
  const ry = wa.height > 0 ? (point.y - wa.y) / wa.height : 0.5
  const side = rx < 0.5 ? 'left' : 'right'
  if (ry < 0.22) return `top-${side}`
  if (ry > 0.78) return `bottom-${side}`
  return side
}

function complementZone(zone) {
  switch (zone) {
    case 'left': return 'right'
    case 'right': return 'left'
    case 'top-left': return 'top-right'
    case 'top-right': return 'top-left'
    case 'bottom-left': return 'bottom-right'
    case 'bottom-right': return 'bottom-left'
    default: return zone
  }
}

function clearDragWatchdog() {
  if (dragWatchdog) {
    clearTimeout(dragWatchdog)
    dragWatchdog = null
  }
}

function resetDragState() {
  clearDragWatchdog()
  dragActive = false
  dragHwnd = 0
  dragMode = null
  dragWasDragToZone = false
  dragStartZone = null
  dragStartDisplayId = null
  dragStartRect = null
}

function armDragWatchdog() {
  clearDragWatchdog()
  dragWatchdog = setTimeout(() => {
    resetDragState()
    if (config.enabled && config.mode === 'dynamic') scheduleDynamicApply()
  }, DRAG_WATCHDOG_MS)
}

function handleDragStart(hwnd) {
  if (!config.enabled) return
  if (dragActive && dragHwnd !== hwnd) resetDragState()
  if (!hwnd || windowPid(hwnd) === ownPid() || !isManageable(hwnd)) return
  if (config.mode === 'dynamic') {
    dragActive = true
    dragHwnd = hwnd
    dragMode = 'dynamic'
    dragStartRect = readRect(hwnd)
    armDragWatchdog()
  } else if (config.mode === 'snap' && config.dragToZone) {
    dragActive = true
    dragHwnd = hwnd
    dragMode = 'snap'
    dragWasDragToZone = true
    dragStartZone = snapStateByHwnd.get(hwnd) || null
    dragStartDisplayId = displayForWindow(hwnd).id
    armDragWatchdog()
  }
}

function wasResized(before, after) {
  if (!before || !after) return false
  const dw = Math.abs((after.right - after.left) - (before.right - before.left))
  const dh = Math.abs((after.bottom - after.top) - (before.bottom - before.top))
  return dw > RESIZE_THRESHOLD || dh > RESIZE_THRESHOLD
}

function applyArrayBoundary(arr, boundaryIndex, cumulativeFraction) {
  if (boundaryIndex < 1 || boundaryIndex > arr.length - 1) return
  let before = 0
  for (let i = 0; i < boundaryIndex - 1; i++) before += arr[i]
  const pairTotal = arr[boundaryIndex - 1] + arr[boundaryIndex]
  let first = cumulativeFraction - before
  first = Math.max(MIN_FRACTION, Math.min(pairTotal - MIN_FRACTION, first))
  arr[boundaryIndex - 1] = first
  arr[boundaryIndex] = pairTotal - first
}

function detectMovedEdge(oldDip, contentDip, display) {
  const wa = display.workArea
  const margin = config.margin
  const halfGap = config.gap / 2
  const innerX = wa.x + margin
  const innerY = wa.y + margin
  const innerW = Math.max(1, wa.width - margin * 2)
  const innerH = Math.max(1, wa.height - margin * 2)
  const edgeTol = halfGap + 4

  const oldLeft = oldDip.x
  const oldRight = oldDip.x + oldDip.width
  const oldTop = oldDip.y
  const oldBottom = oldDip.y + oldDip.height
  const newLeft = contentDip.x
  const newRight = contentDip.x + contentDip.width
  const newTop = contentDip.y
  const newBottom = contentDip.y + contentDip.height

  const outerLeft = innerX + halfGap
  const outerRight = innerX + innerW - halfGap
  const outerTop = innerY + halfGap
  const outerBottom = innerY + innerH - halfGap

  let vertical = null
  if (Math.abs(newRight - oldRight) > RESIZE_THRESHOLD && Math.abs(oldRight - outerRight) > edgeTol) {
    vertical = { side: 'right', oldEdge: oldRight, newEdge: newRight }
  } else if (Math.abs(newLeft - oldLeft) > RESIZE_THRESHOLD && Math.abs(oldLeft - outerLeft) > edgeTol) {
    vertical = { side: 'left', oldEdge: oldLeft, newEdge: newLeft }
  }
  let horizontal = null
  if (Math.abs(newBottom - oldBottom) > RESIZE_THRESHOLD && Math.abs(oldBottom - outerBottom) > edgeTol) {
    horizontal = { side: 'bottom', oldEdge: oldBottom, newEdge: newBottom }
  } else if (Math.abs(newTop - oldTop) > RESIZE_THRESHOLD && Math.abs(oldTop - outerTop) > edgeTol) {
    horizontal = { side: 'top', oldEdge: oldTop, newEdge: newTop }
  }
  if (!vertical && !horizontal) return null
  return { vertical, horizontal, innerX, innerY, innerW, innerH, halfGap }
}

function splitFractionX(edge, side, moved) {
  const split = edge + (side === 'right' ? moved.halfGap : -moved.halfGap)
  return (split - moved.innerX) / moved.innerW
}

function splitFractionY(edge, side, moved) {
  const split = edge + (side === 'bottom' ? moved.halfGap : -moved.halfGap)
  return (split - moved.innerY) / moved.innerH
}

function clampRatio(value) {
  return Math.max(MIN_FRACTION, Math.min(1 - MIN_FRACTION, value))
}

function writeBspFromEdge(prev, moved) {
  const count = prev.count
  const store = getRatioStore('bsp', count)
  const subs = spiralSubRects(count)
  if (moved.vertical) {
    const oldF = splitFractionX(moved.vertical.oldEdge, moved.vertical.side, moved)
    const newF = splitFractionX(moved.vertical.newEdge, moved.vertical.side, moved)
    let best = -1
    let bestDist = Infinity
    for (let j = 0; j < count - 1; j++) {
      if (j % 2 !== 0) continue
      const r = store.nodes[j] != null ? store.nodes[j] : 0.5
      const line = subs[j].x + subs[j].w * r
      const dist = Math.abs(line - oldF)
      if (dist < bestDist) { bestDist = dist; best = j }
    }
    if (best >= 0 && bestDist < 0.08 && subs[best].w > 0) {
      store.nodes[best] = clampRatio((newF - subs[best].x) / subs[best].w)
    }
  }
  if (moved.horizontal) {
    const oldF = splitFractionY(moved.horizontal.oldEdge, moved.horizontal.side, moved)
    const newF = splitFractionY(moved.horizontal.newEdge, moved.horizontal.side, moved)
    let best = -1
    let bestDist = Infinity
    for (let j = 0; j < count - 1; j++) {
      if (j % 2 === 0) continue
      const r = store.nodes[j] != null ? store.nodes[j] : 0.5
      const line = subs[j].y + subs[j].h * r
      const dist = Math.abs(line - oldF)
      if (dist < bestDist) { bestDist = dist; best = j }
    }
    if (best >= 0 && bestDist < 0.08 && subs[best].h > 0) {
      store.nodes[best] = clampRatio((newF - subs[best].y) / subs[best].h)
    }
  }
}

function writeRatioFromEdge(layout, prev, moved) {
  if (layout === 'bsp') { writeBspFromEdge(prev, moved); return }
  const store = getRatioStore(layout, prev.count)
  if (layout === 'master-stack') {
    if (moved.vertical && prev.count > 1) {
      store.master = clampRatio(splitFractionX(moved.vertical.newEdge, moved.vertical.side, moved))
    }
    if (moved.horizontal && prev.layoutIndex >= 1 && Array.isArray(store.stack)) {
      const j = prev.layoutIndex - 1
      const f = splitFractionY(moved.horizontal.newEdge, moved.horizontal.side, moved)
      applyArrayBoundary(store.stack, moved.horizontal.side === 'bottom' ? j + 1 : j, f)
    }
  } else if (layout === 'columns') {
    if (moved.vertical && Array.isArray(store.widths)) {
      const i = prev.layoutIndex
      const f = splitFractionX(moved.vertical.newEdge, moved.vertical.side, moved)
      applyArrayBoundary(store.widths, moved.vertical.side === 'right' ? i + 1 : i, f)
    }
  }
}

function cloneRatioEntry(entry) {
  if (!entry || typeof entry !== 'object') return entry
  const out = {}
  if (typeof entry.master === 'number') out.master = entry.master
  if (Array.isArray(entry.stack)) out.stack = entry.stack.slice()
  if (Array.isArray(entry.widths)) out.widths = entry.widths.slice()
  if (entry.nodes) out.nodes = { ...entry.nodes }
  return out
}

function interpolateMoved(moved, t) {
  const scale = (edge) => (edge ? { ...edge, newEdge: edge.oldEdge + (edge.newEdge - edge.oldEdge) * t } : null)
  return { ...moved, vertical: scale(moved.vertical), horizontal: scale(moved.horizontal) }
}

function tiledLayoutFits(ordered, display) {
  const ratioStore = getRatioStore(config.dynamicLayout, ordered.length)
  const rects = computeLayout(ordered.length, ratioStore)
  for (let i = 0; i < ordered.length; i++) {
    const min = minSizeByHwnd.get(ordered[i])
    if (!min) continue
    const cell = zoneRectDip(display, rects[i])
    if (cell.width < min.w - OVERSIZE_TOLERANCE || cell.height < min.h - OVERSIZE_TOLERANCE) return false
  }
  return true
}

function rescueFloated(hwnd, prev) {
  const display = screen.getAllDisplays().find((d) => d.id === prev.displayId) || displayForWindow(hwnd)
  const ordered = orderedForDisplay(enumManageableWindows().filter((h) => displayForWindow(h).id === display.id))
  const byCount = config.ratios[config.dynamicLayout]
  if (byCount) delete byCount[String(ordered.length)]
  saveConfig()
  if (broadcastRef) broadcastRef('tiling/config-changed', config)
}

function applyResizeToRatios(hwnd) {
  const prev = lastAppliedDipByHwnd.get(hwnd)
  if (!prev) return
  if (prev.layoutIndex < 0) {
    rescueFloated(hwnd, prev)
    return
  }
  const content = contentDipRect(hwnd)
  if (!content) return
  const display = screen.getAllDisplays().find((d) => d.id === prev.displayId) || displayForWindow(hwnd)
  const moved = detectMovedEdge(prev.dipRect, content, display)
  if (!moved) return

  const layout = config.dynamicLayout
  getRatioStore(layout, prev.count)
  const byCount = config.ratios[layout]
  const key = String(prev.count)
  const backup = cloneRatioEntry(byCount[key])

  writeRatioFromEdge(layout, prev, moved)

  if (config.handleOversized) {
    const ordered = orderedForDisplay(
      enumManageableWindows().filter((h) => displayForWindow(h).id === display.id)
    )
    if (ordered.length === prev.count && !tiledLayoutFits(ordered, display)) {
      let low = 0
      let high = 1
      let best = null
      for (let iter = 0; iter < 14; iter++) {
        const mid = (low + high) / 2
        byCount[key] = cloneRatioEntry(backup)
        writeRatioFromEdge(layout, prev, interpolateMoved(moved, mid))
        if (tiledLayoutFits(ordered, display)) {
          best = cloneRatioEntry(byCount[key])
          low = mid
        } else {
          high = mid
        }
      }
      byCount[key] = best || cloneRatioEntry(backup)
    }
  }

  saveConfig()
  if (broadcastRef) broadcastRef('tiling/config-changed', config)
}

function handleDynamicDrop(draggedHwnd, startRect) {
  if (!IsWindow(draggedHwnd)) {
    lastDynamicSnapshot = ''
    scheduleDynamicApply()
    return
  }
  const resized = wasResized(startRect, readRect(draggedHwnd))
  const cursor = screen.getCursorScreenPoint()
  const display = displayForPoint(cursor)
  const windows = enumManageableWindows()
  reconcileOrder(windows)
  if (resized) {
    applyResizeToRatios(draggedHwnd)
  } else {
    const onDisplay = windows.filter((h) => h === draggedHwnd || displayForWindow(h).id === display.id)
    const ordered = orderedForDisplay(onDisplay)
    const layout = layoutRectsForDisplay(display, ordered)
    const target = layout.find(({ hwnd, rect }) => hwnd !== draggedHwnd && pointInRect(cursor, rect))
    if (target) swapInOrder(draggedHwnd, target.hwnd)
  }
  lastDynamicSnapshot = ''
  applyDynamic()
}

function findZoneOccupant(display, zone, excludeHwnd) {
  const zoneRect = zoneRectDip(display, ZONES[zone])
  for (const hwnd of enumManageableWindows()) {
    if (hwnd === excludeHwnd) continue
    if (displayForWindow(hwnd).id !== display.id) continue
    const center = rectCenterDip(hwnd)
    if (center && pointInRect(center, zoneRect)) return hwnd
  }
  return 0
}

function evictZone(zone, display, keep) {
  for (const [h, z] of [...snapStateByHwnd]) {
    if (keep.includes(h)) continue
    if (!IsWindow(h)) { snapStateByHwnd.delete(h); continue }
    if (z === zone && displayForWindow(h).id === display.id) snapStateByHwnd.delete(h)
  }
}

function handleSnapDrop(draggedHwnd, startZone, startDisplayId) {
  if (!IsWindow(draggedHwnd)) return
  const cursor = screen.getCursorScreenPoint()
  const display = displayForPoint(cursor)
  const targetZone = zoneFromPoint(display, cursor)

  const occupant = findZoneOccupant(display, targetZone, draggedHwnd)

  tileWindow(draggedHwnd, ZONES[targetZone], display)
  snapStateByHwnd.set(draggedHwnd, targetZone)
  correctSnapOversize(draggedHwnd, targetZone, display)

  if (occupant && occupant !== draggedHwnd) {
    const swapZone = startZone && startZone !== targetZone && ZONES[startZone] ? startZone : complementZone(targetZone)
    const swapDisplay = (startZone && startDisplayId != null
      ? screen.getAllDisplays().find((d) => d.id === startDisplayId)
      : null) || display
    evictZone(swapZone, swapDisplay, [draggedHwnd, occupant])
    tileWindow(occupant, ZONES[swapZone], swapDisplay)
    snapStateByHwnd.set(occupant, swapZone)
    correctSnapOversize(occupant, swapZone, swapDisplay)
  }
}

function handleDragEnd(hwnd) {
  const wasDragging = dragActive && dragHwnd === hwnd
  const mode = dragMode
  const wasDragToZone = dragWasDragToZone
  const startZone = dragStartZone
  const startDisplayId = dragStartDisplayId
  const startRect = dragStartRect
  resetDragState()

  if (!config.enabled || !wasDragging) {
    if (config.enabled && config.mode === 'dynamic') scheduleDynamicApply()
    return
  }

  try {
    if (mode === 'dynamic') {
      handleDynamicDrop(hwnd, startRect)
    } else if (mode === 'snap' && wasDragToZone) {
      handleSnapDrop(hwnd, startZone, startDisplayId)
    }
  } catch (e) {
    console.error('[tiling] drop error:', e.message)
  }
}

function onWinEvent(_hook, event, hwndRaw, idObject, idChild) {
  try {
    if (!config.enabled) return
    if (idObject !== OBJID_WINDOW || idChild !== CHILDID_SELF) return
    const hwnd = toNum(hwndRaw)
    if (!hwnd) return

    if (event === EVENT_SYSTEM_MOVESIZESTART) { handleDragStart(hwnd); return }
    if (event === EVENT_SYSTEM_MOVESIZEEND) { handleDragEnd(hwnd); return }

    if (config.mode !== 'dynamic') return

    if (dragActive) {
      if (event === EVENT_SYSTEM_FOREGROUND && hwnd !== dragHwnd) {
        resetDragState()
        scheduleDynamicApply()
      }
      return
    }

    if (event === EVENT_SYSTEM_FOREGROUND || event === EVENT_SYSTEM_MINIMIZESTART ||
        event === EVENT_SYSTEM_MINIMIZEEND || event === EVENT_OBJECT_SHOW) {
      scheduleDynamicApply()
    }
  } catch (e) {
    console.error('[tiling] win event error:', e.message)
  }
}

function installWinEventHook() {
  if (winEventHookHandle || objectHookHandle) return
  try {
    winEventProcPointer = koffi.register(onWinEvent, koffi.pointer(WINEVENTPROC))
    winEventHookHandle = SetWinEventHook(
      EVENT_SYSTEM_FOREGROUND,
      EVENT_SYSTEM_MINIMIZEEND,
      0,
      winEventProcPointer,
      0,
      0,
      WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS
    )
    if (!toNum(winEventHookHandle)) {
      console.error('[tiling] Failed to install system win event hook')
      winEventHookHandle = null
      try { koffi.unregister(winEventProcPointer) } catch (_) {}
      winEventProcPointer = null
    }

    objectHookPointer = koffi.register(onWinEvent, koffi.pointer(WINEVENTPROC))
    objectHookHandle = SetWinEventHook(
      EVENT_OBJECT_SHOW,
      EVENT_OBJECT_SHOW,
      0,
      objectHookPointer,
      0,
      0,
      WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS
    )
    if (!toNum(objectHookHandle)) {
      console.error('[tiling] Failed to install object win event hook')
      objectHookHandle = null
      try { koffi.unregister(objectHookPointer) } catch (_) {}
      objectHookPointer = null
    }
  } catch (e) {
    console.error('[tiling] win event hook install error:', e.message)
  }
}

function uninstallWinEventHook() {
  if (winEventHookHandle) {
    try { UnhookWinEvent(winEventHookHandle) } catch (_) {}
    winEventHookHandle = null
  }
  if (winEventProcPointer) {
    try { koffi.unregister(winEventProcPointer) } catch (_) {}
    winEventProcPointer = null
  }
  if (objectHookHandle) {
    try { UnhookWinEvent(objectHookHandle) } catch (_) {}
    objectHookHandle = null
  }
  if (objectHookPointer) {
    try { koffi.unregister(objectHookPointer) } catch (_) {}
    objectHookPointer = null
  }
}

function handleHotkey(direction, shift) {
  if (!config.enabled || !config.hotkeys || config.mode !== 'snap') return false
  if (shift && direction !== 'left' && direction !== 'right') return false
  setImmediate(() => {
    try { doSnap(direction, shift) } catch (e) { console.error('[tiling] snap error:', e.message) }
  })
  return true
}

function setConfig(partial) {
  const previous = config
  config = sanitizeConfig({ ...config, ...partial })
  if (dragActive && (config.mode !== previous.mode || config.enabled !== previous.enabled || config.dragToZone !== previous.dragToZone)) {
    resetDragState()
  }
  saveConfig()
  syncRuntime()
  if (broadcastRef) broadcastRef('tiling/config-changed', config)
  return config
}

module.exports = {
  handlers: {
    'tiling/config-get': () => config,
    'tiling/config-set': (_event, partial) => setConfig(partial || {}),
    'tiling/snap': (_event, direction) => {
      if (!config.enabled) return false
      setImmediate(() => { try { doSnap(direction, false) } catch (e) { console.error('[tiling] snap error:', e.message) } })
      return true
    },
  },

  setShells(shells) {
    shellsRef = shells
  },

  handleHotkey,

  start(broadcast) {
    broadcastRef = broadcast
    loadConfig()
    syncRuntime()
    app.on('will-quit', () => uninstallWinEventHook())
  },
}
