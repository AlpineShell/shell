const { app, screen, desktopCapturer, clipboard, ClipboardItem } = require('electron')
const path = require('path')
const fs = require('fs')

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
    overlayWindow.webContents.once('did-finish-load', () => resolve())
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

function parkOverlay() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return
  overlayWindow.setIgnoreMouseEvents(true)
  overlayWindow.setBounds({ x: -10000, y: -10000, width: 1, height: 1 })
  overlayWindow.hide()
}

async function showOverlay() {
  if (active || showInFlight) return
  showInFlight = true
  cancelRequested = false
  try {
    ensureOverlayWindow()
    if (!overlayWindow || overlayWindow.isDestroyed()) return

    const cursor = screen.getCursorScreenPoint()
    const display = screen.getDisplayNearestPoint(cursor)
    const { width, height } = display.bounds
    const sf = display.scaleFactor || 1
    const pw = Math.round(width * sf)
    const ph = Math.round(height * sf)

    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: pw, height: ph },
    })

    const source = sources.find(s => s.display_id === String(display.id)) || sources[0]
    if (!source || source.thumbnail.isEmpty()) {
      console.error('[screenshot] No usable screen source; aborting')
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
    capturedImage = source.thumbnail

    const { x, y } = display.bounds
    overlayWindow.webContents.send('screenshot/show', {
      image: `data:image/jpeg;base64,${source.thumbnail.toJPEG(90).toString('base64')}`,
    })
    overlayWindow.setIgnoreMouseEvents(false)
    overlayWindow.setBounds({ x, y, width, height })
    overlayWindow.setAlwaysOnTop(true, 'screen-saver')
    overlayWindow.show()
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

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)
  const filename = `Screenshot_${timestamp}.png`
  const filepath = path.join(getScreenshotsFolder(), filename)
  fs.writeFileSync(filepath, pngBuffer)

  copyPngToClipboard(pngBuffer)

  console.log(`[screenshot] Saved: ${filepath}`)
}

module.exports = {
  handlers: {
    'screenshot/region-selected': (_event, region) => {
      try {
        cropAndSave(region)
      } catch (err) {
        console.error('[screenshot] Failed to save:', err)
      } finally {
        hideOverlay()
      }
    },
    'screenshot/cancel': () => {
      hideOverlay()
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

  start() {},
}
