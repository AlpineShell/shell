export {}

interface OpenApp {
  id: number
  hwnd: number
  name: string
  title: string
  path: string
  icon: string
}

interface StartupEntry {
  id: string
  name: string
  friendlyName: string
  blurb: string | null
  category: 'app' | 'system' | 'unknown'
  locked: boolean
  command: string
  target: string | null
  icon: string | null
  source: 'registry' | 'folder' | 'task' | 'msix'
  sourceLabel: string
  scope: 'user' | 'system'
  enabled: boolean
  pending: 'enable' | 'disable' | null
  running: boolean
  location: string
  missing: boolean
}

interface RunningApp {
  name: string
  friendlyName: string
  category: 'app' | 'system' | 'unknown'
  band: 'light' | 'moderate' | 'heavy'
  path: string | null
  icon: string | null
  memory: number
  cpu: number
  count: number
  pids: number[]
  hasWindow: boolean
}

interface StartupHistoryEntry {
  seq: number
  id: string
  name: string
  from: boolean
  to: boolean
  scope: 'user' | 'system'
}

interface InstalledApp {
  id: string
  name: string
  publisher: string | null
  version: string | null
  icon: string | null
  source: 'desktop' | 'store'
  isComponent: boolean
  startupId: string | null
  canUninstall: boolean
  canOpen: boolean
  canOpenLocation: boolean
}

interface NetworkStatus {
  signal: number | null
  connected: boolean
  type: 'wifi' | 'ethernet'
  ssid: string | null
}

interface BluetoothState {
  enabled: boolean
  connected: boolean
  devices: string[]
}

interface TopBarColor {
  r: number
  g: number
  b: number
  darkText: boolean
}

interface ForegroundColorData extends TopBarColor {
  displayId: number
}

type ForegroundColorBroadcast = ForegroundColorData | { displayId: number }

declare global {
  type UpdateStatus = 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'

  interface UpdateState {
    status: UpdateStatus
    currentVersion: string
    availableVersion: string | null
    progressPercent: number
    error: string | null
  }

  interface UpdateLogEntry {
    time: number
    level: 'info' | 'error'
    message: string
  }

  type WindowsUpdateStatus = 'idle' | 'checking' | 'available' | 'up-to-date' | 'downloading' | 'installing' | 'restart-required' | 'installed' | 'error'

  type WindowsUpdateTier = 'quality' | 'enablement' | 'feature'

  interface WindowsUpdateItem {
    title: string
    kb: string | null
    sizeBytes: number
    updateId: string
    isFeatureUpdate: boolean
    tier: WindowsUpdateTier
  }

  interface WindowsUpdateState {
    status: WindowsUpdateStatus
    updates: WindowsUpdateItem[]
    lastCheckedAt: number | null
    rebootRequired: boolean
    progressPercent: number
    progressLabel: string | null
    installingId: string | null
    error: string | null
  }

  interface WifiNetwork {
    ssid: string
    signal: number
    security: string
    connected: boolean
  }

  interface BluetoothDevice {
    name: string
    instanceId: string
    connected: boolean
    paired: boolean
  }

  interface MediaPlayback {
    title: string | null
    artist: string | null
    appName: string | null
    appIcon: string | null
    playing: boolean
    thumbnail: string | null
    thumbnailType: string | null
  }

  interface MicrophoneStatus {
    active: boolean
    apps: string[]
  }

  interface AltTabWindow {
    hwnd: number
    title: string
    processName: string
    icon: string
    thumbnail: string
  }

  interface AltTabShowPayload {
    windows: AltTabWindow[]
    selectedIndex: number
  }

  interface ScreenshotShowPayload {
    image: string
    width: number
    height: number
  }
  interface BatteryStatus {
    percent: number | null
    charging: boolean
    hasBattery: boolean
  }

  interface MonitorInfo {
    id: string
    name: string
    type: 'internal' | 'external'
    brightness: number
  }

  interface DiskInfo {
    letter: string
    label: string
    total: number
    used: number
    free: number
  }

  interface SystemInfo {
    computerName: string
    user: string
    os: { name: string; version: string; build: string }
    disks: DiskInfo[]
    cpu: { name: string; cores: number; threads: number }
    gpu: { name: string }
    memory: { total: number; used: number; free: number }
    uptime: number
  }

  interface SetupOptions {
    shell: boolean
    cursor: boolean
  }

  interface SetupResult {
    shell: boolean
    startup: boolean
    cursor: boolean
    gpoBlocked: boolean
    error: string | null
  }

  interface SetupStatus {
    isShell: boolean
    hasStartup: boolean
    hasCursor: boolean
    gpoBlocked: boolean
    isInstalled: boolean
    installedVersion: string | null
    currentVersion: string
    isFirstRun: boolean
  }

  interface LauncherItem {
    id: number
    name: string
    lnkPath: string | null
    target: string
    icon: string | null
    appId?: string
  }

  interface RunResult {
    kind: "folder" | "file" | "url" | "shell" | "command"
    label: string
    display: string
    runInTerminal: boolean
  }

  interface TrayIcon {
    id: string
    hWnd: number
    uID: number
    guid: string | null
    tooltip: string
    icon: string
    version: number
  }

  interface TrayLayout {
    order: string[]
    hidden: string[]
  }

  interface TrayDisplaySetting {
    showOnAllMonitors: boolean
    primaryDisplayId: number
  }

  interface TraySettings {
    enabled: boolean
    showOverflow: boolean
  }

  type TilingMode = 'snap' | 'dynamic'
  type TilingDynamicLayout = 'bsp' | 'columns' | 'master-stack'

  interface TilingRatios {
    'master-stack'?: Record<string, { master: number; stack?: number[] }>
    columns?: Record<string, { widths: number[] }>
    bsp?: Record<string, { nodes: Record<string, number> }>
  }

  interface TilingConfig {
    enabled: boolean
    mode: TilingMode
    gap: number
    margin: number
    hotkeys: boolean
    dragToZone: boolean
    dynamicLayout: TilingDynamicLayout
    ratios: TilingRatios
    handleOversized: boolean
    centerOversized: boolean
  }

  type NotificationSource = 'alpine' | 'os' | 'user'
  type NotificationPosition = 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-right'

  interface NotificationAction {
    id: string
    label: string
    openPath?: string
    url?: string
  }

  interface AppNotification {
    id: number
    source: NotificationSource
    appName: string
    title: string
    body: string
    icon: string | null
    timestamp: number
    read: boolean
    actions: NotificationAction[]
    osId?: number
  }

  interface NotificationInput {
    source?: NotificationSource
    appName?: string
    title?: string
    body?: string
    icon?: string | null
    actions?: NotificationAction[]
    osId?: number
    onAction?: (actionId: string) => void
  }

  interface NotificationsConfig {
    enabled: boolean
    doNotDisturb: boolean
    position: NotificationPosition
    defaultDuration: number
    maxHistory: number
    groupBySource: boolean
  }

  interface NotificationState {
    items: AppNotification[]
    unreadCount: number
    config: NotificationsConfig
  }

  interface Window {
    setup: {
      status: () => Promise<SetupStatus>
      install: (options: SetupOptions) => Promise<SetupResult>
      skip: () => Promise<void>
      testOut: () => Promise<void>
      relaunch: () => Promise<void>
      restartWindows: () => Promise<void>
      revertShell: () => Promise<{ success: boolean }>
      setShell: () => Promise<{ success: boolean }>
      uninstall: () => Promise<{ success: boolean }>
      onProgress: (callback: (step: string) => void) => void
    }
    launcher: {
      index: () => Promise<LauncherItem[]>
      show: () => Promise<void>
      hide: () => Promise<void>
      launch: (id: number) => Promise<{ success: boolean }>
      launchAdmin: (id: number) => Promise<{ success: boolean }>
      uninstall: (id: number) => Promise<{ ok: boolean; mode: 'store' | 'desktop' | 'settings' | 'none' }>
      openLocation: (id: number) => Promise<{ success: boolean }>
      closeWindow: (hwnd: number) => Promise<{ success: boolean }>
      endTask: (pid: number) => Promise<{ success: boolean }>
      getHotkey: () => Promise<string>
      setHotkey: (hotkey: string) => Promise<string>
      defaultHotkey: () => Promise<string>
      onHotkeyChanged: (callback: (hotkey: string) => void) => void
      onIndexChanged: (callback: (data: LauncherItem[]) => void) => void
      onShow: (callback: (data: { displayId: number }) => void) => void
      onStartClose: (callback: () => void) => () => void
      onHide: (callback: () => void) => () => void
    }
    screenshot: {
      onShow: (callback: (data: ScreenshotShowPayload) => void) => void
      onHide: (callback: () => void) => void
      regionSelected: (region: { x: number; y: number; width: number; height: number }) => Promise<void>
      cancel: () => Promise<void>
    }
    alttab: {
      onShow: (callback: (data: AltTabShowPayload) => void) => void
      onHide: (callback: () => void) => void
      onSelectionChanged: (callback: (index: number) => void) => void
      activate: (hwnd: number) => Promise<void>
    }
    topbar: {
      setIgnoreMouseEvents: (ignore: boolean) => void
      setActiveRegion: (region: { top: number; bottom: number; left: number; right: number } | null) => void
      setToastRegion: (region: { top: number; bottom: number; left: number; right: number } | null) => void
      color: () => Promise<TopBarColor | null>
      onColorChanged: (callback: (color: TopBarColor) => void) => void
      colorOverride: () => Promise<TopBarColor | null>
      setColorOverride: (color: { r: number; g: number; b: number } | null) => Promise<TopBarColor | null>
      colorPalette: () => Promise<TopBarColor[]>
      searchIcon: () => Promise<boolean>
      setSearchIcon: (value: boolean) => Promise<boolean>
      onSearchIconChanged: (callback: (visible: boolean) => void) => void
      mediaVisualizer: () => Promise<boolean>
      setMediaVisualizer: (value: boolean) => Promise<boolean>
      onMediaVisualizerChanged: (callback: (value: boolean) => void) => void
      foregroundColor: () => Promise<ForegroundColorData[]>
      onForegroundColorChanged: (callback: (data: ForegroundColorBroadcast) => void) => void
      onCloseMenus: (callback: () => void) => () => void
    }
    shell: {
      settingsIcon: string
      windows: {
        wallpaper: () => Promise<string | null>
        onWallpaperChanged: (callback: (data: string | null) => void) => void
        setWallpaper: (filePath: string) => Promise<boolean>
        pickWallpaper: () => Promise<string | null>
        wallpaperPresets: () => Promise<{ name: string; path: string; thumbnail: string; url: string }[]>
        wallpaperMine: () => Promise<{ name: string; path: string; thumbnail: string; url: string; addedAt: number }[]>
        wallpaperMineDelete: (filePath: string) => Promise<boolean>
        openApps: () => Promise<OpenApp[]>
        onOpenAppsChanged: (callback: (data: OpenApp[]) => void) => () => void
        openSettings: () => Promise<void>
        closeSettings: () => Promise<void>
        setSettingsPage: (name: string) => Promise<void>
      }
      run: {
        resolve: (query: string) => Promise<RunResult | null>
        exec: (query: string) => Promise<{ ok: boolean }>
        execTerminal: (query: string) => Promise<{ ok: boolean }>
      }
      apps: {
        startup: () => Promise<StartupEntry[]>
        onStartupChanged: (callback: (data: StartupEntry[]) => void) => void
        setStartup: (id: string, enabled: boolean) => Promise<StartupEntry[]>
        clearPending: (id: string) => Promise<StartupEntry[]>
        removeStartup: (id: string) => Promise<{ ok: boolean; error?: string }>
        applySystemChanges: () => Promise<{ ok: boolean; error?: string }>
        history: () => Promise<StartupHistoryEntry[]>
        onStartupHistoryChanged: (callback: (data: StartupHistoryEntry[]) => void) => void
        undo: (seq: number) => Promise<StartupEntry[]>
        running: () => Promise<RunningApp[]>
        endTask: (pids: number[]) => Promise<{ ok: boolean }>
        openLocation: (target: string) => Promise<{ ok: boolean }>
        installed: () => Promise<InstalledApp[]>
        onInstalledChanged: (callback: (data: InstalledApp[]) => void) => void
        uninstall: (id: string) => Promise<{ ok: boolean; error?: string }>
        openApp: (id: string) => Promise<{ ok: boolean }>
        openAppLocation: (id: string) => Promise<{ ok: boolean }>
        catalog: () => Promise<LauncherItem[]>
        onCatalogChanged: (callback: (data: LauncherItem[]) => void) => () => void
        launch: (id: number) => Promise<{ success: boolean }>
        launchAdmin: (id: number) => Promise<{ success: boolean }>
        windowCommand: (action: 'minimize' | 'maximize' | 'close') => Promise<{ ok: boolean }>
        launchableOpenLocation: (id: number) => Promise<{ success: boolean }>
        launchableUninstall: (id: number) => Promise<{ success: boolean }>
      }
      network: {
        wifiSignal: () => Promise<NetworkStatus>
        onWifiSignalChanged: (callback: (data: NetworkStatus) => void) => void
        wifiScan: () => Promise<WifiNetwork[] | null>
        wifiNetworks: () => Promise<WifiNetwork[]>
        onWifiScanUpdated: (callback: (data: WifiNetwork[]) => void) => void
        wifiConnect: (ssid: string, password?: string) => Promise<{ success: boolean; needsPassword?: boolean }>
        wifiDisconnect: () => Promise<{ success: boolean }>
        wifiRadioGet: () => Promise<{ success: boolean; state: string }>
        wifiRadioSet: (enabled: boolean) => Promise<{ success: boolean; state: string }>
      }
      system: {
        bluetooth: () => Promise<BluetoothState>
        onBluetoothChanged: (callback: (data: BluetoothState) => void) => void
        onBluetoothDevicesChanged: (callback: (data: BluetoothDevice[]) => void) => void
        bluetoothScan: () => Promise<BluetoothDevice[]>
        bluetoothDevices: () => Promise<BluetoothDevice[]>
        bluetoothToggle: (instanceId: string, action: 'connect' | 'disconnect') => Promise<{ success: boolean }>
        bluetoothUnpair: (instanceId: string) => Promise<{ success: boolean }>
        bluetoothOpenSettings: () => Promise<void>
        bluetoothSetRadio: (enabled: boolean) => Promise<{ success: boolean; state: string }>
        volume: () => Promise<number>
        setVolume: (value: number) => Promise<number>
        onVolumeChanged: (callback: (data: number) => void) => void
        mute: () => Promise<boolean>
        setMute: (muted: boolean) => Promise<boolean>
        onMuteChanged: (callback: (data: boolean) => void) => void
        subscribePeak: () => Promise<boolean>
        unsubscribePeak: () => Promise<boolean>
        onAudioPeak: (callback: (peak: number) => void) => void
        brightness: () => Promise<number>
        setBrightness: (value: number) => Promise<number>
        onBrightnessChanged: (callback: (data: number) => void) => void
        getMonitors: () => Promise<MonitorInfo[]>
        setMonitorBrightness: (id: string, value: number) => Promise<number>
        onMonitorsChanged: (callback: (data: MonitorInfo[]) => void) => void
        powerAction: (action: 'shutdown' | 'restart' | 'logout') => Promise<void>
        info: () => Promise<SystemInfo>
        battery: () => Promise<BatteryStatus>
        onBatteryChanged: (callback: (data: BatteryStatus) => void) => void
      }
      media: {
        session: () => Promise<MediaPlayback>
        onSessionChanged: (callback: (data: MediaPlayback) => void) => void
        control: (action: 'play' | 'pause' | 'toggle' | 'next' | 'previous') => Promise<{ success: boolean }>
        microphone: () => Promise<MicrophoneStatus>
        onMicrophoneChanged: (callback: (data: MicrophoneStatus) => void) => void
      }
      tray: {
        icons: () => Promise<TrayIcon[]>
        onIconsChanged: (callback: (data: TrayIcon[]) => void) => void
        click: (id: string, button: 'left' | 'right', x: number, y: number) => Promise<void>
        layout: () => Promise<TrayLayout>
        setLayout: (layout: TrayLayout) => Promise<TrayLayout>
        onLayoutChanged: (callback: (data: TrayLayout) => void) => void
        display: () => Promise<TrayDisplaySetting>
        setDisplay: (showOnAllMonitors: boolean) => Promise<TrayDisplaySetting>
        onDisplayChanged: (callback: (data: TrayDisplaySetting) => void) => void
        settings: () => Promise<TraySettings>
        setSettings: (partial: Partial<TraySettings>) => Promise<TraySettings>
        onSettingsChanged: (callback: (data: TraySettings) => void) => void
      }
      updates: {
        getState: () => Promise<UpdateState>
        getLog: () => Promise<UpdateLogEntry[]>
        check: () => Promise<UpdateState>
        download: () => Promise<void>
        install: () => Promise<void>
        onStateChanged: (callback: (state: UpdateState) => void) => void
        onLogChanged: (callback: (entries: UpdateLogEntry[]) => void) => void
      }
      windowsUpdate: {
        getState: () => Promise<WindowsUpdateState>
        check: () => Promise<WindowsUpdateState>
        install: (updateId?: string) => Promise<WindowsUpdateState>
        openWindowsUpdate: () => Promise<{ ok: boolean }>
        onStateChanged: (callback: (state: WindowsUpdateState) => void) => void
      }
      tiling: {
        config: () => Promise<TilingConfig>
        setConfig: (partial: Partial<TilingConfig>) => Promise<TilingConfig>
        onConfigChanged: (callback: (config: TilingConfig) => void) => void
        snap: (direction: 'left' | 'right' | 'up' | 'down') => Promise<boolean>
      }
      notifications: {
        getState: () => Promise<NotificationState>
        emit: (notif: NotificationInput) => Promise<AppNotification | null>
        dismiss: (id: number) => Promise<NotificationState>
        clearAll: () => Promise<NotificationState>
        markAllRead: () => Promise<NotificationState>
        runAction: (id: number, actionId: string) => Promise<NotificationState>
        getConfig: () => Promise<NotificationsConfig>
        setConfig: (partial: Partial<NotificationsConfig>) => Promise<NotificationsConfig>
        setDnd: (value: boolean) => Promise<NotificationsConfig>
        onPosted: (callback: (notif: AppNotification) => void) => () => void
        onChanged: (callback: (state: NotificationState) => void) => () => void
        onConfigChanged: (callback: (config: NotificationsConfig) => void) => () => void
      }
    }
  }
}
