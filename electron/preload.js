const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('shell', {
  windows: {
    wallpaper: () => ipcRenderer.invoke('windows/wallpaper'),
    onWallpaperChanged: (callback) => {
      ipcRenderer.on('windows/wallpaper-changed', (_, data) => callback(data))
    },
  }
})