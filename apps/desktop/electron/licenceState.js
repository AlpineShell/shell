const UNLICENSED_REASONS = ['missing', 'unreadable', 'unverifiable', 'device-mismatch']

function decision(state, reason = null) {
  return { state, reason }
}

function isEnforced(config) {
  return config.isReleaseBuild === true || config.enforceInDevelopment === true
}

function deviceBindingHolds(claims, deviceId) {
  return deviceId === null || claims.dev === deviceId
}

function evaluateLicenceState({ claims, deviceId, licenceFile, config }) {
  if (!isEnforced(config)) return decision('development')
  if (licenceFile === 'missing' || licenceFile === 'unreadable') return decision('unlicensed', licenceFile)
  if (!claims) return decision('unlicensed', 'unverifiable')
  if (!deviceBindingHolds(claims, deviceId)) return decision('unlicensed', 'device-mismatch')
  return decision('valid')
}

module.exports = {
  UNLICENSED_REASONS,
  evaluateLicenceState,
}
