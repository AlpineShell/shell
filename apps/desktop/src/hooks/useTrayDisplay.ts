import { useShellState } from './useShellState'

const DEFAULT_TRAY_DISPLAY: TrayDisplaySetting = { showOnAllMonitors: false, primaryDisplayId: 0 }

export function useTrayDisplay() {
  const display = useShellState(DEFAULT_TRAY_DISPLAY, window.shell.tray.display, window.shell.tray.onDisplayChanged)
  return { display }
}
