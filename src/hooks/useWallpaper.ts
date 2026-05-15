import { useEffect, useState } from 'react'

declare global {
  interface Window {
    alpineBoot?: {
      wallpaper: () => string | null
      bluetooth: () => { enabled: boolean; connected: boolean; devices: string[] } | null
      wifi: () => { status: NetworkStatus | null; radio: boolean } | null
    }
  }
}

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
