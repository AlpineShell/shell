import { useShellState } from './useShellState'

export function useWallpaper() {
  return useShellState<string | null>(
    null,
    window.shell.windows.wallpaper,
    window.shell.windows.onWallpaperChanged
  )
}
