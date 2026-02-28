const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('shell', {
  windows: {
    wallpaper: () => ipcRenderer.invoke('windows/wallpaper'),
    onWallpaperChanged: (callback) => {
      ipcRenderer.on('windows/wallpaper-changed', (_, data) => callback(data))
    },
  },
  network: {
    wifiSignal: () => ipcRenderer.invoke('network/wifi-signal'),
    onWifiSignalChanged: (callback) => {
      ipcRenderer.on('network/wifi-signal-changed', (_, data) => callback(data))
    },
  },
  system: {
    bluetooth: () => ipcRenderer.invoke('system/bluetooth'),
    onBluetoothChanged: (callback) => {
      ipcRenderer.on('system/bluetooth-changed', (_, data) => callback(data))
    },
  },
})