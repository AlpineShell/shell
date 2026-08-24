const MIN_SAMPLE_INTERVAL_MS = 250
const SAMPLE_BURST_LIMIT = 8
const SAMPLE_BURST_COOLDOWN_MS = 5000

function claimSample(budgets, displayId, hwnd, now) {
  let budget = budgets.get(displayId)
  if (!budget || budget.hwnd !== hwnd) {
    budget = { hwnd, taken: 0, readyAt: 0 }
    budgets.set(displayId, budget)
  }
  if (now < budget.readyAt) return false
  if (budget.taken >= SAMPLE_BURST_LIMIT) budget.taken = 0
  budget.taken++
  budget.readyAt = now + (budget.taken >= SAMPLE_BURST_LIMIT ? SAMPLE_BURST_COOLDOWN_MS : MIN_SAMPLE_INTERVAL_MS)
  return true
}

module.exports = {
  MIN_SAMPLE_INTERVAL_MS,
  SAMPLE_BURST_LIMIT,
  SAMPLE_BURST_COOLDOWN_MS,
  claimSample,
}
