export {}

declare global {
  interface Window {
    shell: {
      windows: {
        wallpaper: () => Promise<string>
      }
    }
  }
}