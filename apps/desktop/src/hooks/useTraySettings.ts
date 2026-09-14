import { useShellState } from './useShellState'

const DEFAULT_TRAY_SETTINGS: TraySettings = { enabled: true, showOverflow: true }

export function useTraySettings() {
  const settings = useShellState(DEFAULT_TRAY_SETTINGS, window.shell.tray.settings, window.shell.tray.onSettingsChanged)
  return { settings }
}
