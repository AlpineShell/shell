function createVolumeChangeFeed({ settleMs, deviceChangeDelayMs, millisSinceLastSet, readState, publishState, refreshDevices, schedule = setTimeout }) {
  let settledReadPending = false
  let deviceRefreshPending = false

  function recentlySet() {
    return millisSinceLastSet() < settleMs
  }

  function publishOnceSettled() {
    if (settledReadPending) return
    settledReadPending = true
    schedule(async () => {
      settledReadPending = false
      if (recentlySet()) return publishOnceSettled()
      publishState(await readState())
    }, Math.max(0, settleMs - millisSinceLastSet()))
  }

  function onVolumeChanged(state) {
    if (recentlySet()) return publishOnceSettled()
    publishState(state)
  }

  function onDevicesChanged() {
    if (deviceRefreshPending) return
    deviceRefreshPending = true
    schedule(async () => {
      deviceRefreshPending = false
      await refreshDevices()
      publishState(await readState())
    }, deviceChangeDelayMs)
  }

  return { onVolumeChanged, onDevicesChanged }
}

module.exports = { createVolumeChangeFeed }
