export function stubAppsBridge() {
  ;(window as unknown as { shell: unknown }).shell = {
    apps: {
      installed: () => Promise.resolve([]),
      onInstalledChanged: () => () => {},
      startup: () => Promise.resolve([]),
      onStartupChanged: () => () => {},
      running: () => Promise.resolve([]),
    },
  }
}
