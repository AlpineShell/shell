const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('shell', {
  getWindows: () => ipcRenderer.invoke('get-windows'),
  launchApp: (path) => ipcRenderer.invoke('launch-app', path),
})