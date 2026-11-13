import { useShellState } from './useShellState'

const INITIAL_WIFI_STATE: WifiState = {
  radio: 'unknown',
  networks: [],
  scanning: false,
  operation: null,
  lastError: null,
  ethernet: false,
  offForEthernet: false,
  blockedByEthernet: false,
}

export function useWifi(): WifiState {
  return useShellState<WifiState>(
    INITIAL_WIFI_STATE,
    window.shell.network.wifiState,
    window.shell.network.onWifiChanged
  )
}
