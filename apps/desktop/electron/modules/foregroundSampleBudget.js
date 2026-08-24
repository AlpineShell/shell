const MIN_SAMPLE_INTERVAL_MS = 300

function createSampleBudget() {
  let readyAt = null
  return {
    claim(now) {
      if (readyAt !== null && now < readyAt) return false
      readyAt = now + MIN_SAMPLE_INTERVAL_MS
      return true
    },
  }
}

module.exports = {
  MIN_SAMPLE_INTERVAL_MS,
  createSampleBudget,
}
