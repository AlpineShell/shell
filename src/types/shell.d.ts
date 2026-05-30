export {}

interface OpenApp {
  id: number
  hwnd: number
  name: string
  title: string
  path: string
  icon: string
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
  }

  interface LauncherItem {
    id: number
    name: string
    lnkPath: string
    target: string
    icon: string | null
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

  interface Window {
    setup: {
      status: () => Promise<SetupStatus>
      install: (options: SetupOptions) => Promise<SetupResult>
      skip: () => Promise<void>
      testOut: () => Promise<void>
      relaunch: () => Promise<void>
      restartWindows: () => Promise<void>
      revertShell: () => Promise<{ success: boolean }>
      uninstall: () => Promise<{ success: boolean }>
      onProgress: (callback: (step: string) => void) => void
    }
    launcher: {
      index: () => Promise<LauncherItem[]>
      show: () => Promise<void>
      hide: () => Promise<void>
      launch: (id: number) => Promise<{ success: boolean }>
      launchAdmin: (id: number) => Promise<{ success: boolean }>
      uninstall: (id: number) => Promise<{ success: boolean }>
      openLocation: (id: number) => Promise<{ success: boolean }>
      closeWindow: (hwnd: number) => Promise<{ success: boolean }>
      endTask: (pid: number) => Promise<{ success: boolean }>
      getHotkey: () => Promise<string>
      setHotkey: (hotkey: string) => Promise<string>
      defaultHotkey: () => Promise<string>
      onHotkeyChanged: (callback: (hotkey: string) => void) => void
      onIndexChanged: (callback: (data: LauncherItem[]) => void) => void
      onShow: (callback: (data: { displayId: number }) => void) => void
      onStartClose: (callback: () => void) => void
      onHide: (callback: () => void) => void
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
      setHeight: (height: number) => void
      color: () => Promise<TopBarColor | null>
      onColorChanged: (callback: (color: TopBarColor) => void) => void
      colorOverride: () => Promise<TopBarColor | null>
      setColorOverride: (color: { r: number; g: number; b: number } | null) => Promise<TopBarColor | null>
      colorPalette: () => Promise<TopBarColor[]>
      searchIcon: () => Promise<boolean>
      setSearchIcon: (value: boolean) => Promise<boolean>
      onSearchIconChanged: (callback: (visible: boolean) => void) => void
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
        onOpenAppsChanged: (callback: (data: OpenApp[]) => void) => void
        openSettings: () => Promise<void>
        closeSettings: () => Promise<void>
        setSettingsPage: (name: string) => Promise<void>
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
    }
  }
}
