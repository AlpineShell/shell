const path = require('path')
const { pageUrl, preloadPath, iconPath } = require('./pluginWindowPage')
const { consoleReport } = require('./pluginWindowConsole')

const MIN_DIMENSION = 120
const MAX_DIMENSION = 16384
const DEFAULT_WIDTH = 960
const DEFAULT_HEIGHT = 640

const byPlugin = new Map()
const iconByHandle = new Map()
let sendToBackend = null

function configure(options) {
  sendToBackend = options && typeof options.send === 'function' ? options.send : null
}

function clampDimension(value, fallback) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(MAX_DIMENSION, Math.max(MIN_DIMENSION, Math.round(number)))
}

function record(pluginId) {
  let windows = byPlugin.get(pluginId)
  if (!windows) {
    windows = new Map()
    byPlugin.set(pluginId, windows)
  }
  return windows
}

function notify(pluginId, event, payload) {
  if (!sendToBackend) return
  sendToBackend(pluginId, { type: 'window-event', event, ...payload })
}

function open(pluginId, pluginDir, request) {
  const options = request && typeof request === 'object' ? request : {}
  const id = typeof options.id === 'string' && options.id ? options.id : null
  if (!id) return { ok: false, error: 'a window needs an id' }

  const url = pageUrl(pluginId, options.page)
  if (!url) return { ok: false, error: 'page must be an .html file inside the plugin folder' }

  const pluginPreload = options.preload ? preloadPath(pluginDir, options.preload) : null
  if (options.preload && !pluginPreload) {
    return { ok: false, error: 'preload must be a .js file inside the plugin folder' }
  }

  const pluginIcon = options.icon ? iconPath(pluginDir, options.icon) : null
  if (options.icon && !pluginIcon) {
    return { ok: false, error: 'icon must be an .ico or .png file inside the plugin folder' }
  }

  const windows = record(pluginId)
  const existing = windows.get(id)
  if (existing && !existing.isDestroyed()) {
    existing.show()
    existing.focus()
    return { ok: true, reused: true }
  }

  const { app, BrowserWindow } = require('electron')
  const win = new BrowserWindow({
    useContentSize: true,
    width: clampDimension(options.width, DEFAULT_WIDTH),
    height: clampDimension(options.height, DEFAULT_HEIGHT),
    minWidth: clampDimension(options.minWidth, MIN_DIMENSION),
    minHeight: clampDimension(options.minHeight, MIN_DIMENSION),
    title: typeof options.title === 'string' && options.title ? options.title : pluginId,
    backgroundColor: '#000000',
    show: false,
    autoHideMenuBar: true,
    ...(pluginIcon ? { icon: pluginIcon } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'pluginWindowPreload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
      devTools: !app.isPackaged,
      additionalArguments: [
        `--alpine-plugin-id=${pluginId}`,
        `--alpine-window-id=${id}`,
        `--alpine-session=${Buffer.from(JSON.stringify(options.session ?? null)).toString('base64')}`,
        ...(pluginPreload ? [`--alpine-plugin-preload=${pluginPreload}`] : []),
      ],
    },
  })

  windows.set(id, win)
  const handle = handleOf(win)
  if (handle !== null && pluginIcon) iconByHandle.set(handle, pluginIcon)
  if (typeof win.removeMenu === 'function') win.removeMenu()
  win.on('page-title-updated', (event) => event.preventDefault())
  win.webContents.on('console-message', (...args) => {
    const report = consoleReport(args)
    if (report) console.log(`[plugin-window:${pluginId}/${id}] ${report}`)
  })
  win.webContents.on('preload-error', (_event, preloadFile, error) => {
    console.error(`[plugin-window:${pluginId}/${id}] preload failed: ${preloadFile}`)
    console.error(error && error.stack ? error.stack : error)
  })
  win.webContents.on('render-process-gone', (_event, details) => {
    console.error(`[plugin-window:${pluginId}/${id}] renderer gone:`, details && details.reason)
  })
  win.once('ready-to-show', () => {
    if (!win.isDestroyed()) win.show()
  })
  win.on('resize', () => {
    if (win.isDestroyed()) return
    const [width, height] = win.getContentSize()
    notify(pluginId, 'resize', { id, width, height })
  })
  win.on('closed', () => {
    const live = byPlugin.get(pluginId)
    if (live && live.get(id) === win) live.delete(id)
    if (handle !== null) iconByHandle.delete(handle)
    notify(pluginId, 'closed', { id })
  })
  win.loadURL(url)
  return { ok: true, reused: false }
}

function handleOf(win) {
  try {
    return win.getNativeWindowHandle().readUInt32LE(0)
  } catch {
    return null
  }
}

function nativeHandles() {
  const handles = []
  for (const windows of byPlugin.values()) {
    for (const win of windows.values()) {
      if (win.isDestroyed()) continue
      const handle = handleOf(win)
      if (handle !== null) handles.push(handle)
    }
  }
  return handles
}

function iconForHandle(handle) {
  return iconByHandle.get(handle) || null
}

function close(pluginId, id) {
  const windows = byPlugin.get(pluginId)
  const win = windows && windows.get(id)
  if (!win || win.isDestroyed()) return { ok: false, error: 'no such window' }
  win.close()
  return { ok: true }
}

function send(pluginId, id, channel, data) {
  const windows = byPlugin.get(pluginId)
  const win = windows && windows.get(id)
  if (!win || win.isDestroyed()) return { ok: false, error: 'no such window' }
  win.webContents.send('plugin-window/message', { channel, data })
  return { ok: true }
}

function closeAll(pluginId) {
  const windows = byPlugin.get(pluginId)
  if (!windows) return
  for (const win of [...windows.values()]) {
    if (!win.isDestroyed()) win.destroy()
  }
  byPlugin.delete(pluginId)
}

function closeWindowsOfGonePlugins() {
  const plugins = require('./modules/plugins')
  let live
  try {
    live = new Set(
      plugins
        .listPlugins()
        .filter((record) => record.enabled !== false && record.loadable === true)
        .map((record) => record.id),
    )
  } catch (e) {
    console.error('[plugin-windows] plugin lookup failed:', e && e.message)
    return
  }
  for (const pluginId of [...byPlugin.keys()]) {
    if (!live.has(pluginId)) closeAll(pluginId)
  }
}

function start() {
  require('./modules/plugins').onPluginsChanged(closeWindowsOfGonePlugins)
}

module.exports = { configure, open, close, send, closeAll, start, nativeHandles, iconForHandle }
