export function monitorForDisplay(
  monitors: MonitorInfo[],
  display: DisplayInfo,
  displays: DisplayInfo[]
): MonitorInfo | null {
  const exact = monitors.find((monitor) => monitor.id === display.id)
  if (exact) return exact

  const displayIds = new Set(displays.map((entry) => entry.id))
  const monitorIds = new Set(monitors.map((monitor) => monitor.id))
  const unmatchedMonitors = monitors.filter((monitor) => !displayIds.has(monitor.id))
  const unmatchedDisplays = displays.filter((entry) => !monitorIds.has(entry.id))

  if (unmatchedMonitors.length === 1 && unmatchedDisplays.length === 1 && unmatchedDisplays[0].id === display.id) {
    return unmatchedMonitors[0]
  }
  return null
}
