// The bridge inside a plugin's own window. It exposes the plugin's id, the window's id and the
// opaque session blob its backend supplied, plus a way to talk back to that backend.
//
// The shell does not read the session. It is whatever the plugin put there — for a video
// plugin, the endpoint and geometry its window needs to open the stream itself, because the
// read has to happen in the same process and event-loop turn as the notification that a frame
// is ready. Anything else tears a single-buffered source.

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

contextBridge.exposeInMainWorld('alpineWindow', {
  pluginId,
  windowId,
  session: decodeSession(),
  // Reaches this plugin's own backend and no other: the id is fixed at window creation and is
  // not something the page can name.
  command: (name, payload) => ipcRenderer.invoke('plugin-window/command', { pluginId, windowId, name, payload }),
  onMessage: (callback) => {
    const handler = (_event, message) => callback(message)
    ipcRenderer.on('plugin-window/message', handler)
    return () => ipcRenderer.removeListener('plugin-window/message', handler)
  },
  close: () => ipcRenderer.invoke('plugin-window/close', { pluginId, windowId }),
})
