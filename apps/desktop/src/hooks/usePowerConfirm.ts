import { useShellState } from './useShellState'

const CONFIRM_POWER_ACTIONS_BY_DEFAULT = true

export function usePowerConfirm() {
  return useShellState(
    CONFIRM_POWER_ACTIONS_BY_DEFAULT,
    window.shell.system.powerConfirm,
    window.shell.system.onPowerConfirmChanged
  )
}
