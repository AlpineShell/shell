const RELOAD_WINDOW_MS = 60 * 1000
const MAX_RELOADS_PER_WINDOW = 5
const FIRST_RELOAD_DELAY_MS = 600
const MAX_RELOAD_DELAY_MS = 10000

function planRendererReload({ recentCrashes, now }) {
  const crashes = [...recentCrashes.filter((time) => now - time < RELOAD_WINDOW_MS), now]
  if (crashes.length > MAX_RELOADS_PER_WINDOW) return { reload: false, delayMs: 0, crashes }
  const delayMs = Math.min(MAX_RELOAD_DELAY_MS, FIRST_RELOAD_DELAY_MS * 2 ** (crashes.length - 1))
  return { reload: true, delayMs, crashes }
}

module.exports = {
  RELOAD_WINDOW_MS,
  MAX_RELOADS_PER_WINDOW,
  MAX_RELOAD_DELAY_MS,
  planRendererReload,
}
