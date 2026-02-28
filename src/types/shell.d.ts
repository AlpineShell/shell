export {}

declare global {
  interface Window {
    shell: {
      windows: {
        wallpaper: () => Promise<string | null>
        onWallpaperChanged: (callback: (data: string | null) => void) => void
      }
    }
  }
}