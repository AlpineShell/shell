import { useEffect, useState } from 'react'

interface NetworkStatus {
  signal: number | null
  connected: boolean
  type: 'wifi' | 'ethernet'
}

export function useNetworkStatus() {
  const [network, setNetwork] = useState<NetworkStatus>({ signal: null, connected: false, type: 'wifi' })

  useEffect(() => {
    window.shell.network.wifiSignal().then(setNetwork)
    window.shell.network.onWifiSignalChanged(setNetwork)
  }, [])

  return network
}
