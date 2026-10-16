const PNG_BASE64 = 'iVBORw0KGgo='

export function ridgePluginRecord(overrides: Partial<PluginRecord> = {}): PluginRecord {
  return {
    id: 'com.example.weather',
    name: 'Weather',
    version: '1.0.0',
    apiVersion: 1,
    renderer: 'index.js',
    main: null,
    hasBackend: false,
    icon: null,
    description: null,
    author: null,
    homepage: null,
    repository: null,
    license: null,
    engines: null,
    contributes: {},
    marketplace: null,
    preset: false,
    verified: false,
    compat: { apiOk: true, engineOk: true, reason: null },
    valid: true,
    errors: [],
    enabled: true,
    loadable: true,
    ...overrides,
  }
}

export function ridgeTrayIcon(id: string): TrayIcon {
  return { id, hWnd: 1, uID: 1, guid: null, tooltip: id, icon: `data:image/png;base64,${id}`, version: 4 }
}

export function ridgePluginWidget(slot: RidgePluginSlot, pluginName: string): RidgePluginWidget {
  const pluginId = `com.example.${pluginName.toLowerCase()}`
  return { id: `${pluginId}:default`, pluginId, pluginName, pluginIcon: null, pluginSettings: [], slot, order: 0 }
}

export function liveRidgePreviewData(): RidgePreviewData {
  return {
    color: { r: 12, g: 40, b: 64, darkText: false },
    clock: {
      now: new Date(2026, 8, 12, 21, 41),
      prefs: { timeFormat: '24h', systemTimeFormat: '12h', calendarDays: 1, showTasks: true },
    },
    status: {
      battery: { percent: 64, charging: false, onAcPower: false, hasBattery: true },
      bluetooth: {
        radio: { state: 'on', pending: null, error: null },
        devices: [
          {
            id: 'headphones',
            name: 'Headphones',
            connected: true,
            canConnect: false,
            canDisconnect: true,
            audioDisabled: false,
            pending: null,
            error: null,
          },
        ],
        devicesAvailable: true,
      },
      network: { signal: 80, connected: true, type: 'wifi', ssid: 'Home' },
    },
    media: {
      playback: {
        title: 'Blue in Green',
        artist: 'Miles Davis',
        appName: 'Spotify',
        appIcon: PNG_BASE64,
        playing: true,
        thumbnail: null,
        thumbnailType: null,
      },
      showVisualizer: false,
    },
    microphone: { active: true, apps: ['Zoom', 'Teams'] },
    desktops: { count: 2, current: 0 },
    tray: {
      visible: [ridgeTrayIcon('dropbox'), ridgeTrayIcon('onedrive')],
      overflow: [ridgeTrayIcon('steam')],
      showOverflow: true,
    },
    plugins: { left: [ridgePluginWidget('left', 'Weather')], right: [ridgePluginWidget('right', 'Notes')] },
  }
}

export function absentRidgePreviewData(): RidgePreviewData {
  const live = liveRidgePreviewData()
  return {
    ...live,
    media: { ...live.media, playback: { ...live.media.playback, title: null, appIcon: null, playing: false } },
    microphone: { active: false, apps: [] },
    tray: { visible: [], overflow: [], showOverflow: true },
    plugins: { left: [], right: [] },
  }
}
