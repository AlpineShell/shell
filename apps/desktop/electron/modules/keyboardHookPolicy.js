const HOOK_REFRESH_TICK_MS = 1000
const HOOK_REFRESH_PERIOD_MS = 10000
const HOOK_STALL_MS = 250

function hookRefreshDue({ hooked, now, lastTickAt, lastRefreshAt }) {
  if (!hooked) return true
  if (now - lastTickAt >= HOOK_REFRESH_TICK_MS + HOOK_STALL_MS) return true
  return now - lastRefreshAt >= HOOK_REFRESH_PERIOD_MS
}

module.exports = {
  HOOK_REFRESH_TICK_MS,
  HOOK_REFRESH_PERIOD_MS,
  HOOK_STALL_MS,
  hookRefreshDue,
}
