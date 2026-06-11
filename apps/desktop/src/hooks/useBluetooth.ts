import { useShellState } from './useShellState'

export function useBluetooth() {
  return useShellState<BluetoothState>(
    { enabled: false, connected: false, devices: [] },
    window.shell.system.bluetooth,
    window.shell.system.onBluetoothChanged
  )
}
