import { useShellState } from './useShellState'

const DEFAULT_STATE: BatterySaverState = {
  active: false,
  reason: null,
  override: 'auto',
  percent: null,
  charging: false,
  onAcPower: false,
  hasBattery: false,
}

export function useBatterySaver() {
  const state = useShellState<BatterySaverState>(
    DEFAULT_STATE,
    window.shell.batterySaver.state,
    window.shell.batterySaver.onStateChanged
  )

  const setOverride = (override: BatterySaverOverride) => {
    window.shell.batterySaver.setOverride(override)
  }

  return { state, setOverride }
}
