function createSharedIntervals({ startInterval = setInterval, stopInterval = clearInterval } = {}) {
  const groupsByInterval = new Map()

  function runIfStillRegistered(callbacks, callback) {
    if (callbacks.has(callback)) callback()
  }

  function runEach(callbacks) {
    for (const callback of callbacks) queueMicrotask(() => runIfStillRegistered(callbacks, callback))
  }

  function groupFor(intervalMs) {
    const existing = groupsByInterval.get(intervalMs)
    if (existing) return existing
    const callbacks = new Set()
    const group = { callbacks, timer: startInterval(() => runEach(callbacks), intervalMs) }
    groupsByInterval.set(intervalMs, group)
    return group
  }

  function remove(intervalMs, callback) {
    const group = groupsByInterval.get(intervalMs)
    if (!group || !group.callbacks.delete(callback)) return
    if (group.callbacks.size > 0) return
    stopInterval(group.timer)
    groupsByInterval.delete(intervalMs)
  }

  function add(intervalMs, callback) {
    groupFor(intervalMs).callbacks.add(callback)
    return () => remove(intervalMs, callback)
  }

  function activeTimerCount() {
    return groupsByInterval.size
  }

  return { add, activeTimerCount }
}

module.exports = { createSharedIntervals }
