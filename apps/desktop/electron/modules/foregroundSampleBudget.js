const MIN_SAMPLE_INTERVAL_MS = 300

function claimSample(budgets, displayId, now) {
  const readyAt = budgets.get(displayId)
  if (readyAt !== undefined && now < readyAt) return false
  budgets.set(displayId, now + MIN_SAMPLE_INTERVAL_MS)
  return true
}

module.exports = {
  MIN_SAMPLE_INTERVAL_MS,
  claimSample,
}
