const { contextBridge, ipcRenderer } = require('electron')

let bootWallpaper = null
let bootBluetooth = null
let bootWifi = null
let bootSettingsIcon = null
let bootSettingsPage = null
let bootClockPrefs = null
try { bootWallpaper = ipcRenderer.sendSync('windows/wallpaper-init') } catch {}
try { bootBluetooth = ipcRenderer.sendSync('system/bluetooth-init') } catch {}
try { bootWifi = ipcRenderer.sendSync('network/wifi-init') } catch {}
try { bootSettingsIcon = ipcRenderer.sendSync('windows/settings-icon') } catch {}
try { bootSettingsPage = ipcRenderer.sendSync('windows/settings-init') } catch {}
try { bootClockPrefs = ipcRenderer.sendSync('clock/prefs-init') } catch {}

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

function paintDesktopBackgroundEarly() {
  if (new URLSearchParams(window.location.search).get('mode') !== 'desktop') return
  const apply = () => {
    const el = document.documentElement
    if (!el) return
    el.style.backgroundColor = '#1a1a2e'
    if (bootWallpaper) {
      el.style.backgroundImage = `url("${bootWallpaper}")`
      el.style.backgroundSize = 'cover'
      el.style.backgroundPosition = 'center'
    }
  }
  apply()
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply, { once: true })
  }
}
try { paintDesktopBackgroundEarly() } catch {}

contextBridge.exposeInMainWorld('topbar', {
  setActiveRegion: (region) => ipcRenderer.send('topbar/set-active-region', region),
  color: () => ipcRenderer.invoke('topbar/color'),
  onColorChanged: (callback) => {
    const handler = (_, data) => callback(data)
    ipcRenderer.on('topbar/color-changed', handler)
    return () => ipcRenderer.removeListener('topbar/color-changed', handler)
  },
  foregroundColor: () => ipcRenderer.invoke('topbar/fg-color'),
  onForegroundColorChanged: (callback) => {
    const handler = (_, data) => callback(data)
    ipcRenderer.on('topbar/fg-color-changed', handler)
    return () => ipcRenderer.removeListener('topbar/fg-color-changed', handler)
  },
  colorOverride: () => ipcRenderer.invoke('topbar/color-override-get'),
  setColorOverride: (color) => ipcRenderer.invoke('topbar/color-override-set', color),
  colorPalette: () => ipcRenderer.invoke('topbar/color-palette'),
  searchIcon: () => ipcRenderer.invoke('topbar/search-icon-get'),
  setSearchIcon: (value) => ipcRenderer.invoke('topbar/search-icon-set', value),
  onSearchIconChanged: (callback) => {
    const handler = (_, data) => callback(data)
    ipcRenderer.on('topbar/search-icon-changed', handler)
    return () => ipcRenderer.removeListener('topbar/search-icon-changed', handler)
  },
  mediaVisualizer: () => ipcRenderer.invoke('topbar/media-visualizer-get'),
  setMediaVisualizer: (value) => ipcRenderer.invoke('topbar/media-visualizer-set', value),
  onMediaVisualizerChanged: (callback) => {
    const handler = (_, data) => callback(data)
    ipcRenderer.on('topbar/media-visualizer-changed', handler)
    return () => ipcRenderer.removeListener('topbar/media-visualizer-changed', handler)
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
  insertText: (text) => ipcRenderer.invoke('launcher/insert-text', text),
  recentEmoji: () => ipcRenderer.invoke('emoji/recents-get'),
  addRecentEmoji: (char) => ipcRenderer.invoke('emoji/recents-add', char),
  onEmojiKey: (callback) => {
    const handler = (_, message) => callback(message)
    ipcRenderer.on('emoji/key', handler)
    return () => ipcRenderer.removeListener('emoji/key', handler)
  },
  getHotkey: () => ipcRenderer.invoke('launcher/hotkey-get'),
  setHotkey: (hotkey) => ipcRenderer.invoke('launcher/hotkey-set', hotkey),
  defaultHotkey: () => ipcRenderer.invoke('launcher/hotkey-default'),
  onHotkeyChanged: (callback) => {
    ipcRenderer.on('launcher/hotkey-changed', (_, data) => callback(data))
  },
  onShow: (callback) => {
    ipcRenderer.on('launcher/show', (_, data) => callback(data))
  },
  onStartClose: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('launcher/start-close', handler)
    return () => ipcRenderer.removeListener('launcher/start-close', handler)
  },
  onHide: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('launcher/hide', handler)
    return () => ipcRenderer.removeListener('launcher/hide', handler)
  },
  scores: () => ipcRenderer.invoke('frecency/scores'),
  onScoresChanged: (callback) => {
    const handler = (_, data) => callback(data)
    ipcRenderer.on('frecency/changed', handler)
    return () => ipcRenderer.removeListener('frecency/changed', handler)
  },
  recentApps: () => ipcRenderer.invoke('launcher/recent-apps-get'),
  setRecentApps: (value) => ipcRenderer.invoke('launcher/recent-apps-set', value),
  onRecentAppsChanged: (callback) => {
    const handler = (_, data) => callback(data)
    ipcRenderer.on('launcher/recent-apps-changed', handler)
    return () => ipcRenderer.removeListener('launcher/recent-apps-changed', handler)
  },
  maxResults: () => ipcRenderer.invoke('launcher/max-results-get'),
  setMaxResults: (value) => ipcRenderer.invoke('launcher/max-results-set', value),
  onMaxResultsChanged: (callback) => {
    const handler = (_, data) => callback(data)
    ipcRenderer.on('launcher/max-results-changed', handler)
    return () => ipcRenderer.removeListener('launcher/max-results-changed', handler)
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
  setShell: () => ipcRenderer.invoke('setup/set-shell'),
  uninstall: () => ipcRenderer.invoke('setup/uninstall'),
  onProgress: (callback) => {
    ipcRenderer.on('setup/progress', (_, step) => callback(step))
  },
})

contextBridge.exposeInMainWorld('shell', {
  settingsIcon: bootSettingsIcon,
  windows: {
    wallpaper: () => ipcRenderer.invoke('windows/wallpaper'),
    onWallpaperChanged: (callback) => {
      const handler = (_, data) => callback(data)
      ipcRenderer.on('windows/wallpaper-changed', handler)
      return () => ipcRenderer.removeListener('windows/wallpaper-changed', handler)
    },
    setWallpaper: (filePath) => ipcRenderer.invoke('windows/wallpaper-set', filePath),
    pickWallpaper: () => ipcRenderer.invoke('windows/wallpaper-pick'),
    wallpaperPresets: () => ipcRenderer.invoke('windows/wallpaper-presets'),
    wallpaperMine: () => ipcRenderer.invoke('windows/wallpaper-mine'),
    wallpaperMineDelete: (filePath) => ipcRenderer.invoke('windows/wallpaper-mine-delete', filePath),
    openApps: () => ipcRenderer.invoke('windows/open-apps'),
    onOpenAppsChanged: (callback) => {
      const handler = (_, data) => callback(data)
      ipcRenderer.on('windows/open-apps-changed', handler)
      return () => ipcRenderer.removeListener('windows/open-apps-changed', handler)
    },
    openSettings: (page) => ipcRenderer.invoke('windows/open-settings', page),
    closeSettings: () => ipcRenderer.invoke('windows/close-settings'),
    setSettingsPage: (name) => ipcRenderer.invoke('windows/set-settings-page', name),
    initialPage: bootSettingsPage,
    onSettingsNavigate: (callback) => {
      const handler = (_, page) => callback(page)
      ipcRenderer.on('windows/settings-navigate', handler)
      return () => ipcRenderer.removeListener('windows/settings-navigate', handler)
    },
  },
  network: {
    wifiSignal: () => ipcRenderer.invoke('network/wifi-signal'),
    onWifiSignalChanged: (callback) => {
      ipcRenderer.on('network/wifi-signal-changed', (_, data) => callback(data))
    },
    wifiScan: () => ipcRenderer.invoke('network/wifi-scan'),
    wifiNetworks: () => ipcRenderer.invoke('network/wifi-networks'),
    onWifiScanUpdated: (callback) => {
      const handler = (_, data) => callback(data)
      ipcRenderer.on('network/wifi-scan-updated', handler)
      return () => ipcRenderer.removeListener('network/wifi-scan-updated', handler)
    },
    wifiConnect: (ssid, password) => ipcRenderer.invoke('network/wifi-connect', { ssid, password }),
    wifiDisconnect: () => ipcRenderer.invoke('network/wifi-disconnect'),
    wifiRadioGet: () => ipcRenderer.invoke('network/wifi-radio-get'),
    wifiRadioSet: (enabled) => ipcRenderer.invoke('network/wifi-radio-set', enabled),
  },
  system: {
    bluetooth: () => ipcRenderer.invoke('system/bluetooth'),
    onBluetoothChanged: (callback) => {
      const handler = (_, data) => callback(data)
      ipcRenderer.on('system/bluetooth-changed', handler)
      return () => ipcRenderer.removeListener('system/bluetooth-changed', handler)
    },
    onBluetoothDevicesChanged: (callback) => {
      const handler = (_, data) => callback(data)
      ipcRenderer.on('system/bluetooth-devices-changed', handler)
      return () => ipcRenderer.removeListener('system/bluetooth-devices-changed', handler)
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
      const handler = (_, data) => callback(data)
      ipcRenderer.on('system/volume-changed', handler)
      return () => ipcRenderer.removeListener('system/volume-changed', handler)
    },
    mute: () => ipcRenderer.invoke('system/mute-get'),
    setMute: (muted) => ipcRenderer.invoke('system/mute-set', muted),
    onMuteChanged: (callback) => {
      const handler = (_, data) => callback(data)
      ipcRenderer.on('system/mute-changed', handler)
      return () => ipcRenderer.removeListener('system/mute-changed', handler)
    },
    subscribePeak: () => ipcRenderer.invoke('system/peak-subscribe'),
    unsubscribePeak: () => ipcRenderer.invoke('system/peak-unsubscribe'),
    onAudioPeak: (callback) => {
      const handler = (_, data) => callback(data)
      ipcRenderer.on('system/audio-peak', handler)
      return () => ipcRenderer.removeListener('system/audio-peak', handler)
    },
    brightness: () => ipcRenderer.invoke('system/brightness-get'),
    setBrightness: (value) => ipcRenderer.invoke('system/brightness-set', value),
    onBrightnessChanged: (callback) => {
      ipcRenderer.on('system/brightness-changed', (_, data) => callback(data))
    },
    getMonitors: () => ipcRenderer.invoke('system/monitors-get'),
    setMonitorBrightness: (id, value) => ipcRenderer.invoke('system/monitor-brightness-set', { id, value }),
    onMonitorsChanged: (callback) => {
      const handler = (_, data) => callback(data)
      ipcRenderer.on('system/monitors-changed', handler)
      return () => ipcRenderer.removeListener('system/monitors-changed', handler)
    },
    powerAction: (action) => ipcRenderer.invoke('system/power-action', action),
    info: () => ipcRenderer.invoke('system/info'),
    battery: () => ipcRenderer.invoke('system/battery'),
    onBatteryChanged: (callback) => {
      const handler = (_, data) => callback(data)
      ipcRenderer.on('system/battery-changed', handler)
      return () => ipcRenderer.removeListener('system/battery-changed', handler)
    },
  },
  media: {
    session: () => ipcRenderer.invoke('media/session'),
    onSessionChanged: (callback) => {
      const handler = (_, data) => callback(data)
      ipcRenderer.on('media/session-changed', handler)
      return () => ipcRenderer.removeListener('media/session-changed', handler)
    },
    control: (action) => ipcRenderer.invoke('media/control', action),
    microphone: () => ipcRenderer.invoke('media/microphone'),
    onMicrophoneChanged: (callback) => {
      const handler = (_, data) => callback(data)
      ipcRenderer.on('media/microphone-changed', handler)
      return () => ipcRenderer.removeListener('media/microphone-changed', handler)
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
  run: {
    resolve: (query) => ipcRenderer.invoke('run/resolve', query),
    exec: (query) => ipcRenderer.invoke('run/exec', query),
    execTerminal: (query) => ipcRenderer.invoke('run/exec-terminal', query),
  },
  apps: {
    startup: () => ipcRenderer.invoke('apps/startup-list'),
    onStartupChanged: (callback) => {
      const handler = (_, data) => callback(data)
      ipcRenderer.on('apps/startup-changed', handler)
      return () => ipcRenderer.removeListener('apps/startup-changed', handler)
    },
    setStartup: (id, enabled) => ipcRenderer.invoke('apps/startup-set', { id, enabled }),
    clearPending: (id) => ipcRenderer.invoke('apps/startup-clear-pending', { id }),
    removeStartup: (id) => ipcRenderer.invoke('apps/startup-remove', { id }),
    applySystemChanges: () => ipcRenderer.invoke('apps/startup-apply-system'),
    history: () => ipcRenderer.invoke('apps/startup-history'),
    onStartupHistoryChanged: (callback) => {
      ipcRenderer.on('apps/startup-history-changed', (_, data) => callback(data))
    },
    undo: (seq) => ipcRenderer.invoke('apps/startup-undo', { seq }),
    running: () => ipcRenderer.invoke('apps/running-list'),
    endTask: (pids) => ipcRenderer.invoke('apps/end-task', pids),
    openLocation: (target) => ipcRenderer.invoke('apps/open-location', target),
    installed: () => ipcRenderer.invoke('apps/installed-list'),
    onInstalledChanged: (callback) => {
      ipcRenderer.on('apps/installed-changed', (_, data) => callback(data))
    },
    uninstall: (id) => ipcRenderer.invoke('apps/installed-uninstall', { id }),
    openApp: (id) => ipcRenderer.invoke('apps/installed-open', { id }),
    openAppLocation: (id) => ipcRenderer.invoke('apps/installed-open-location', { id }),
    catalog: () => ipcRenderer.invoke('apps/catalog'),
    onCatalogChanged: (callback) => {
      const handler = (_, data) => callback(data)
      ipcRenderer.on('apps/catalog-changed', handler)
      return () => ipcRenderer.removeListener('apps/catalog-changed', handler)
    },
    launch: (id) => ipcRenderer.invoke('apps/launch', id),
    launchAdmin: (id) => ipcRenderer.invoke('apps/launch-admin', id),
    windowCommand: (action) => ipcRenderer.invoke('apps/window-command', action),
    launchableOpenLocation: (id) => ipcRenderer.invoke('apps/app-open-location', id),
    launchableUninstall: (id) => ipcRenderer.invoke('apps/app-uninstall', id),
  },
  updates: {
    getState: () => ipcRenderer.invoke('updates/get-state'),
    getLog: () => ipcRenderer.invoke('updates/get-log'),
    check: () => ipcRenderer.invoke('updates/check'),
    download: () => ipcRenderer.invoke('updates/download'),
    install: () => ipcRenderer.invoke('updates/install'),
    onStateChanged: (callback) => {
      ipcRenderer.on('updates/state-changed', (_, data) => callback(data))
    },
    onLogChanged: (callback) => {
      ipcRenderer.on('updates/log-changed', (_, data) => callback(data))
    },
  },
  windowsUpdate: {
    getState: () => ipcRenderer.invoke('windows-update/get-state'),
    check: () => ipcRenderer.invoke('windows-update/check'),
    install: (updateId) => ipcRenderer.invoke('windows-update/install', { updateId }),
    openWindowsUpdate: () => ipcRenderer.invoke('windows-update/open-windows-update'),
    onStateChanged: (callback) => {
      ipcRenderer.on('windows-update/state-changed', (_, data) => callback(data))
    },
  },
  tiling: {
    config: () => ipcRenderer.invoke('tiling/config-get'),
    setConfig: (partial) => ipcRenderer.invoke('tiling/config-set', partial),
    onConfigChanged: (callback) => {
      const handler = (_, data) => callback(data)
      ipcRenderer.on('tiling/config-changed', handler)
      return () => ipcRenderer.removeListener('tiling/config-changed', handler)
    },
    snap: (direction) => ipcRenderer.invoke('tiling/snap', direction),
  },
  clock: {
    prefs: () => ipcRenderer.invoke('clock/prefs-get'),
    setPrefs: (partial) => ipcRenderer.invoke('clock/prefs-set', partial),
    onPrefsChanged: (callback) => {
      const handler = (_, data) => callback(data)
      ipcRenderer.on('clock/prefs-changed', handler)
      return () => ipcRenderer.removeListener('clock/prefs-changed', handler)
    },
    initial: bootClockPrefs,
  },
  calendar: {
    state: () => ipcRenderer.invoke('calendar/state-get'),
    onStateChanged: (callback) => {
      const handler = (_, data) => callback(data)
      ipcRenderer.on('calendar/state-changed', handler)
      return () => ipcRenderer.removeListener('calendar/state-changed', handler)
    },
    connect: () => ipcRenderer.invoke('calendar/connect'),
    disconnect: () => ipcRenderer.invoke('calendar/disconnect'),
    setCredentials: (clientId, clientSecret) => ipcRenderer.invoke('calendar/set-credentials', { clientId, clientSecret }),
    data: () => ipcRenderer.invoke('calendar/data-get'),
    onDataChanged: (callback) => {
      const handler = (_, data) => callback(data)
      ipcRenderer.on('calendar/data-changed', handler)
      return () => ipcRenderer.removeListener('calendar/data-changed', handler)
    },
    refresh: (range) => ipcRenderer.invoke('calendar/refresh', range),
  },
})