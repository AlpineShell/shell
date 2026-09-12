import { useEffect, useState } from 'react'

function refreshBluetooth(): Promise<BluetoothState> {
  return window.shell.system.bluetoothRefresh()
}

export function useBluetoothRescan() {
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    refreshBluetooth()
  }, [])

  function rescan() {
    setRefreshing(true)
    refreshBluetooth().finally(() => setRefreshing(false))
  }

  return { refreshing, rescan }
}
