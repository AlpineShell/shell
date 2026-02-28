import { useEffect, useState } from 'react'

export function useWallpaper() {
  const [wallpaper, setWallpaper] = useState<string | null>(null)

  useEffect(() => {
    window.shell.windows.wallpaper().then(setWallpaper)
    window.shell.windows.onWallpaperChanged(setWallpaper)
  }, [])

  return wallpaper
}
