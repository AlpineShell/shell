import { useEffect, useState } from 'react'

let wallpaperCache: string | null = window.alpineBoot?.wallpaper() ?? null

export function useWallpaper() {
  const [value, setValue] = useState<string | null>(wallpaperCache)

  useEffect(() => {
    window.shell.windows.wallpaper().then((w) => {
      wallpaperCache = w
      setValue(w)
    })
    window.shell.windows.onWallpaperChanged((w) => {
      wallpaperCache = w
      setValue(w)
    })
  }, [])

  return value
}
