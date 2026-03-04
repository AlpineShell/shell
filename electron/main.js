const { app, BrowserWindow, screen } = require('electron')
const path = require('path')
const ipc = require('./ipc')
const wallpaper = require('./modules/wallpaper')
const network = require('./modules/network')
const bluetooth = require('./modules/bluetooth')
const openApps = require('./modules/openApps')
const {
  registerAppBar,
  unregisterAppBar,
  unregisterAll,
  reassertPosition,
  CALLBACK_MSG,
  ABN_POSCHANGED,
  ABN_FULLSCREENAPP,
} = require('./modules/appbar')

const BASE_URL = 'http://localhost:5173'
const TOP_BAR_HEIGHT = 24

const shells = new Map()

function createDesktopWindow(display) {
  const { x, y, width, height } = display.bounds

  const win = new BrowserWindow({
    x, y, width, height,
    frame: false,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    focusable: false,
    transparent: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  win.setAlwaysOnTop(false)
  win.loadURL(`${BASE_URL}?mode=desktop`)

  return win
}

function createTopBarWindow(display) {
  const { x, y, width } = display.bounds

  const win = new BrowserWindow({
    x, y, width,
    height: TOP_BAR_HEIGHT,
    frame: false,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    focusable: true,
    transparent: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  win.setAlwaysOnTop(true, 'pop-up-menu')
  win.loadURL(`${BASE_URL}?mode=topbar`)

  win.webContents.once('did-finish-load', () => {
    try {
      registerAppBar(win, display, TOP_BAR_HEIGHT)
    } catch (err) {
      console.error(`[main] Failed to register appbar on display ${display.id}:`, err)
    }

    try {
      win.hookWindowMessage(CALLBACK_MSG, (wParam) => {
        const notification = wParam.readUInt32LE(0)
        if (notification === ABN_POSCHANGED) {
          reassertPosition(win)
        } else if (notification === ABN_FULLSCREENAPP) {
          win.setAlwaysOnTop(true, 'pop-up-menu')
        }
      })
    } catch (err) {
      console.error(`[main] Failed to hook window message on display ${display.id}:`, err)
    }
  })

  return win
}

function createShellForDisplay(display) {
  console.log(`[main] Creating shell for display ${display.id}: ${display.bounds.width}x${display.bounds.height} @ ${display.scaleFactor}x DPI`)

  const desktop = createDesktopWindow(display)
  const topBar = createTopBarWindow(display)

  shells.set(display.id, { desktop, topBar, display })
  return { desktop, topBar }
}

function destroyShellForDisplay(displayId) {
  const shell = shells.get(displayId)
  if (!shell) return

  console.log(`[main] Destroying shell for display ${displayId}`)

  try { unregisterAppBar(shell.topBar) } catch (e) { /* ignore */ }
  if (!shell.topBar.isDestroyed()) shell.topBar.destroy()
  if (!shell.desktop.isDestroyed()) shell.desktop.destroy()

  shells.delete(displayId)
}

function repositionShell(display) {
  const shell = shells.get(display.id)
  if (!shell) return

  console.log(`[main] Repositioning shell for display ${display.id}: ${display.bounds.width}x${display.bounds.height} @ ${display.scaleFactor}x DPI`)

  const { x, y, width, height } = display.bounds

  shell.desktop.setBounds({ x, y, width, height })

  shell.topBar.setBounds({ x, y, width, height: TOP_BAR_HEIGHT })

  try {
    unregisterAppBar(shell.topBar)
    registerAppBar(shell.topBar, display, TOP_BAR_HEIGHT)
  } catch (err) {
    console.error(`[main] Failed to re-register appbar on display ${display.id}:`, err)
  }

  shell.display = display
}

app.whenReady().then(() => {
  ipc.register(wallpaper, network, bluetooth, openApps)

  for (const display of screen.getAllDisplays()) {
    createShellForDisplay(display)
  }

  screen.on('display-added', (_event, newDisplay) => {
    console.log(`[main] Display added: ${newDisplay.id}`)
    createShellForDisplay(newDisplay)
  })

  screen.on('display-removed', (_event, oldDisplay) => {
    console.log(`[main] Display removed: ${oldDisplay.id}`)
    destroyShellForDisplay(oldDisplay.id)
  })

  setInterval(() => {
    for (const shell of shells.values()) {
      if (!shell.topBar.isDestroyed()) {
        try {
          reassertPosition(shell.topBar)
        } catch (err) { /* ignore */ }
      }
    }
  }, 30_000)

  screen.on('display-metrics-changed', (_event, display, changedMetrics) => {
    console.log(`[main] Display metrics changed: ${display.id} [${changedMetrics.join(', ')}]`)
    if (changedMetrics.includes('bounds') || changedMetrics.includes('workArea') || changedMetrics.includes('scaleFactor')) {
      repositionShell(display)
    }
  })
})

app.on('will-quit', () => {
  unregisterAll()
})
