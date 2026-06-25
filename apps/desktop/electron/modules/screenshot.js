const { app, screen, desktopCapturer, clipboard } = require('electron')
const path = require('path')
const fs = require('fs')

let overlayWindow = null
let overlayWindowFactory = null
let overlayReady = null
let capturedImage = null
let capturedDisplay = null
let active = false

function ensureOverlayWindow() {
  if (overlayWindow && !overlayWindow.isDestroyed()) return
  if (!overlayWindowFactory) return
  overlayWindow = overlayWindowFactory()
  overlayReady = new Promise((resolve) => {
    overlayWindow.webContents.once('did-finish-load', () => resolve())
  })
  overlayWindow.on('closed', () => {
    overlayWindow = null
    overlayReady = null
  })
}

function getScreenshotsFolder() {
  const pictures = app.getPath('pictures')
  const folder = path.join(pictures, 'Screenshots')
  if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true })
  return folder
}

async function showOverlay() {
  if (active) return
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
  if (!source) return

  await overlayReady
  if (!overlayWindow || overlayWindow.isDestroyed()) return

  active = true
  capturedDisplay = display
  capturedImage = source.thumbnail

  const { x, y } = display.bounds
  overlayWindow.setBounds({ x, y, width, height })
  overlayWindow.setAlwaysOnTop(true, 'screen-saver')
  overlayWindow.show()
  overlayWindow.focus()

  overlayWindow.webContents.send('screenshot/show', { width, height })
}

function hideOverlay() {
  if (!active || !overlayWindow || overlayWindow.isDestroyed()) return false
  active = false
  capturedImage = null
  capturedDisplay = null
  overlayWindow.webContents.send('screenshot/hide')
  overlayWindow.setBounds({ x: -10000, y: -10000, width: 1, height: 1 })
  return true
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

  clipboard.writeImage(cropped)

  console.log(`[screenshot] Saved: ${filepath}`)
  hideOverlay()
}

module.exports = {
  handlers: {
    'screenshot/region-selected': (_event, region) => {
      cropAndSave(region)
    },
    'screenshot/cancel': () => {
      hideOverlay()
    },
  },

  setOverlayWindowFactory(factory) {
    overlayWindowFactory = factory
  },

  showOverlay,
  hideOverlay,

  start() {},
}
