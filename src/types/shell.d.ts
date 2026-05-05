export {}

interface OpenApp {
  id: number
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
  }

  interface LauncherItem {
    id: number
    name: string
    lnkPath: string
    target: string
    icon: string | null
  }

  interface Window {
    setup: {
      status: () => Promise<SetupStatus>
      install: (options: SetupOptions) => Promise<SetupResult>
      skip: () => Promise<void>
      relaunch: () => Promise<void>
      restartWindows: () => Promise<void>
      onProgress: (callback: (step: string) => void) => void
    }
    launcher: {
      index: () => Promise<LauncherItem[]>
      show: () => Promise<void>
      hide: () => Promise<void>
      launch: (id: number) => Promise<{ success: boolean }>
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
      foregroundColor: () => Promise<ForegroundColorData[]>
      onForegroundColorChanged: (callback: (data: ForegroundColorBroadcast) => void) => void
      onCloseMenus: (callback: () => void) => () => void
      onLauncherGap: (callback: (data: { open: boolean; gap: { left: number; right: number } | null }) => void) => void
    }
    shell: {
      windows: {
        wallpaper: () => Promise<string | null>
        onWallpaperChanged: (callback: (data: string | null) => void) => void
        setWallpaper: (filePath: string) => Promise<boolean>
        pickWallpaper: () => Promise<boolean>
        openApps: () => Promise<OpenApp[]>
        onOpenAppsChanged: (callback: (data: OpenApp[]) => void) => void
        openSettings: () => Promise<void>
        closeSettings: () => Promise<void>
      }
      network: {
        wifiSignal: () => Promise<NetworkStatus>
        onWifiSignalChanged: (callback: (data: NetworkStatus) => void) => void
        wifiScan: () => Promise<WifiNetwork[] | null>
        onWifiScanUpdated: (callback: (data: WifiNetwork[]) => void) => void
        wifiConnect: (ssid: string, password?: string) => Promise<{ success: boolean; needsPassword?: boolean }>
        wifiDisconnect: () => Promise<{ success: boolean }>
      }
      system: {
        bluetooth: () => Promise<BluetoothState>
        onBluetoothChanged: (callback: (data: BluetoothState) => void) => void
        onBluetoothDevicesChanged: (callback: (data: BluetoothDevice[]) => void) => void
        bluetoothScan: () => Promise<BluetoothDevice[]>
        bluetoothToggle: (instanceId: string, action: 'connect' | 'disconnect') => Promise<{ success: boolean }>
        bluetoothOpenSettings: () => Promise<void>
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
    }
  }
}
