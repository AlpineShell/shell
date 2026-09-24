export function brightnessNeedsSubmenu(monitors: MonitorInfo[]): boolean {
  return monitors.length > 1
}

export function monitorBrightnessLabel(monitor: MonitorInfo): string {
  return monitor.brightnessWritable ? monitor.name : `${monitor.name} (not responding)`
}
