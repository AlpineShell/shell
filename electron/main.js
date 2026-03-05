const { app, BrowserWindow, screen, ipcMain } = require('electron')
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
  isSettingWorkArea,
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
    roundedCorners: false,
    thickFrame: false,
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

function forceShellBounds(shell) {
  if (!shell) return
  const { x, y, width, height } = shell.display.bounds
  if (!shell.desktop.isDestroyed()) shell.desktop.setBounds({ x, y, width, height })
  if (!shell.topBar.isDestroyed()) shell.topBar.setBounds({ x, y, width, height: TOP_BAR_HEIGHT })
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
  win.setIgnoreMouseEvents(true, { forward: true })
  win.loadURL(`${BASE_URL}?mode=topbar`)

  const onIgnoreMouse = (event, ignore) => {
    if (win.isDestroyed()) return
    if (event.sender === win.webContents) {
      win.setIgnoreMouseEvents(ignore, { forward: true })
    }
  }
  const onSetHeight = (event, height) => {
    if (win.isDestroyed()) return
    if (event.sender === win.webContents) {
      const bounds = win.getBounds()
      win.setBounds({ ...bounds, height })
    }
  }
  ipcMain.on('topbar/set-ignore-mouse', onIgnoreMouse)
  ipcMain.on('topbar/set-height', onSetHeight)
  win.on('closed', () => {
    ipcMain.removeListener('topbar/set-ignore-mouse', onIgnoreMouse)
    ipcMain.removeListener('topbar/set-height', onSetHeight)
  })

  win.webContents.once('did-finish-load', () => {
    try {
      registerAppBar(win, display, TOP_BAR_HEIGHT)
    } catch (err) {
      console.error(`[main] Failed to register appbar on display ${display.id}:`, err)
    }

    setTimeout(() => {
      const shell = [...shells.values()].find(s => s.topBar === win)
      if (shell) forceShellBounds(shell)
    }, 300)
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

  setTimeout(() => forceShellBounds(shell), 300)

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

  screen.on('display-metrics-changed', (_event, display, changedMetrics) => {
    if (isSettingWorkArea()) return

    if (changedMetrics.length === 1 && changedMetrics[0] === 'workArea') {
      const shell = shells.get(display.id)
      if (shell) forceShellBounds(shell)
      return
    }

    console.log(`[main] Display metrics changed: ${display.id} [${changedMetrics.join(', ')}]`)
    if (changedMetrics.includes('bounds') || changedMetrics.includes('scaleFactor')) {
      repositionShell(display)
    }
  })
})

app.on('will-quit', () => {
  unregisterAll()
})
