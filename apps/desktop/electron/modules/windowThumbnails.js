const koffi = require('koffi')
const winEvents = require('./winEvents')
const switcherWindows = require('./switcherWindows')
const { isThumbnailStale } = require('./windowSwitcherPolicy')

const user32 = koffi.load('user32.dll')
const gdi32 = koffi.load('gdi32.dll')

const GetForegroundWindow = user32.func('__stdcall', 'GetForegroundWindow', 'uintptr_t', [])
const IsIconic = user32.func('__stdcall', 'IsIconic', 'int', ['uintptr_t'])
const PrintWindow = user32.func('__stdcall', 'PrintWindow', 'int', ['uintptr_t', 'uintptr_t', 'uint32'])
const GetWindowRect = user32.func('__stdcall', 'GetWindowRect', 'int', ['uintptr_t', 'void *'])
const GetDC = user32.func('__stdcall', 'GetDC', 'uintptr_t', ['uintptr_t'])
const ReleaseDC = user32.func('__stdcall', 'ReleaseDC', 'int', ['uintptr_t', 'uintptr_t'])
const CreateCompatibleDC = gdi32.func('__stdcall', 'CreateCompatibleDC', 'uintptr_t', ['uintptr_t'])
const CreateCompatibleBitmap = gdi32.func('__stdcall', 'CreateCompatibleBitmap', 'uintptr_t', ['uintptr_t', 'int', 'int'])
const SelectObject = gdi32.func('__stdcall', 'SelectObject', 'uintptr_t', ['uintptr_t', 'uintptr_t'])
const DeleteObject = gdi32.func('__stdcall', 'DeleteObject', 'int', ['uintptr_t'])
const DeleteDC = gdi32.func('__stdcall', 'DeleteDC', 'int', ['uintptr_t'])
const GetDIBits = gdi32.func('__stdcall', 'GetDIBits', 'int', ['uintptr_t', 'uintptr_t', 'uint32', 'uint32', 'void *', 'void *', 'uint32'])
const BitBlt = gdi32.func('__stdcall', 'BitBlt', 'int', ['uintptr_t', 'int', 'int', 'int', 'int', 'uintptr_t', 'int', 'int', 'uint32'])
const StretchBlt = gdi32.func('__stdcall', 'StretchBlt', 'int', ['uintptr_t', 'int', 'int', 'int', 'int', 'uintptr_t', 'int', 'int', 'int', 'int', 'uint32'])
const SetStretchBltMode = gdi32.func('__stdcall', 'SetStretchBltMode', 'int', ['uintptr_t', 'int'])
const SetBrushOrgEx = gdi32.func('__stdcall', 'SetBrushOrgEx', 'int', ['uintptr_t', 'int', 'int', 'void *'])

const SRCCOPY = 0x00CC0020
const HALFTONE = 4
const PW_RENDERFULLCONTENT = 2
const BITMAPINFOHEADER_BYTES = 40
const EVENT_SYSTEM_FOREGROUND = 0x0003

const THUMBNAIL_MAX_WIDTH = 320
const THUMBNAIL_MAX_HEIGHT = 200
const SWEEP_INTERVAL_MS = 4000
const FIRST_SWEEP_DELAY_MS = 1500
const FOREGROUND_CAPTURE_DELAY_MS = 250
const MAX_FILLS_PER_SWEEP = 3
const BOOT_SETTLE_MS = 60000

const thumbnailCache = new Map()
let armed = false
let bootSettleUntil = 0
let pausedWhile = () => false
let lastForegroundWindow = 0
let sweepTimer = null
let foregroundCaptureTimer = null
let unsubscribeForeground = null

function toHandle(value) {
  return typeof value === 'bigint' ? Number(value) : value
}

function cached(hwnd) {
  const entry = thumbnailCache.get(hwnd)
  return entry ? entry.url : null
}

function thumbnailSize(srcWidth, srcHeight) {
  const scale = Math.min(THUMBNAIL_MAX_WIDTH / srcWidth, THUMBNAIL_MAX_HEIGHT / srcHeight, 1.0)
  return { width: Math.max(1, Math.round(srcWidth * scale)), height: Math.max(1, Math.round(srcHeight * scale)) }
}

function bitmapInfoHeader(width, height) {
  const header = Buffer.alloc(BITMAPINFOHEADER_BYTES)
  header.writeUInt32LE(BITMAPINFOHEADER_BYTES, 0)
  header.writeInt32LE(width, 4)
  header.writeInt32LE(-height, 8)
  header.writeUInt16LE(1, 12)
  header.writeUInt16LE(32, 14)
  return header
}

function makeOpaque(pixels) {
  for (let i = 3; i < pixels.length; i += 4) pixels[i] = 255
}

function capture(hwnd, { allowScreenCopy = true } = {}) {
  if (IsIconic(hwnd)) return cached(hwnd)

  const rect = Buffer.alloc(16)
  GetWindowRect(hwnd, rect)
  const left = rect.readInt32LE(0)
  const top = rect.readInt32LE(4)
  const srcWidth = rect.readInt32LE(8) - left
  const srcHeight = rect.readInt32LE(12) - top
  if (srcWidth <= 0 || srcHeight <= 0) return cached(hwnd)

  const { width, height } = thumbnailSize(srcWidth, srcHeight)

  const screenDC = GetDC(0)
  if (!screenDC) return cached(hwnd)
  const memDC = CreateCompatibleDC(screenDC)
  const bmp = CreateCompatibleBitmap(screenDC, srcWidth, srcHeight)
  const oldBmp = SelectObject(memDC, bmp)
  const thumbDC = CreateCompatibleDC(screenDC)
  const thumbBmp = CreateCompatibleBitmap(screenDC, width, height)
  const oldThumbBmp = SelectObject(thumbDC, thumbBmp)

  try {
    let captured = PrintWindow(hwnd, memDC, PW_RENDERFULLCONTENT)
    if (!captured) captured = PrintWindow(hwnd, memDC, 0)
    if (!captured && !allowScreenCopy) return cached(hwnd)
    if (!captured) BitBlt(memDC, 0, 0, srcWidth, srcHeight, screenDC, left, top, SRCCOPY)

    SetStretchBltMode(thumbDC, HALFTONE)
    SetBrushOrgEx(thumbDC, 0, 0, null)
    if (!StretchBlt(thumbDC, 0, 0, width, height, memDC, 0, 0, srcWidth, srcHeight, SRCCOPY)) return cached(hwnd)
    SelectObject(thumbDC, oldThumbBmp)

    const pixels = Buffer.alloc(width * height * 4)
    if (!GetDIBits(screenDC, thumbBmp, 0, height, pixels, bitmapInfoHeader(width, height), 0)) return cached(hwnd)
    makeOpaque(pixels)

    const { nativeImage } = require('electron')
    const url = nativeImage.createFromBitmap(pixels, { width, height }).toDataURL()
    thumbnailCache.set(hwnd, { url, ts: Date.now() })
    return url
  } catch (_) {
    return cached(hwnd)
  } finally {
    SelectObject(thumbDC, oldThumbBmp)
    DeleteObject(thumbBmp)
    DeleteDC(thumbDC)
    SelectObject(memDC, oldBmp)
    DeleteObject(bmp)
    DeleteDC(memDC)
    ReleaseDC(0, screenDC)
  }
}

function warmingAllowed() {
  return armed && Date.now() >= bootSettleUntil && !pausedWhile()
}

function warmIfStale(hwnd) {
  if (!hwnd || !warmingAllowed()) return
  if (!isThumbnailStale(thumbnailCache.get(hwnd), Date.now())) return
  try {
    if (IsIconic(hwnd) || !switcherWindows.isEligible(hwnd)) return
    capture(hwnd)
  } catch (e) {
    console.error('[windowThumbnails] warm capture error:', e.message)
  }
}

function forgetClosedWindows(liveHandles) {
  const live = new Set(liveHandles)
  for (const hwnd of [...thumbnailCache.keys()]) {
    if (!live.has(hwnd)) thumbnailCache.delete(hwnd)
  }
}

function fillMissing(handles) {
  let fills = 0
  for (const hwnd of handles) {
    if (IsIconic(hwnd) || thumbnailCache.has(hwnd)) continue
    capture(hwnd)
    if (++fills >= MAX_FILLS_PER_SWEEP) break
  }
}

function sweep() {
  if (!warmingAllowed()) return
  try {
    const handles = switcherWindows.listHandles()
    forgetClosedWindows(handles)
    fillMissing(handles)
    warmIfStale(toHandle(GetForegroundWindow()))
  } catch (e) {
    console.error('[windowThumbnails] warm sweep error:', e.message)
  }
}

function onForegroundChanged() {
  if (pausedWhile()) return
  const foreground = toHandle(GetForegroundWindow())
  if (!foreground || foreground === lastForegroundWindow) return
  lastForegroundWindow = foreground
  if (foregroundCaptureTimer) clearTimeout(foregroundCaptureTimer)
  foregroundCaptureTimer = setTimeout(() => warmIfStale(foreground), FOREGROUND_CAPTURE_DELAY_MS)
}

function stopWarming() {
  if (unsubscribeForeground) unsubscribeForeground()
  if (sweepTimer) clearInterval(sweepTimer)
  if (foregroundCaptureTimer) clearTimeout(foregroundCaptureTimer)
  unsubscribeForeground = null
  sweepTimer = null
  foregroundCaptureTimer = null
}

function startWarming({ isPaused }) {
  const { app } = require('electron')
  pausedWhile = isPaused
  bootSettleUntil = Date.now() + BOOT_SETTLE_MS
  unsubscribeForeground = winEvents.subscribe('windowThumbnails', [EVENT_SYSTEM_FOREGROUND], onForegroundChanged)
  sweepTimer = setInterval(sweep, SWEEP_INTERVAL_MS)
  setTimeout(sweep, FIRST_SWEEP_DELAY_MS)
  app.on('will-quit', stopWarming)
}

function arm() {
  armed = true
}

module.exports = { cached, capture, arm, startWarming }
