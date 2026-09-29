const HOOK_REFRESH_TICK_MS = 100
const HOOK_STALL_MS = 200
const HOOK_RETRY_MS = 1000

function hookRefreshDue({ hooked, now, lastTickAt, lastRefreshAt }) {
  if (!hooked) return now - lastRefreshAt >= HOOK_RETRY_MS
  return now - lastTickAt >= HOOK_REFRESH_TICK_MS + HOOK_STALL_MS
}

module.exports = {
  HOOK_REFRESH_TICK_MS,
  HOOK_STALL_MS,
  HOOK_RETRY_MS,
  hookRefreshDue,
}
