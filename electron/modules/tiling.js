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
}

let config = { ...DEFAULT_CONFIG }
let storePath = null
let broadcastRef = null
let shellsRef = null
let dynamicTimer = null
let lastDynamicSnapshot = ''
const snapStateByHwnd = new Map()

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

function toNum(v) {
  return typeof v === 'bigint' ? Number(v) : v
}

function getStorePath() {
  if (!storePath) storePath = path.join(app.getPath('userData'), STORE_FILE)
  return storePath
}

function sanitizeConfig(raw) {
  const next = { ...DEFAULT_CONFIG }
  if (!raw || typeof raw !== 'object') return next
  if (typeof raw.enabled === 'boolean') next.enabled = raw.enabled
  if (raw.mode === 'snap' || raw.mode === 'dynamic') next.mode = raw.mode
  if (typeof raw.gap === 'number' && isFinite(raw.gap)) next.gap = Math.max(0, Math.min(64, Math.round(raw.gap)))
  if (typeof raw.margin === 'number' && isFinite(raw.margin)) next.margin = Math.max(0, Math.min(96, Math.round(raw.margin)))
  if (typeof raw.hotkeys === 'boolean') next.hotkeys = raw.hotkeys
  if (typeof raw.dragToZone === 'boolean') next.dragToZone = raw.dragToZone
  if (raw.dynamicLayout === 'bsp' || raw.dynamicLayout === 'columns' || raw.dynamicLayout === 'master-stack') {
    next.dynamicLayout = raw.dynamicLayout
  }
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
  }
}

function layoutColumns(count) {
  const rects = []
  for (let i = 0; i < count; i++) rects.push({ x: i / count, y: 0, w: 1 / count, h: 1 })
  return rects
}

function layoutMasterStack(count) {
  if (count === 1) return [{ x: 0, y: 0, w: 1, h: 1 }]
  const rects = [{ x: 0, y: 0, w: 0.6, h: 1 }]
  const stackCount = count - 1
  for (let i = 0; i < stackCount; i++) {
    rects.push({ x: 0.6, y: i / stackCount, w: 0.4, h: 1 / stackCount })
  }
  return rects
}

function layoutSpiral(count) {
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
    if (i % 2 === 0) {
      rects.push({ x, y, w: w / 2, h })
      x += w / 2
      w /= 2
    } else {
      rects.push({ x, y, w, h: h / 2 })
      y += h / 2
      h /= 2
    }
  }
  return rects
}

function computeLayout(count) {
  if (count <= 0) return []
  if (config.dynamicLayout === 'columns') return layoutColumns(count)
  if (config.dynamicLayout === 'master-stack') return layoutMasterStack(count)
  return layoutSpiral(count)
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
  const rects = computeLayout(ordered.length)
  return ordered.map((hwnd, i) => ({ hwnd, rect: zoneRectDip(display, rects[i]) }))
}

function applyDynamic() {
  if (dragActive && (!dragHwnd || !IsWindow(dragHwnd))) resetDragState()
  if (dragActive) return
  const windows = enumManageableWindows()
  reconcileOrder(windows)
  const byDisplay = groupByDisplay(windows)

  const snapshot = JSON.stringify(
    [...byDisplay.values()].map((g) => [g.display.id, orderedForDisplay(g.hwnds)])
      .sort((a, b) => a[0] - b[0])
  ) + `|${config.dynamicLayout}|${config.gap}|${config.margin}`
  if (snapshot === lastDynamicSnapshot) return
  lastDynamicSnapshot = snapshot

  for (const { display, hwnds } of byDisplay.values()) {
    const ordered = orderedForDisplay(hwnds)
    const rects = computeLayout(ordered.length)
    for (let i = 0; i < ordered.length; i++) {
      try { tileWindow(ordered[i], rects[i], display) } catch (e) { /* skip */ }
    }
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
  if (!resized) {
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

  if (occupant && occupant !== draggedHwnd) {
    const swapZone = startZone && startZone !== targetZone && ZONES[startZone] ? startZone : complementZone(targetZone)
    const swapDisplay = (startZone && startDisplayId != null
      ? screen.getAllDisplays().find((d) => d.id === startDisplayId)
      : null) || display
    evictZone(swapZone, swapDisplay, [draggedHwnd, occupant])
    tileWindow(occupant, ZONES[swapZone], swapDisplay)
    snapStateByHwnd.set(occupant, swapZone)
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
