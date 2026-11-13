const { app, screen, clipboard, ClipboardItem, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const { captureDisplay } = require('./displayCapture')
const { disableWindowTransitions } = require('../windowTransitions')
const winFocus = require('./winFocus')
const { thumbnailSize, screenshotFileName, screenshotSavedEvent } = require('./screenshotSaved')

const PARKED_X = -10000
const PARKED_Y = -10000
const PAINT_WAIT_MS = 250

let toTopbars = null
let markOverlayPainted = null
let focusBeforeOverlay = 0
let lastSaved = null
let savedCount = 0
let overlayWindow = null
let overlayWindowFactory = null
let overlayLoaded = null
let rendererReady = null
let rendererReadyResolve = null
let capturedImage = null
let capturedDisplay = null
let active = false
let showInFlight = false
let cancelRequested = false

function armRendererReady() {
  rendererReady = new Promise((resolve) => {
    rendererReadyResolve = resolve
  })
}

function ensureOverlayWindow() {
  if (overlayWindow && !overlayWindow.isDestroyed()) return
  if (!overlayWindowFactory) return
  armRendererReady()
  overlayWindow = overlayWindowFactory()
  overlayLoaded = new Promise((resolve) => {
    overlayWindow.webContents.once('did-finish-load', () => {
      keepOverlayShownOffScreen()
      resolve()
    })
  })
  overlayWindow.webContents.on('render-process-gone', () => armRendererReady())
  overlayWindow.webContents.on('did-start-loading', () => armRendererReady())
  overlayWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape') hideOverlay()
  })
  overlayWindow.on('closed', () => {
    overlayWindow = null
    overlayLoaded = null
    rendererReady = null
    rendererReadyResolve = null
    active = false
  })
}

function getScreenshotsFolder() {
  const pictures = app.getPath('pictures')
  const folder = path.join(pictures, 'Screenshots')
  if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true })
  return folder
}

function resolvesWithinMs(promise, ms) {
  return Promise.race([
    promise.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), ms)),
  ])
}

function keepOverlayShownOffScreen() {
  if (!overlayWindow || overlayWindow.isDestroyed() || active) return
  disableWindowTransitions(overlayWindow)
  overlayWindow.setIgnoreMouseEvents(true)
  overlayWindow.setOpacity(0)
  overlayWindow.setPosition(PARKED_X, PARKED_Y)
  if (!overlayWindow.isVisible()) overlayWindow.showInactive()
}

function giveFocusBack() {
  const previous = focusBeforeOverlay
  focusBeforeOverlay = 0
  if (previous) winFocus.forceForeground(previous)
}

function parkOverlay() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return
  overlayWindow.setIgnoreMouseEvents(true)
  overlayWindow.setOpacity(0)
  overlayWindow.setPosition(PARKED_X, PARKED_Y)
  giveFocusBack()
}

function overlayPainted() {
  return new Promise((resolve) => {
    const settle = () => {
      if (markOverlayPainted === settle) markOverlayPainted = null
      resolve()
    }
    markOverlayPainted = settle
    setTimeout(settle, PAINT_WAIT_MS)
  })
}

function sizeParkedOverlayFor(display) {
  const { width, height } = display.bounds
  const parked = overlayWindow.getBounds()
  if (parked.width === width && parked.height === height) return
  overlayWindow.setBounds({ x: PARKED_X, y: PARKED_Y, width, height })
}

async function showOverlay() {
  if (active || showInFlight) return
  showInFlight = true
  cancelRequested = false
  try {
    ensureOverlayWindow()
    if (!overlayWindow || overlayWindow.isDestroyed()) return

    focusBeforeOverlay = winFocus.getForegroundWindow()
    const cursor = screen.getCursorScreenPoint()
    const display = screen.getDisplayNearestPoint(cursor)
    const { width, height } = display.bounds
    sizeParkedOverlayFor(display)

    const frozenFrame = captureDisplay(display)
    if (!frozenFrame || frozenFrame.isEmpty()) {
      console.error('[screenshot] Could not capture the display; aborting')
      return
    }

    const ready = await resolvesWithinMs(Promise.all([overlayLoaded, rendererReady]), 3000)
    if (!ready) {
      console.error('[screenshot] Overlay renderer not ready within 3s; aborting')
      parkOverlay()
      return
    }
    if (cancelRequested) {
      parkOverlay()
      return
    }
    if (!overlayWindow || overlayWindow.isDestroyed()) return

    active = true
    capturedDisplay = display
    capturedImage = frozenFrame

    const { x, y } = display.bounds
    overlayWindow.setOpacity(0)
    overlayWindow.setBounds({ x, y, width, height })
    overlayWindow.setAlwaysOnTop(true, 'screen-saver')
    if (!overlayWindow.isVisible()) {
      disableWindowTransitions(overlayWindow)
      overlayWindow.showInactive()
    }
    const painted = overlayPainted()
    overlayWindow.webContents.send('screenshot/show', {
      image: `data:image/jpeg;base64,${frozenFrame.toJPEG(90).toString('base64')}`,
    })
    await painted
    if (!active || !overlayWindow || overlayWindow.isDestroyed()) return
    overlayWindow.setOpacity(1)
    overlayWindow.setIgnoreMouseEvents(false)
    overlayWindow.focus()
  } catch (err) {
    console.error('[screenshot] Failed to show overlay:', err)
    active = false
    capturedImage = null
    capturedDisplay = null
    parkOverlay()
  } finally {
    showInFlight = false
  }
}

function hideOverlay() {
  if (showInFlight && !active) {
    cancelRequested = true
    return true
  }
  if (!active || !overlayWindow || overlayWindow.isDestroyed()) return false
  active = false
  capturedImage = null
  capturedDisplay = null
  overlayWindow.webContents.send('screenshot/hide')
  parkOverlay()
  return true
}

function copyPngToClipboard(pngBuffer) {
  const item = new ClipboardItem({ 'image/png': new Blob([pngBuffer], { type: 'image/png' }) })
  clipboard.write([item]).catch((err) => console.error('[screenshot] Failed to copy to the clipboard:', err))
}

function cropAndSave(region) {
  if (!capturedImage || !capturedDisplay) return

  const sf = capturedDisplay.scaleFactor || 1
  const sx = Math.round(region.x * sf)
  const sy = Math.round(region.y * sf)
  const sw = Math.round(region.width * sf)
  const sh = Math.round(region.height * sf)

  const cropped = capturedImage.crop({ x: sx, y: sy, width: sw, height: sh })
  const pngBuffer = cropped.toPNG()

  const folder = getScreenshotsFolder()
  const filename = screenshotFileName(new Date(), (name) => fs.existsSync(path.join(folder, name)))
  const filepath = path.join(folder, filename)
  fs.writeFileSync(filepath, pngBuffer)

  copyPngToClipboard(pngBuffer)

  console.log(`[screenshot] Saved: ${filepath}`)
  return { image: cropped, displayId: capturedDisplay.id, filepath }
}

function thumbnailDataUrl(image) {
  const { width, height } = image.getSize()
  const size = thumbnailSize(width, height)
  return size ? image.resize({ ...size, quality: 'good' }).toDataURL() : null
}

function announceSaved({ image, displayId, filepath }) {
  lastSaved = { id: ++savedCount, filepath }
  if (!toTopbars) return
  try {
    toTopbars('screenshot/saved', screenshotSavedEvent(lastSaved.id, thumbnailDataUrl(image), filepath, displayId))
  } catch (err) {
    console.error('[screenshot] Failed to announce the capture:', err)
  }
}

function revealSaved(id) {
  if (!lastSaved || lastSaved.id !== id || !fs.existsSync(lastSaved.filepath)) return { ok: false }
  shell.showItemInFolder(lastSaved.filepath)
  return { ok: true }
}

module.exports = {
  handlers: {
    'screenshot/region-selected': (_event, region) => {
      let saved = null
      try {
        saved = cropAndSave(region)
      } catch (err) {
        console.error('[screenshot] Failed to save:', err)
      } finally {
        hideOverlay()
      }
      if (saved) announceSaved(saved)
    },
    'screenshot/cancel': () => {
      hideOverlay()
    },
    'screenshot/reveal': (_event, id) => revealSaved(id),
    'screenshot/painted': () => {
      if (markOverlayPainted) markOverlayPainted()
    },
    'screenshot/overlay-ready': () => {
      if (rendererReadyResolve) rendererReadyResolve()
    },
  },

  setOverlayWindowFactory(factory) {
    overlayWindowFactory = factory
  },

  prewarmOverlay: ensureOverlayWindow,

  showOverlay,
  hideOverlay,

  start(_broadcast, broadcastToTopbars) {
    toTopbars = typeof broadcastToTopbars === 'function' ? broadcastToTopbars : null
  },
}
