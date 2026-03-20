const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('topbar', {
  setIgnoreMouseEvents: (ignore) => ipcRenderer.send('topbar/set-ignore-mouse', ignore),
  setHeight: (height) => ipcRenderer.send('topbar/set-height', height),
  color: () => ipcRenderer.invoke('topbar/color'),
  onColorChanged: (callback) => {
    ipcRenderer.on('topbar/color-changed', (_, data) => callback(data))
  },
  onCloseMenus: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('topbar/close-menus', handler)
    return () => ipcRenderer.removeListener('topbar/close-menus', handler)
  },
})

contextBridge.exposeInMainWorld('alttab', {
  onShow: (callback) => {
    ipcRenderer.on('alttab/show', (_, data) => callback(data))
  },
  onHide: (callback) => {
    ipcRenderer.on('alttab/hide', () => callback())
  },
  onSelectionChanged: (callback) => {
    ipcRenderer.on('alttab/selection-changed', (_, index) => callback(index))
  },
  activate: (hwnd) => ipcRenderer.invoke('alttab/activate', hwnd),
})

contextBridge.exposeInMainWorld('setup', {
  status: () => ipcRenderer.invoke('setup/status'),
  install: (options) => ipcRenderer.invoke('setup/install', options),
  skip: () => ipcRenderer.invoke('setup/skip'),
})

contextBridge.exposeInMainWorld('shell', {
  windows: {
    wallpaper: () => ipcRenderer.invoke('windows/wallpaper'),
    onWallpaperChanged: (callback) => {
      ipcRenderer.on('windows/wallpaper-changed', (_, data) => callback(data))
    },
    openApps: () => ipcRenderer.invoke('windows/open-apps'),
    onOpenAppsChanged: (callback) => {
      ipcRenderer.on('windows/open-apps-changed', (_, data) => callback(data))
    },
  },
  network: {
    wifiSignal: () => ipcRenderer.invoke('network/wifi-signal'),
    onWifiSignalChanged: (callback) => {
      ipcRenderer.on('network/wifi-signal-changed', (_, data) => callback(data))
    },
    wifiScan: () => ipcRenderer.invoke('network/wifi-scan'),
    onWifiScanUpdated: (callback) => {
      ipcRenderer.on('network/wifi-scan-updated', (_, data) => callback(data))
    },
    wifiConnect: (ssid, password) => ipcRenderer.invoke('network/wifi-connect', { ssid, password }),
    wifiDisconnect: () => ipcRenderer.invoke('network/wifi-disconnect'),
  },
  system: {
    bluetooth: () => ipcRenderer.invoke('system/bluetooth'),
    onBluetoothChanged: (callback) => {
      ipcRenderer.on('system/bluetooth-changed', (_, data) => callback(data))
    },
    bluetoothScan: () => ipcRenderer.invoke('system/bluetooth-scan'),
    bluetoothOpenSettings: () => ipcRenderer.invoke('system/bluetooth-settings'),
    volume: () => ipcRenderer.invoke('system/volume-get'),
    setVolume: (value) => ipcRenderer.invoke('system/volume-set', value),
    onVolumeChanged: (callback) => {
      ipcRenderer.on('system/volume-changed', (_, data) => callback(data))
    },
    mute: () => ipcRenderer.invoke('system/mute-get'),
    setMute: (muted) => ipcRenderer.invoke('system/mute-set', muted),
    onMuteChanged: (callback) => {
      ipcRenderer.on('system/mute-changed', (_, data) => callback(data))
    },
    brightness: () => ipcRenderer.invoke('system/brightness-get'),
    setBrightness: (value) => ipcRenderer.invoke('system/brightness-set', value),
    onBrightnessChanged: (callback) => {
      ipcRenderer.on('system/brightness-changed', (_, data) => callback(data))
    },
    getMonitors: () => ipcRenderer.invoke('system/monitors-get'),
    setMonitorBrightness: (id, value) => ipcRenderer.invoke('system/monitor-brightness-set', { id, value }),
    onMonitorsChanged: (callback) => {
      ipcRenderer.on('system/monitors-changed', (_, data) => callback(data))
    },
    powerAction: (action) => ipcRenderer.invoke('system/power-action', action),
    battery: () => ipcRenderer.invoke('system/battery'),
    onBatteryChanged: (callback) => {
      ipcRenderer.on('system/battery-changed', (_, data) => callback(data))
    },
  },
  media: {
    session: () => ipcRenderer.invoke('media/session'),
    onSessionChanged: (callback) => {
      ipcRenderer.on('media/session-changed', (_, data) => callback(data))
    },
    microphone: () => ipcRenderer.invoke('media/microphone'),
    onMicrophoneChanged: (callback) => {
      ipcRenderer.on('media/microphone-changed', (_, data) => callback(data))
    },
  },
})