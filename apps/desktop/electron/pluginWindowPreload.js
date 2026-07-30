const { contextBridge, ipcRenderer } = require('electron')

function argument(name) {
  const prefix = `--${name}=`
  const found = process.argv.find((value) => value.startsWith(prefix))
  return found ? found.slice(prefix.length) : ''
}

function decodeSession() {
  const raw = argument('alpine-session')
  if (!raw) return null
  try {
    return JSON.parse(Buffer.from(raw, 'base64').toString('utf8'))
  } catch {
    return null
  }
}

const pluginId = argument('alpine-plugin-id')
const windowId = argument('alpine-window-id')

const bridge = {
  pluginId,
  windowId,
  session: decodeSession(),
  command: (name, payload) => ipcRenderer.invoke('plugin-window/command', { pluginId, windowId, name, payload }),
  onMessage: (callback) => {
    const handler = (_event, message) => callback(message)
    ipcRenderer.on('plugin-window/message', handler)
    return () => ipcRenderer.removeListener('plugin-window/message', handler)
  },
  close: () => ipcRenderer.invoke('plugin-window/close', { pluginId, windowId }),
}

contextBridge.exposeInMainWorld('alpineWindow', bridge)

const pluginPreload = argument('alpine-plugin-preload')
if (pluginPreload) {
  try {
    const extend = require(pluginPreload)
    const run = typeof extend === 'function' ? extend : extend && extend.default
    if (typeof run === 'function') {
      run({
        ...bridge,
        expose: (key, api) => contextBridge.exposeInMainWorld(key, api),
      })
    } else {
      console.error('[plugin-window] preload has no default export', pluginPreload)
    }
  } catch (e) {
    console.error('[plugin-window] preload failed:', e && e.stack ? e.stack : e)
  }
}
