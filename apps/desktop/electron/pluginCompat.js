const { SUPPORTED_API_VERSIONS, isSupportedApiVersion, satisfiesRange } = require('@alpine/plugin-sdk')

const NEWER_API_REASON = 'requires a newer Alpine'
const OLDER_API_REASON = 'made for an older Alpine; wait for an update to the plugin'

function apiVersionProblem(apiVersion) {
  if (apiVersion == null || isSupportedApiVersion(apiVersion)) return null
  return apiVersion > Math.max(...SUPPORTED_API_VERSIONS) ? NEWER_API_REASON : OLDER_API_REASON
}

function engineRangeOf(engines) {
  if (!engines || typeof engines !== 'object') return null
  return typeof engines.alpineShell === 'string' && engines.alpineShell ? engines.alpineShell : null
}

function engineProblem(engines, appVersion) {
  const range = engineRangeOf(engines)
  if (!range || !appVersion || satisfiesRange(appVersion, range)) return null
  return `requires Alpine ${range}`
}

function pluginCompatibility({ apiVersion, engines }, appVersion) {
  const apiReason = apiVersionProblem(apiVersion)
  const engineReason = engineProblem(engines, appVersion)
  return { apiOk: !apiReason, engineOk: !engineReason, reason: apiReason || engineReason }
}

module.exports = { NEWER_API_REASON, OLDER_API_REASON, apiVersionProblem, engineRangeOf, pluginCompatibility }
