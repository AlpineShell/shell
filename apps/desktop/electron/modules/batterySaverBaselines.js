const { migratePersistedBaselines } = require('./monitorIdentity')
const { clampBrightnessPercent } = require('./batterySaverPolicy')

function withinTolerance(expected, observed, tolerancePercent) {
  return typeof expected === 'number' && Math.abs(expected - observed) <= tolerancePercent
}

function createBatterySaverBaselines() {
  const baselineByStableKey = new Map()
  const appliedByStableKey = new Map()

  function loadStored(stored) {
    const { baselines, discarded } = migratePersistedBaselines(stored)
    for (const [stableKey, value] of baselines) baselineByStableKey.set(stableKey, clampBrightnessPercent(value))
    return discarded
  }

  function beginDimAttempt(stableKey, currentBrightness) {
    const isFirstAttempt = !baselineByStableKey.has(stableKey)
    if (isFirstAttempt) baselineByStableKey.set(stableKey, currentBrightness)
    return { isFirstAttempt, baseline: baselineByStableKey.get(stableKey) }
  }

  function finishDimAttempt(stableKey, { isFirstAttempt, dimmedTo, accepted }) {
    if (accepted) {
      appliedByStableKey.set(stableKey, dimmedTo)
      return true
    }
    if (isFirstAttempt) baselineByStableKey.delete(stableKey)
    return false
  }

  function finishRestoreAttempt(stableKey, accepted) {
    if (!accepted) return false
    baselineByStableKey.delete(stableKey)
    appliedByStableKey.delete(stableKey)
    return true
  }

  function forget(stableKey) {
    if (!baselineByStableKey.delete(stableKey)) return false
    appliedByStableKey.delete(stableKey)
    return true
  }

  function isUnexpectedBrightness(stableKey, observed, tolerancePercent) {
    if (!baselineByStableKey.has(stableKey)) return false
    if (withinTolerance(appliedByStableKey.get(stableKey), observed, tolerancePercent)) return false
    if (withinTolerance(baselineByStableKey.get(stableKey), observed, tolerancePercent)) return false
    return true
  }

  function holdsKeyOtherThan(stableKey) {
    for (const key of baselineByStableKey.keys()) {
      if (key !== stableKey) return true
    }
    return false
  }

  return {
    loadStored,
    beginDimAttempt,
    finishDimAttempt,
    finishRestoreAttempt,
    forget,
    isUnexpectedBrightness,
    holdsKeyOtherThan,
    holds: (stableKey) => baselineByStableKey.has(stableKey),
    baselineFor: (stableKey) => baselineByStableKey.get(stableKey),
    appliedFor: (stableKey) => appliedByStableKey.get(stableKey),
    size: () => baselineByStableKey.size,
    keys: () => [...baselineByStableKey.keys()],
    entries: () => [...baselineByStableKey.entries()],
    toStoredObject: () => Object.fromEntries(baselineByStableKey),
  }
}

module.exports = { createBatterySaverBaselines }
