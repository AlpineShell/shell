import { useShellState } from './useShellState'

export function useNetworkStatus() {
  return useShellState<NetworkStatus>(
    { signal: null, connected: false, type: 'wifi', ssid: null, wifi: { connected: false, ssid: null, signal: null } },
    window.shell.network.wifiSignal,
    window.shell.network.onWifiSignalChanged
  )
}
