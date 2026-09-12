import { useShellState } from './useShellState'

export function useTrayIcons() {
  return useShellState<TrayIcon[]>([], window.shell.tray.icons, window.shell.tray.onIconsChanged)
}
