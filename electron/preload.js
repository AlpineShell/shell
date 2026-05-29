const { contextBridge, ipcRenderer } = require('electron')

let bootWallpaper = null
let bootBluetooth = null
let bootWifi = null
try { bootWallpaper = ipcRenderer.sendSync('windows/wallpaper-init') } catch {}
try { bootBluetooth = ipcRenderer.sendSync('system/bluetooth-init') } catch {}
try { bootWifi = ipcRenderer.sendSync('network/wifi-init') } catch {}

ipcRenderer.on('windows/wallpaper-changed', (_, data) => { bootWallpaper = data })
ipcRenderer.on('system/bluetooth-changed', (_, data) => { bootBluetooth = data })
ipcRenderer.on('network/wifi-radio-changed', (_, radio) => {
  if (bootWifi) bootWifi.radio = radio
  else bootWifi = { status: null, radio }
})
ipcRenderer.on('network/wifi-signal-changed', (_, status) => {
  if (bootWifi) bootWifi.status = status
  else bootWifi = { status, radio: true }
})

contextBridge.exposeInMainWorld('alpineBoot', {
  wallpaper: () => bootWallpaper,
  bluetooth: () => bootBluetooth,
  wifi: () => bootWifi,
})

contextBridge.exposeInMainWorld('topbar', {
  setIgnoreMouseEvents: (ignore) => ipcRenderer.send('topbar/set-ignore-mouse', ignore),
  setHeight: (height) => ipcRenderer.send('topbar/set-height', height),
  color: () => ipcRenderer.invoke('topbar/color'),
  onColorChanged: (callback) => {
    ipcRenderer.on('topbar/color-changed', (_, data) => callback(data))
  },
  foregroundColor: () => ipcRenderer.invoke('topbar/fg-color'),
  onForegroundColorChanged: (callback) => {
    ipcRenderer.on('topbar/fg-color-changed', (_, data) => callback(data))
  },
  colorOverride: () => ipcRenderer.invoke('topbar/color-override-get'),
  setColorOverride: (color) => ipcRenderer.invoke('topbar/color-override-set', color),
  colorPalette: () => ipcRenderer.invoke('topbar/color-palette'),
  searchIcon: () => ipcRenderer.invoke('topbar/search-icon-get'),
  setSearchIcon: (value) => ipcRenderer.invoke('topbar/search-icon-set', value),
  onSearchIconChanged: (callback) => {
    ipcRenderer.on('topbar/search-icon-changed', (_, data) => callback(data))
  },
  onCloseMenus: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('topbar/close-menus', handler)
    return () => ipcRenderer.removeListener('topbar/close-menus', handler)
  },
})

contextBridge.exposeInMainWorld('screenshot', {
  onShow: (callback) => {
    ipcRenderer.on('screenshot/show', (_, data) => callback(data))
  },
  onHide: (callback) => {
    ipcRenderer.on('screenshot/hide', () => callback())
  },
  regionSelected: (region) => ipcRenderer.invoke('screenshot/region-selected', region),
  cancel: () => ipcRenderer.invoke('screenshot/cancel'),
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

contextBridge.exposeInMainWorld('launcher', {
  index: () => ipcRenderer.invoke('launcher/index'),
  show: () => ipcRenderer.invoke('launcher/show'),
  hide: () => ipcRenderer.invoke('launcher/hide'),
  launch: (id) => ipcRenderer.invoke('launcher/launch', id),
  launchAdmin: (id) => ipcRenderer.invoke('launcher/launch-admin', id),
  uninstall: (id) => ipcRenderer.invoke('launcher/uninstall', id),
  openLocation: (id) => ipcRenderer.invoke('launcher/open-location', id),
  closeWindow: (hwnd) => ipcRenderer.invoke('launcher/close-window', hwnd),
  endTask: (pid) => ipcRenderer.invoke('launcher/end-task', pid),
  getHotkey: () => ipcRenderer.invoke('launcher/hotkey-get'),
  setHotkey: (hotkey) => ipcRenderer.invoke('launcher/hotkey-set', hotkey),
  defaultHotkey: () => ipcRenderer.invoke('launcher/hotkey-default'),
  onHotkeyChanged: (callback) => {
    ipcRenderer.on('launcher/hotkey-changed', (_, data) => callback(data))
  },
  onIndexChanged: (callback) => {
    ipcRenderer.on('launcher/index-changed', (_, data) => callback(data))
  },
  onShow: (callback) => {
    ipcRenderer.on('launcher/show', (_, data) => callback(data))
  },
  onStartClose: (callback) => {
    ipcRenderer.on('launcher/start-close', () => callback())
  },
  onHide: (callback) => {
    ipcRenderer.on('launcher/hide', () => callback())
  },
})

contextBridge.exposeInMainWorld('setup', {
  status: () => ipcRenderer.invoke('setup/status'),
  install: (options) => ipcRenderer.invoke('setup/install', options),
  skip: () => ipcRenderer.invoke('setup/skip'),
  testOut: () => ipcRenderer.invoke('setup/test-out'),
  relaunch: () => ipcRenderer.invoke('setup/relaunch'),
  restartWindows: () => ipcRenderer.invoke('setup/restart-windows'),
  revertShell: () => ipcRenderer.invoke('setup/revert-shell'),
  uninstall: () => ipcRenderer.invoke('setup/uninstall'),
  onProgress: (callback) => {
    ipcRenderer.on('setup/progress', (_, step) => callback(step))
  },
})

contextBridge.exposeInMainWorld('shell', {
  windows: {
    wallpaper: () => ipcRenderer.invoke('windows/wallpaper'),
    onWallpaperChanged: (callback) => {
      ipcRenderer.on('windows/wallpaper-changed', (_, data) => callback(data))
    },
    setWallpaper: (filePath) => ipcRenderer.invoke('windows/wallpaper-set', filePath),
    pickWallpaper: () => ipcRenderer.invoke('windows/wallpaper-pick'),
    wallpaperPresets: () => ipcRenderer.invoke('windows/wallpaper-presets'),
    wallpaperMine: () => ipcRenderer.invoke('windows/wallpaper-mine'),
    wallpaperMineDelete: (filePath) => ipcRenderer.invoke('windows/wallpaper-mine-delete', filePath),
    openApps: () => ipcRenderer.invoke('windows/open-apps'),
    onOpenAppsChanged: (callback) => {
      ipcRenderer.on('windows/open-apps-changed', (_, data) => callback(data))
    },
    openSettings: () => ipcRenderer.invoke('windows/open-settings'),
    closeSettings: () => ipcRenderer.invoke('windows/close-settings'),
  },
  network: {
    wifiSignal: () => ipcRenderer.invoke('network/wifi-signal'),
    onWifiSignalChanged: (callback) => {
      ipcRenderer.on('network/wifi-signal-changed', (_, data) => callback(data))
    },
    wifiScan: () => ipcRenderer.invoke('network/wifi-scan'),
    wifiNetworks: () => ipcRenderer.invoke('network/wifi-networks'),
    onWifiScanUpdated: (callback) => {
      ipcRenderer.on('network/wifi-scan-updated', (_, data) => callback(data))
    },
    wifiConnect: (ssid, password) => ipcRenderer.invoke('network/wifi-connect', { ssid, password }),
    wifiDisconnect: () => ipcRenderer.invoke('network/wifi-disconnect'),
    wifiRadioGet: () => ipcRenderer.invoke('network/wifi-radio-get'),
    wifiRadioSet: (enabled) => ipcRenderer.invoke('network/wifi-radio-set', enabled),
  },
  system: {
    bluetooth: () => ipcRenderer.invoke('system/bluetooth'),
    onBluetoothChanged: (callback) => {
      ipcRenderer.on('system/bluetooth-changed', (_, data) => callback(data))
    },
    onBluetoothDevicesChanged: (callback) => {
      ipcRenderer.on('system/bluetooth-devices-changed', (_, data) => callback(data))
    },
    bluetoothScan: () => ipcRenderer.invoke('system/bluetooth-scan'),
    bluetoothDevices: () => ipcRenderer.invoke('system/bluetooth-devices'),
    bluetoothToggle: (instanceId, action) => ipcRenderer.invoke('system/bluetooth-toggle', { instanceId, action }),
    bluetoothUnpair: (instanceId) => ipcRenderer.invoke('system/bluetooth-unpair', instanceId),
    bluetoothOpenSettings: () => ipcRenderer.invoke('system/bluetooth-settings'),
    bluetoothSetRadio: (enabled) => ipcRenderer.invoke('system/bluetooth-set-radio', enabled),
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
    subscribePeak: () => ipcRenderer.invoke('system/peak-subscribe'),
    unsubscribePeak: () => ipcRenderer.invoke('system/peak-unsubscribe'),
    onAudioPeak: (callback) => {
      ipcRenderer.on('system/audio-peak', (_, data) => callback(data))
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
    info: () => ipcRenderer.invoke('system/info'),
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
    control: (action) => ipcRenderer.invoke('media/control', action),
    microphone: () => ipcRenderer.invoke('media/microphone'),
    onMicrophoneChanged: (callback) => {
      ipcRenderer.on('media/microphone-changed', (_, data) => callback(data))
    },
  },
  tray: {
    icons: () => ipcRenderer.invoke('tray/icons'),
    onIconsChanged: (callback) => {
      ipcRenderer.on('tray/icons-changed', (_, data) => callback(data))
    },
    click: (id, button, x, y) => ipcRenderer.invoke('tray/click', { id, button, x, y }),
    layout: () => ipcRenderer.invoke('tray/layout-get'),
    setLayout: (layout) => ipcRenderer.invoke('tray/layout-set', layout),
    onLayoutChanged: (callback) => {
      ipcRenderer.on('tray/layout-changed', (_, data) => callback(data))
    },
    display: () => ipcRenderer.invoke('tray/display-get'),
    setDisplay: (showOnAllMonitors) => ipcRenderer.invoke('tray/display-set', showOnAllMonitors),
    onDisplayChanged: (callback) => {
      ipcRenderer.on('tray/display-changed', (_, data) => callback(data))
    },
    settings: () => ipcRenderer.invoke('tray/settings-get'),
    setSettings: (partial) => ipcRenderer.invoke('tray/settings-set', partial),
    onSettingsChanged: (callback) => {
      ipcRenderer.on('tray/settings-changed', (_, data) => callback(data))
    },
  },
})