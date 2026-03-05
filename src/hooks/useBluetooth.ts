import { useEffect, useState } from 'react'

interface BluetoothState {
  enabled: boolean
  connected: boolean
  devices: string[]
}

export function useBluetooth() {
  const [bluetooth, setBluetooth] = useState<BluetoothState>({ enabled: false, connected: false, devices: [] })

  useEffect(() => {
    window.shell.system.bluetooth().then(setBluetooth)
    window.shell.system.onBluetoothChanged(setBluetooth)
  }, [])

  return bluetooth
}
