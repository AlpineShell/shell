import { useEffect, useState } from 'react'

interface WifiSignal {
  signal: number | null
  connected: boolean
}

export function useWifiSignal() {
  const [wifi, setWifi] = useState<WifiSignal>({ signal: null, connected: false })

  useEffect(() => {
    window.shell.network.wifiSignal().then(setWifi)
    window.shell.network.onWifiSignalChanged(setWifi)
  }, [])

  return wifi
}
