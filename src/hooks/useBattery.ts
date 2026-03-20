import { useShellState } from './useShellState'

export function useBattery() {
  return useShellState<BatteryStatus>(
    { percent: null, charging: false, hasBattery: false },
    window.shell.system.battery,
    window.shell.system.onBatteryChanged
  )
}
