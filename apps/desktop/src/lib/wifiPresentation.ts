export const ETHERNET_ONLY_TITLE = 'Ethernet connected'

export function networkStatusLabel(network: WifiNetwork, state: WifiState): string | undefined {
  if (state.operation?.ssid === network.ssid) {
    if (state.operation.kind === 'connect') return 'Connecting…'
    return 'Disconnecting…'
  }
  if (network.connected) return 'Connected'
  if (state.lastError?.ssid !== network.ssid) return undefined
  if (state.lastError.error === 'wrong-password') return 'Wrong password'
  if (state.lastError.error === 'unsupported-security') return 'Not supported'
  if (state.lastError.error === 'untrusted-server') return "Can't verify this network"
  return "Couldn't connect"
}

export function wifiOffLabel(state: WifiState): string {
  if (state.offForEthernet) return 'Off while Ethernet is connected'
  if (state.ethernet) return 'Using Ethernet'
  return 'Wi-Fi off'
}
