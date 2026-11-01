const fs = require('fs')
const path = require('path')
const koffi = require('koffi')
const { screen } = require('electron')

const user32 = koffi.load('user32.dll')

const GetForegroundWindow = user32.func('__stdcall', 'GetForegroundWindow', 'uintptr_t', [])
const IsZoomed = user32.func('__stdcall', 'IsZoomed', 'int', ['uintptr_t'])
const GetWindowRect = user32.func('__stdcall', 'GetWindowRect', 'int', ['uintptr_t', 'void *'])
const GetDpiForWindow = user32.func('__stdcall', 'GetDpiForWindow', 'uint32', ['uintptr_t'])

const IsWindow = user32.func('__stdcall', 'IsWindow', 'int', ['uintptr_t'])
const IsWindowVisible = user32.func('__stdcall', 'IsWindowVisible', 'int', ['uintptr_t'])

const batterySaver = require('./batterySaver')
const windowCapture = require('./windowCapture')
const { isExposedOwnWindow } = require('./exposedOwnWindows')
const { titleBarStrip } = require('./windowCapturePolicy')

const { mostCommonColor } = require('./mostCommonColor')

const POLL_INTERVAL_MS = 300
const BATTERY_SAVER_POLL_INTERVAL_MS = 1000

const windowSwitcher = require('./windowSwitcher')

const perDisplay = new Map()
const pendingDisplay = new Map()
const hwndPerDisplay = new Map()
const sampledHwndPerDisplay = new Map()
let startupIgnoreHwnd = null
let displayRemovedListener = null
let stopPolling = null
let unsampledWindowsProvider = null
let sampling = false

const ADAPT_STORE_FILE = 'foreground-color.json'
let adaptToApps = true
let adaptStorePath = null
let adaptBroadcast = null

function colorEqual(a, b) {
  if (a === b) return true
  if (!a || !b) return false
  return a.r === b.r && a.g === b.g && a.b === b.b
}

function windowDpi(hwnd) {
  try {
    return GetDpiForWindow(hwnd) || 96
  } catch {
    return 96
  }
}

function titleBarStripOf(hwnd) {
  const rect = Buffer.alloc(16)
  if (!GetWindowRect(hwnd, rect)) return null
  return titleBarStrip({ left: rect.readInt32LE(0), top: rect.readInt32LE(4), right: rect.readInt32LE(8) }, windowDpi(hwnd))
}

async function sampleTitleBarColor(hwnd) {
  const strip = titleBarStripOf(hwnd)
  if (!strip) return { status: 'failed' }
  const shot = await windowCapture.captureScreenRect(strip)
  if (shot.status !== 'captured') return { status: shot.status === 'failed' ? 'failed' : 'unavailable' }
  const rgb = mostCommonColor(shot.pixels)
  return rgb ? { status: 'sampled', rgb } : { status: 'failed' }
}

function getDisplayIdForWindow(hwnd) {
  const rect = Buffer.alloc(16)
  if (!GetWindowRect(hwnd, rect)) return null
  const left = rect.readInt32LE(0)
  const top = rect.readInt32LE(4)
  const right = rect.readInt32LE(8)
  const bottom = rect.readInt32LE(12)
  const display = screen.getDisplayNearestPoint({
    x: Math.round((left + right) / 2),
    y: Math.round((top + bottom) / 2),
  })
  return display.id
}

function clearDisplay(displayId, broadcast) {
  hwndPerDisplay.delete(displayId)
  pendingDisplay.delete(displayId)
  sampledHwndPerDisplay.delete(displayId)
  if (perDisplay.has(displayId)) {
    perDisplay.delete(displayId)
    broadcast('topbar/fg-color-changed', { displayId })
  }
}

function getAdaptStorePath() {
  if (!adaptStorePath) {
    const { app } = require('electron')
    adaptStorePath = path.join(app.getPath('userData'), ADAPT_STORE_FILE)
  }
  return adaptStorePath
}

function loadAdaptToApps() {
  try {
    const file = getAdaptStorePath()
    if (!fs.existsSync(file)) return
    const data = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (typeof data.adaptToApps === 'boolean') adaptToApps = data.adaptToApps
  } catch (e) {
    console.error('[foregroundColor] load error:', e.message)
  }
}

function saveAdaptToApps() {
  try {
    fs.writeFileSync(getAdaptStorePath(), JSON.stringify({ adaptToApps }, null, 2))
  } catch (e) {
    console.error('[foregroundColor] save error:', e.message)
  }
}

function clearAllDisplays(broadcast) {
  const displayIds = new Set([...perDisplay.keys(), ...hwndPerDisplay.keys(), ...pendingDisplay.keys()])
  for (const displayId of displayIds) clearDisplay(displayId, broadcast)
}

function setAdaptToApps(value) {
  adaptToApps = value === true
  saveAdaptToApps()
  if (adaptBroadcast) {
    if (!adaptToApps) clearAllDisplays(adaptBroadcast)
    adaptBroadcast('topbar/fg-color-adapt-changed', adaptToApps)
  }
  return adaptToApps
}

function samplingStillWanted(hwnd) {
  return adaptToApps && !windowSwitcher.isActive() && GetForegroundWindow() === hwnd
}

async function update(broadcast) {
  if (sampling) return
  sampling = true
  try {
    await updateOnce(broadcast)
  } catch (e) {
    console.error('[foregroundColor] update error:', e.message)
  } finally {
    sampling = false
  }
}

async function updateOnce(broadcast) {
  if (windowSwitcher.isActive()) return
  if (!adaptToApps) return

  for (const [displayId, trackedHwnd] of [...hwndPerDisplay.entries()]) {
    if (!trackedHwnd || !IsZoomed(trackedHwnd)) {
      clearDisplay(displayId, broadcast)
    }
  }

  const hwnd = GetForegroundWindow()
  if (!hwnd || !IsZoomed(hwnd)) {
    if (startupIgnoreHwnd && (!IsWindow(startupIgnoreHwnd) || !IsZoomed(startupIgnoreHwnd))) {
      startupIgnoreHwnd = null
    }
    return
  }

  if (hwnd === startupIgnoreHwnd) return

  const displayId = getDisplayIdForWindow(hwnd)
  if (displayId == null) return

  if (isExposedOwnWindow(hwnd, unsampledWindowsProvider)) {
    clearDisplay(displayId, broadcast)
    return
  }

  hwndPerDisplay.set(displayId, hwnd)

  if (sampledHwndPerDisplay.get(displayId) === hwnd && perDisplay.has(displayId)) return

  const sample = await sampleTitleBarColor(hwnd)
  if (sample.status === 'unavailable' || !samplingStillWanted(hwnd)) return
  if (sample.status !== 'sampled') {
    clearDisplay(displayId, broadcast)
    return
  }

  const { rgb } = sample
  const lum = 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b
  const color = { r: rgb.r, g: rgb.g, b: rgb.b, darkText: lum > 128 }
  const pending = pendingDisplay.get(displayId)

  if (!colorEqual(pending, color)) {
    pendingDisplay.set(displayId, color)
    return
  }

  pendingDisplay.delete(displayId)
  sampledHwndPerDisplay.set(displayId, hwnd)
  startupIgnoreHwnd = null
  const prev = perDisplay.get(displayId)
  if (!colorEqual(prev, color)) {
    perDisplay.set(displayId, color)
    broadcast('topbar/fg-color-changed', { ...color, displayId })
  }
}

function stop() {
  if (displayRemovedListener) {
    screen.removeListener('display-removed', displayRemovedListener)
    displayRemovedListener = null
  }
  if (stopPolling) {
    stopPolling()
    stopPolling = null
  }
}

module.exports = {
  handlers: {
    'topbar/fg-color-adapt-get': () => adaptToApps,
    'topbar/fg-color-adapt-set': (_event, value) => setAdaptToApps(value),
    'topbar/fg-color': () => {
      const result = []
      for (const [displayId, color] of perDisplay) {
        result.push({ ...color, displayId })
      }
      return result
    },
  },
  setUnsampledWindows(provider) {
    unsampledWindowsProvider = typeof provider === 'function' ? provider : null
  },
  start(broadcast) {
    const { app } = require('electron')
    adaptBroadcast = broadcast
    loadAdaptToApps()
    const initial = GetForegroundWindow()
    if (initial && IsZoomed(initial)) startupIgnoreHwnd = initial
    displayRemovedListener = (_event, removed) => clearDisplay(removed.id, broadcast)
    screen.on('display-removed', displayRemovedListener)
    stopPolling = batterySaver.startAdaptivePolling(() => update(broadcast), POLL_INTERVAL_MS, BATTERY_SAVER_POLL_INTERVAL_MS)
    app.on('will-quit', stop)
  },
}
