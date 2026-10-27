function skippedWhileStillRunning(label, task) {
  let running = false
  return async () => {
    if (running) return
    running = true
    try {
      await task()
    } catch (e) {
      console.error(`[${label}] periodic task failed:`, e?.message ?? e)
    } finally {
      running = false
    }
  }
}

module.exports = { skippedWhileStillRunning }
