import { useShellState } from './useShellState'

export function useNetworkStatus() {
  return useShellState<NetworkStatus>(
    { signal: null, connected: false, type: 'wifi', ssid: null },
    window.shell.network.wifiSignal,
    window.shell.network.onWifiSignalChanged
  )
}
