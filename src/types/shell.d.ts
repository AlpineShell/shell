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
}

interface BluetoothState {
  enabled: boolean
  connected: boolean
}

declare global {
  interface MonitorInfo {
    id: string
    name: string
    type: 'internal' | 'external'
    brightness: number
  }

  interface Window {
    shell: {
      windows: {
        wallpaper: () => Promise<string | null>
        onWallpaperChanged: (callback: (data: string | null) => void) => void
        openApps: () => Promise<OpenApp[]>
        onOpenAppsChanged: (callback: (data: OpenApp[]) => void) => void
      }
      network: {
        wifiSignal: () => Promise<NetworkStatus>
        onWifiSignalChanged: (callback: (data: NetworkStatus) => void) => void
      }
      system: {
        bluetooth: () => Promise<BluetoothState>
        onBluetoothChanged: (callback: (data: BluetoothState) => void) => void
        volume: () => Promise<number>
        setVolume: (value: number) => Promise<number>
        onVolumeChanged: (callback: (data: number) => void) => void
        brightness: () => Promise<number>
        setBrightness: (value: number) => Promise<number>
        onBrightnessChanged: (callback: (data: number) => void) => void
        getMonitors: () => Promise<MonitorInfo[]>
        setMonitorBrightness: (id: string, value: number) => Promise<number>
        onMonitorsChanged: (callback: (data: MonitorInfo[]) => void) => void
      }
    }
  }
}