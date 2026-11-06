const crypto = require('crypto')
const koffi = require('koffi')
const winEvents = require('./winEvents')
const switcherWindows = require('./switcherWindows')
const windowCapture = require('./windowCapture')
const { isThumbnailStale } = require('./windowSwitcherPolicy')

const user32 = koffi.load('user32.dll')

const GetForegroundWindow = user32.func('__stdcall', 'GetForegroundWindow', 'uintptr_t', [])
const IsIconic = user32.func('__stdcall', 'IsIconic', 'int', ['uintptr_t'])

const EVENT_SYSTEM_FOREGROUND = 0x0003

const THUMBNAIL_MAX_WIDTH = 320
const THUMBNAIL_MAX_HEIGHT = 200
const SWEEP_INTERVAL_MS = 4000
const FIRST_SWEEP_DELAY_MS = 1500
const FOREGROUND_CAPTURE_DELAY_MS = 250
const MAX_FILLS_PER_SWEEP = 3
const BOOT_SETTLE_MS = 60000
const SLOW_WINDOW_RETRY_MS = 60000

const thumbnailCache = new Map()
const slowWindowsUntil = new Map()
let armed = false
let bootSettleUntil = 0
let pausedWhile = () => false
let lastForegroundWindow = 0
let sweepTimer = null
let sweepRunning = false
let foregroundCaptureTimer = null
let unsubscribeForeground = null

function toHandle(value) {
  return typeof value === 'bigint' ? Number(value) : value
}

function cached(hwnd) {
  const entry = thumbnailCache.get(hwnd)
  return entry ? entry.url : null
}

function isSlowWindow(hwnd) {
  const until = slowWindowsUntil.get(hwnd)
  if (!until) return false
  if (Date.now() < until) return true
  slowWindowsUntil.delete(hwnd)
  return false
}

function rememberSlowWindow(hwnd) {
  console.error(`[windowThumbnails] window ${hwnd} did not draw within ${windowCapture.CAPTURE_TIMEOUT_MS} ms, skipping it for a while`)
  slowWindowsUntil.set(hwnd, Date.now() + SLOW_WINDOW_RETRY_MS)
}

function thumbnailUrl({ width, height, pixels }) {
  const { nativeImage } = require('electron')
  return nativeImage.createFromBitmap(pixels, { width, height }).toDataURL()
}

function shotFingerprint({ width, height, pixels }) {
  return `${width}x${height}:${crypto.createHash('sha1').update(pixels).digest('base64')}`
}

function urlForShot(hwnd, shot, fingerprint) {
  const previous = thumbnailCache.get(hwnd)
  if (previous && previous.fingerprint === fingerprint) return previous.url
  return thumbnailUrl(shot)
}

async function capture(hwnd, { allowScreenCopy = true } = {}) {
  if (isSlowWindow(hwnd)) return cached(hwnd)
  try {
    const shot = await windowCapture.captureWindow(hwnd, { allowScreenCopy, maxWidth: THUMBNAIL_MAX_WIDTH, maxHeight: THUMBNAIL_MAX_HEIGHT })
    if (shot.status === 'timeout') rememberSlowWindow(hwnd)
    if (shot.status !== 'captured') return cached(hwnd)
    const fingerprint = shotFingerprint(shot)
    const url = urlForShot(hwnd, shot, fingerprint)
    thumbnailCache.set(hwnd, { url, ts: Date.now(), fingerprint })
    return url
  } catch (e) {
    console.error('[windowThumbnails] capture error:', e.message)
    return cached(hwnd)
  }
}

function warmingAllowed() {
  return armed && Date.now() >= bootSettleUntil && !pausedWhile()
}

async function warmIfStale(hwnd) {
  if (!hwnd || !warmingAllowed()) return
  if (!isThumbnailStale(thumbnailCache.get(hwnd), Date.now())) return
  try {
    if (IsIconic(hwnd) || !switcherWindows.isEligible(hwnd)) return
    await capture(hwnd)
  } catch (e) {
    console.error('[windowThumbnails] warm capture error:', e.message)
  }
}

function forgetClosedWindows(liveHandles) {
  const live = new Set(liveHandles)
  for (const hwnd of [...thumbnailCache.keys()]) {
    if (!live.has(hwnd)) thumbnailCache.delete(hwnd)
  }
  for (const hwnd of [...slowWindowsUntil.keys()]) {
    if (!live.has(hwnd)) slowWindowsUntil.delete(hwnd)
  }
}

async function fillMissing(handles) {
  let fills = 0
  for (const hwnd of handles) {
    if (!warmingAllowed()) return
    if (IsIconic(hwnd) || thumbnailCache.has(hwnd) || isSlowWindow(hwnd)) continue
    await capture(hwnd)
    if (++fills >= MAX_FILLS_PER_SWEEP) break
  }
}

async function sweep() {
  if (sweepRunning || !warmingAllowed()) return
  sweepRunning = true
  try {
    const handles = switcherWindows.listHandles()
    forgetClosedWindows(handles)
    await fillMissing(handles)
    await warmIfStale(toHandle(GetForegroundWindow()))
  } catch (e) {
    console.error('[windowThumbnails] warm sweep error:', e.message)
  } finally {
    sweepRunning = false
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
