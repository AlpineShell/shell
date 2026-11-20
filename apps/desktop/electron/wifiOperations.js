const {
  buildEnterpriseCredentialsXml,
  buildEnterpriseProfileXml,
  buildProfileXml,
  enterpriseAuthenticationFor,
  isValidPassphrase,
} = require('./wifiProfiles.js')

const CONNECT_DEADLINE_MS = 25000
const IDLE_FAILURE_MS = 6000
const CONNECT_POLL_MS = 250
const ERROR_VISIBLE_MS = 8000
const DISCONNECT_SETTLE_MS = 750
const SUPPORTED_SECURITIES = new Set(['open', 'owe', 'wpa-personal', 'wpa2-personal', 'wpa3-personal', 'enterprise'])
const TRANSITION_STATES = new Set(['associating', 'discovering', 'authenticating'])

function securityOf(authAlgorithm, cipherAlgorithm, securityEnabled) {
  if (authAlgorithm === 1) {
    if (cipherAlgorithm === 0 || !securityEnabled) return 'open'
    if ([1, 5, 0x101].includes(cipherAlgorithm)) return 'wep'
    return 'open'
  }
  if (authAlgorithm === 2) return 'wep'
  if ([3, 6, 8, 11].includes(authAlgorithm)) return 'enterprise'
  if (authAlgorithm === 4) return 'wpa-personal'
  if (authAlgorithm === 7) return 'wpa2-personal'
  if (authAlgorithm === 9) return 'wpa3-personal'
  if (authAlgorithm === 10) return 'owe'
  return 'unknown'
}

function isSecured(security) {
  return security !== 'open' && security !== 'owe'
}

function isSupportedSecurity(security) {
  return SUPPORTED_SECURITIES.has(security)
}

function strongestEntry(entries) {
  return entries.reduce((strongest, entry) => entry.signal > strongest.signal ? entry : strongest)
}

function preferredEntry(entries) {
  const connectedEntries = entries.filter((entry) => entry.connected)
  if (connectedEntries.length > 0) return strongestEntry(connectedEntries)
  const profileEntries = entries.filter((entry) => entry.hasProfile)
  if (profileEntries.length > 0) return strongestEntry(profileEntries)
  return strongestEntry(entries)
}

function mergeWifiEntries(entries) {
  const selected = preferredEntry(entries)
  const security = securityOf(selected.authAlgorithm, selected.cipherAlgorithm, selected.securityEnabled)
  return {
    ssid: selected.ssid,
    signal: Math.max(...entries.map((entry) => entry.signal)),
    security,
    secured: isSecured(security),
    saved: entries.some((entry) => entry.hasProfile),
    connected: entries.some((entry) => entry.connected),
    connectable: entries.some((entry) => entry.connectable),
  }
}

function compareWifiNetworks(first, second) {
  if (first.connected !== second.connected) return Number(second.connected) - Number(first.connected)
  if (first.saved !== second.saved) return Number(second.saved) - Number(first.saved)
  if (first.signal !== second.signal) return second.signal - first.signal
  return first.ssid.localeCompare(second.ssid)
}

function toWifiNetworks(rawNetworks) {
  const grouped = new Map()
  for (const entry of rawNetworks) {
    if (!entry.ssid) continue
    const entries = grouped.get(entry.ssid) ?? []
    entries.push(entry)
    grouped.set(entry.ssid, entries)
  }
  return Array.from(grouped.values(), mergeWifiEntries).sort(compareWifiNetworks)
}

function networkEntryFor(rawNetworks, ssid) {
  const entries = rawNetworks.filter((entry) => entry.ssid === ssid)
  if (entries.length === 0) return null
  const profileEntries = entries.filter((entry) => entry.hasProfile)
  const connectedProfileEntries = profileEntries.filter((entry) => entry.connected)
  const selected = connectedProfileEntries.length > 0
    ? strongestEntry(connectedProfileEntries)
    : profileEntries.length > 0
      ? strongestEntry(profileEntries)
      : strongestEntry(entries)
  const security = securityOf(selected.authAlgorithm, selected.cipherAlgorithm, selected.securityEnabled)
  return {
    profileName: selected.hasProfile ? selected.profileName || null : null,
    authAlgorithm: selected.authAlgorithm,
    cipherAlgorithm: selected.cipherAlgorithm,
    security,
  }
}

function reject(error) {
  return { action: 'reject', error }
}

function hasEnterpriseCredentials(username, password) {
  return typeof username === 'string' && username.trim().length > 0 && typeof password === 'string' && password.length > 0
}

function enterpriseConnectPlan({ network, profileName, authAlgorithm, cipherAlgorithm, username, password, trustServer }) {
  const credentialsGiven = hasEnterpriseCredentials(username, password)
  if (!credentialsGiven && profileName) return { action: 'use-profile', profileName }
  if (!enterpriseAuthenticationFor(authAlgorithm)) return reject('unsupported-security')
  if (!credentialsGiven) return { action: 'needs-password', needsUsername: true }
  const validatesServer = trustServer !== true
  return {
    action: 'create-profile',
    xml: buildEnterpriseProfileXml({ ssid: network.ssid, authAlgorithm, cipherAlgorithm, validateServer: validatesServer }),
    credentialsXml: buildEnterpriseCredentialsXml({ username: username.trim(), password }),
    withPassword: true,
    validatesServer,
  }
}

function connectPlan(input) {
  const { network, profileName, cipherAlgorithm, password } = input
  if (network.security === 'enterprise') return enterpriseConnectPlan(input)
  const passwordGiven = typeof password === 'string' && password.length > 0
  const secured = isSecured(network.security)
  if (passwordGiven && secured) {
    if (!isValidPassphrase(password)) return reject('invalid-password')
    if (!isSupportedSecurity(network.security)) return reject('unsupported-security')
    const xml = buildProfileXml({ ssid: network.ssid, security: network.security, cipherAlgorithm, password })
    return { action: 'create-profile', xml, withPassword: true }
  }
  if (profileName) return { action: 'use-profile', profileName }
  if (!isSupportedSecurity(network.security)) return reject('unsupported-security')
  if (!secured) {
    const xml = buildProfileXml({ ssid: network.ssid, security: network.security, cipherAlgorithm })
    return { action: 'create-profile', xml, withPassword: false }
  }
  return { action: 'needs-password' }
}

function failureAfterTransition(earlierSamples, secured) {
  if (!earlierSamples.some((sample) => TRANSITION_STATES.has(sample.state))) return null
  const authenticated = earlierSamples.some((sample) => sample.state === 'authenticating')
  return authenticated && secured ? 'wrong-password' : 'failed'
}

function trailingDisconnectStart(samples) {
  let start = null
  for (let index = samples.length - 1; index >= 0 && samples[index].state === 'disconnected'; index -= 1) {
    start = index
  }
  return start
}

function settledDisconnectResult(samples, elapsedMs, secured) {
  const start = trailingDisconnectStart(samples)
  if (start === null) return null
  if (elapsedMs - samples[start].atMs < DISCONNECT_SETTLE_MS) return null
  return failureAfterTransition(samples.slice(0, start), secured)
}

function fellBackToAnotherNetwork(samples, targetSsid) {
  const lastSample = samples.at(-1)
  return lastSample?.state === 'connected' && lastSample.ssid !== targetSsid
}

function classifyAttempt(input) {
  const { targetSsid, samples, elapsedMs, secured } = input
  const lastSample = samples.at(-1)
  if (lastSample?.state === 'connected' && lastSample.ssid === targetSsid) return 'connected'
  if (elapsedMs >= CONNECT_DEADLINE_MS) return 'timed-out'
  if (fellBackToAnotherNetwork(samples, targetSsid)) {
    const fallbackOutcome = failureAfterTransition(samples.slice(0, -1), secured)
    if (fallbackOutcome) return fallbackOutcome
  }
  const disconnectOutcome = settledDisconnectResult(samples, elapsedMs, secured)
  if (disconnectOutcome) return disconnectOutcome
  if (samples.length > 0 && samples.every((sample) => sample.state === 'disconnected') && elapsedMs > IDLE_FAILURE_MS) return 'failed'
  return 'pending'
}

function attemptError(plan, outcome) {
  if (plan.validatesServer && (outcome === 'wrong-password' || outcome === 'timed-out')) return 'untrusted-server'
  return outcome
}

function connectFailure(security, error) {
  const enterprise = security === 'enterprise'
  if (error === 'wrong-password' || (enterprise && error === 'timed-out')) {
    return { success: false, needsPassword: true, needsUsername: enterprise, error }
  }
  return { success: false, error }
}

module.exports = {
  CONNECT_DEADLINE_MS,
  CONNECT_POLL_MS,
  DISCONNECT_SETTLE_MS,
  ERROR_VISIBLE_MS,
  IDLE_FAILURE_MS,
  attemptError,
  classifyAttempt,
  connectFailure,
  connectPlan,
  isSecured,
  isSupportedSecurity,
  networkEntryFor,
  securityOf,
  toWifiNetworks,
}
