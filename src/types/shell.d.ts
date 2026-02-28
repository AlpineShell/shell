export {}

interface OpenApp {
  id: number
  name: string
  title: string
  path: string
  icon: string
}

interface WifiSignal {
  signal: number | null
  connected: boolean
}

interface BluetoothState {
  enabled: boolean
  connected: boolean
}

declare global {
  interface Window {
    shell: {
      windows: {
        wallpaper: () => Promise<string | null>
        onWallpaperChanged: (callback: (data: string | null) => void) => void
        openApps: () => Promise<OpenApp[]>
        onOpenAppsChanged: (callback: (data: OpenApp[]) => void) => void
      }
      network: {
        wifiSignal: () => Promise<WifiSignal>
        onWifiSignalChanged: (callback: (data: WifiSignal) => void) => void
      }
      system: {
        bluetooth: () => Promise<BluetoothState>
        onBluetoothChanged: (callback: (data: BluetoothState) => void) => void
      }
    }
  }
}