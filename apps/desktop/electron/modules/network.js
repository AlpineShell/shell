const path = require('path')
const { runPowerShellFile } = require('../powershell')
const { singleFlight } = require('../singleFlight')
const {
  readWiredConnection,
  readWifiConnection,
  readWifiRadioState,
  disposeNetworkNative,
} = require('../networkNative')
const {
  connectProfile,
  deleteProfile,
  disconnect,
  readAvailableNetworks,
  readInterfaceState,
  requestScan,
  setProfile,
} = require('../wifiNative')
const {
  CONNECT_DEADLINE_MS,
  CONNECT_POLL_MS,
  ERROR_VISIBLE_MS,
  classifyAttempt,
  connectPlan,
  networkEntryFor,
  toWifiNetworks,
} = require('../wifiOperations')
const wifiSession = require('../wifiSession')
const { readEthernetSwitchesWifiOff } = require('../wifiSwitching')
const batterySaver = require('./batterySaver')
const { readNetworkDetails } = require('./networkDetails')

const NETWORK_REFRESH_INTERVAL_MS = 5000
const BATTERY_SAVER_NETWORK_REFRESH_INTERVAL_MS = 60000
const SCAN_REFRESH_DELAYS_MS = [1000, 2500, 4500]
const DISCONNECT_POLL_MS = 250
const DISCONNECT_DEADLINE_MS = 5000
const POST_RADIO_SET_REFRESH_MS = 1500
const RADIO_ON_RECHECK_DELAYS_MS = [3000, 5000, 8000]
const DETAILS_WARMUP_MS = 20000
const DETAILS_STALE_MS = 30000
const SCRIPT_RADIO_READ_INTERVAL_MS = 60000
const RADIO_CHANGE_DEADLINE_MS = 8000
const SWITCHING_PROBE_DELAY_MS = 3000
const DETAILS_AFTER_CONNECTION_CHANGE_MS = [1000, 4000, 10000]

let cachedStatus = wifiSession.networkStatusFor(false, null)
let cachedWifiState = wifiSession.initialWifiState()
let cachedDetails = undefined
let detailsFollowUpTimers = []
let detailsReadAt = 0
let lastConnectionKey = null
let cachedWiredConnection = false
let cachedWifiConnection = null
let transientNetworkNull = false
let broadcastFn = null
let stopPolling = null
let shuttingDown = false
let errorExpiryTimer = null
let connectInProgress = false
let cachedRadioEnabled = true
let radioTarget = null
let radioTargetDeadline = 0
let requestedRadio = null
let lastObservedRadio = 'unknown'
let scriptRadioState = null
let scriptRadioReadAt = 0
let ethernetSwitchesWifiOff = false

const trackedTimers = new Map()

function scheduleTimer(callback, delayMs, onCancel = () => {}) {
  const timer = setTimeout(() => {
    trackedTimers.delete(timer)
    callback()
  }, delayMs)
  trackedTimers.set(timer, onCancel)
  return timer
}

function clearTimer(timer) {
  if (!timer || !trackedTimers.has(timer)) return
  clearTimeout(timer)
  const onCancel = trackedTimers.get(timer)
  trackedTimers.delete(timer)
  onCancel()
}

function waitFor(delayMs) {
  return new Promise((resolve) => scheduleTimer(resolve, delayMs, resolve))
}

function clearAllTimers() {
  for (const timer of trackedTimers.keys()) clearTimer(timer)
}

function publishWifiState(nextState) {
  if (wifiSession.jsonChanged(cachedWifiState, nextState)) {
    cachedWifiState = nextState
    if (broadcastFn) broadcastFn('network/wifi-changed', cachedWifiState)
    return
  }
  cachedWifiState = nextState
}

function updateWifiState(patch) {
  publishWifiState({ ...cachedWifiState, ...patch })
}

function publishNetworkStatus(nextStatus) {
  if (!wifiSession.jsonChanged(cachedStatus, nextStatus)) return
  cachedStatus = nextStatus
  if (broadcastFn) broadcastFn('network/wifi-signal-changed', cachedStatus)
}

function applyWifiRadioState(radio, publishState = true) {
  const normalizedRadio = wifiSession.normalizeRadioState(radio)
  if (publishState) updateWifiState({ radio: normalizedRadio })
  if (normalizedRadio !== 'on' && normalizedRadio !== 'off') return normalizedRadio
  const enabled = normalizedRadio === 'on'
  if (wifiSession.jsonChanged(cachedRadioEnabled, enabled)) {
    cachedRadioEnabled = enabled
    if (broadcastFn) broadcastFn('network/wifi-radio-changed', cachedRadioEnabled)
  }
  return normalizedRadio
}

function applyNetworksRead(rawNetworks, radio) {
  const networks = selectNetworksRead(rawNetworks, radio)
  updateWifiState({ networks })
  return networks
}

function selectNetworksRead(rawNetworks, radio) {
  const selection = wifiSession.networksAfterRead({
    rawNetworks,
    radio,
    previousNetworks: cachedWifiState.networks,
    previousNullWhileOn: transientNetworkNull,
  })
  transientNetworkNull = selection.previousNullWhileOn
  return selection.networks
}

function applyWifiConnection(connection) {
  if (connection) cachedWifiConnection = connection
}

function applyWiredConnection(connection) {
  if (connection) cachedWiredConnection = connection.connected === true
}

function offForEthernetAfterReading(observedRadio) {
  const offForEthernet = wifiSession.radioOffForEthernet({
    previous: cachedWifiState.offForEthernet,
    wiredConnected: cachedWiredConnection,
    previousRadio: lastObservedRadio,
    radio: observedRadio,
    requestedRadio,
  })
  lastObservedRadio = observedRadio
  return offForEthernet
}

function cancelDetailsFollowUps() {
  for (const timer of detailsFollowUpTimers) clearTimer(timer)
  detailsFollowUpTimers = []
}

function followConnectionChangeWithDetails() {
  cancelDetailsFollowUps()
  detailsFollowUpTimers = DETAILS_AFTER_CONNECTION_CHANGE_MS.map((delayMs) =>
    scheduleTimer(refreshNetworkDetailsQuietly, delayMs)
  )
}

function refreshDetailsWhenConnectionChanges() {
  const connectionKey = wifiSession.connectionKey(cachedStatus)
  if (connectionKey === lastConnectionKey) return
  const hadPreviousConnection = lastConnectionKey !== null
  lastConnectionKey = connectionKey
  if (hadPreviousConnection && cachedDetails !== undefined) followConnectionChangeWithDetails()
}

function refreshNetworkStatusFromConnections() {
  const nextStatus = wifiSession.networkStatusFor(cachedWiredConnection, cachedWifiConnection)
  publishNetworkStatus(nextStatus)
  refreshDetailsWhenConnectionChanges()
}

async function runWifiRadioScript(action) {
  const { app } = require('electron')
  const scriptsDirectory = app.isPackaged
    ? path.join(process.resourcesPath, 'scripts')
    : path.join(__dirname, '..', 'scripts')
  const scriptPath = path.join(scriptsDirectory, 'wifiRadio.ps1')
  const result = await runPowerShellFile(scriptPath, ['-Action', action])
  return wifiSession.parseRadioScriptResult(result.stdout)
}

async function readRadioThroughScript() {
  if (scriptRadioState !== null && Date.now() - scriptRadioReadAt < SCRIPT_RADIO_READ_INTERVAL_MS) return scriptRadioState
  const fallback = await runWifiRadioScript('get')
  scriptRadioState = fallback.state
  scriptRadioReadAt = Date.now()
  return scriptRadioState
}

async function readRadioState() {
  const nativeRadio = readWifiRadioState()
  if (nativeRadio !== null) return nativeRadio
  return readRadioThroughScript()
}

const refreshNetworkDetails = singleFlight(async () => {
  cachedDetails = await readNetworkDetails()
  detailsReadAt = Date.now()
  if (broadcastFn) broadcastFn('network/details-changed', cachedDetails)
  return cachedDetails
})

function refreshNetworkDetailsQuietly() {
  refreshNetworkDetails().catch(logNetworkFailure)
}

function networkDetails() {
  if (cachedDetails === undefined) return refreshNetworkDetails()
  if (Date.now() - detailsReadAt > DETAILS_STALE_MS) refreshNetworkDetailsQuietly()
  return cachedDetails
}

const refreshNetworkState = singleFlight(async () => {
  if (shuttingDown) return cachedStatus
  const [radio, wired, wifi, rawNetworks] = await Promise.all([
    readRadioState(),
    Promise.resolve().then(() => readWiredConnection()),
    readWifiConnection(),
    readAvailableNetworks(),
  ])
  if (shuttingDown) return cachedStatus
  const observedRadio = wifiSession.normalizeRadioState(radio)
  const normalizedRadio = applyWifiRadioState(radioToShow(observedRadio), false)
  applyWiredConnection(wired)
  applyWifiConnection(wifi)
  const networks = selectNetworksRead(rawNetworks, normalizedRadio)
  refreshNetworkStatusFromConnections()
  const offForEthernet = offForEthernetAfterReading(observedRadio)
  updateWifiState({
    radio: normalizedRadio,
    networks,
    ethernet: cachedWiredConnection,
    offForEthernet,
    blockedByEthernet: ethernetSwitchesWifiOff && cachedWiredConnection,
  })
  return cachedStatus
})

function logNetworkFailure(error) {
  console.error('[network] refresh failed:', error?.message ?? error)
}

function refreshNetworkStatusQuietly() {
  refreshNetworkState().catch(logNetworkFailure)
}

function clearLastError() {
  clearTimer(errorExpiryTimer)
  errorExpiryTimer = null
  if (cachedWifiState.lastError !== null) updateWifiState({ lastError: null })
}

function setLastError(ssid, error) {
  clearTimer(errorExpiryTimer)
  const lastError = { ssid, error }
  updateWifiState({ lastError })
  errorExpiryTimer = scheduleTimer(() => {
    errorExpiryTimer = null
    if (cachedWifiState.lastError === lastError) updateWifiState({ lastError: null })
  }, ERROR_VISIBLE_MS)
}

function setOperation(operation) {
  updateWifiState({ operation })
}

async function readFreshNetworks() {
  const rawNetworks = await readAvailableNetworks()
  applyNetworksRead(rawNetworks, cachedWifiState.radio)
  return Array.isArray(rawNetworks) ? rawNetworks : []
}

async function refreshAvailableNetworks() {
  const rawNetworks = await readAvailableNetworks()
  return applyNetworksRead(rawNetworks, cachedWifiState.radio)
}

async function pollConnectionAttempt(ssid, plan, secured, startedAt) {
  const samples = []
  while (!shuttingDown) {
    await waitFor(CONNECT_POLL_MS)
    if (shuttingDown) return 'failed'
    const sample = await readInterfaceState()
    const elapsedMs = Date.now() - startedAt
    if (sample) samples.push({ ...sample, atMs: elapsedMs })
    const outcome = classifyAttempt({
      targetSsid: ssid,
      samples,
      elapsedMs,
      withPassword: plan.withPassword === true,
      secured,
    })
    if (outcome !== 'pending') return outcome
    if (elapsedMs >= CONNECT_DEADLINE_MS) return 'timed-out'
  }
  return 'failed'
}

async function executeConnectionPlan(ssid, plan, secured) {
  let profileMayExist = false
  try {
    if (plan.action === 'create-profile') {
      profileMayExist = true
      const profile = await setProfile(plan.xml)
      if (!profile?.ok) return { outcome: 'failed', profileMayExist }
    }
    const profileName = plan.action === 'use-profile' ? plan.profileName : ssid
    const connectionStartedAt = Date.now()
    if (!(await connectProfile(profileName))) return { outcome: 'failed', profileMayExist }
    return { outcome: await pollConnectionAttempt(ssid, plan, secured, connectionStartedAt), profileMayExist }
  } catch {
    return { outcome: 'failed', profileMayExist }
  }
}

async function executeWifiConnect({ ssid, password }) {
  if (cachedWifiState.operation) return { success: false, error: 'failed' }
  clearLastError()
  let rawNetworks
  try {
    rawNetworks = await readFreshNetworks()
  } catch (error) {
    logNetworkFailure(error)
    rawNetworks = []
  }
  const network = toWifiNetworks(rawNetworks).find((candidate) => candidate.ssid === ssid)
  if (!network) {
    setLastError(ssid, 'not-found')
    return { success: false, error: 'not-found' }
  }
  const entry = networkEntryFor(rawNetworks, ssid)
  if (!entry) {
    setLastError(ssid, 'not-found')
    return { success: false, error: 'not-found' }
  }
  const plan = connectPlan({
    network,
    profileName: entry.profileName,
    cipherAlgorithm: entry.cipherAlgorithm,
    password,
  })
  if (plan.action === 'reject') {
    setLastError(ssid, plan.error)
    return { success: false, error: plan.error }
  }
  if (plan.action === 'needs-password') return { success: false, needsPassword: true }

  setOperation({ kind: 'connect', ssid })
  let result = { success: false, error: 'failed' }
  let profileMayExist = false
  try {
    const attempt = await executeConnectionPlan(ssid, plan, network.secured)
    profileMayExist = attempt.profileMayExist
    if (attempt.outcome === 'connected') {
      result = { success: true }
      return result
    }
    const error = attempt.outcome
    setLastError(ssid, error)
    result = error === 'wrong-password'
      ? { success: false, needsPassword: true, error }
      : { success: false, error }
    return result
  } catch (error) {
    logNetworkFailure(error)
    setLastError(ssid, 'failed')
    result = { success: false, error: 'failed' }
    return result
  } finally {
    if (profileMayExist && !result.success) await deleteProfile(ssid).catch(logNetworkFailure)
    setOperation(null)
    await refreshNetworkState().catch(logNetworkFailure)
    if (result.success) await refreshNetworkDetails().catch(logNetworkFailure)
  }
}

async function connectWifi(input) {
  if (cachedWifiState.blockedByEthernet) return { success: false, error: 'failed' }
  if (connectInProgress || cachedWifiState.operation) return { success: false, error: 'failed' }
  connectInProgress = true
  try {
    return await executeWifiConnect(input)
  } finally {
    connectInProgress = false
  }
}

const runWifiScan = singleFlight(async () => {
  updateWifiState({ scanning: true })
  try {
    await requestScan()
    const requestedAt = Date.now()
    for (const delayMs of SCAN_REFRESH_DELAYS_MS) {
      await waitFor(Math.max(0, requestedAt + delayMs - Date.now()))
      if (shuttingDown) break
      await refreshAvailableNetworks()
    }
  } finally {
    updateWifiState({ scanning: false })
  }
  return cachedWifiState
})

function scanWifiNetworks() {
  if (cachedWifiState.blockedByEthernet) return cachedWifiState
  runWifiScan().catch(logNetworkFailure)
  return cachedWifiState
}

async function pollUntilDisconnected() {
  const startedAt = Date.now()
  let disconnectedStateSeen = false
  while (!shuttingDown && Date.now() - startedAt < DISCONNECT_DEADLINE_MS) {
    await waitFor(DISCONNECT_POLL_MS)
    if (shuttingDown) break
    const state = await readInterfaceState()
    if (state && state.state !== 'connected') {
      disconnectedStateSeen = true
      break
    }
  }
  return disconnectedStateSeen
}

async function disconnectWifi() {
  if (connectInProgress || cachedWifiState.operation) return { success: false }
  const ssid = cachedWifiConnection?.ssid ?? ''
  clearLastError()
  setOperation({ kind: 'disconnect', ssid })
  let requestAccepted = false
  let disconnected = false
  try {
    requestAccepted = (await disconnect()) === true
    disconnected = await pollUntilDisconnected()
  } catch (error) {
    logNetworkFailure(error)
  } finally {
    setOperation(null)
    await refreshNetworkState().catch(logNetworkFailure)
  }
  return { success: requestAccepted && disconnected }
}

function holdRadioAt(target) {
  radioTarget = target
  radioTargetDeadline = Date.now() + RADIO_CHANGE_DEADLINE_MS
  const radio = applyWifiRadioState(target, false)
  updateWifiState({ radio, offForEthernet: false })
}

function releaseRadioHold() {
  radioTarget = null
  refreshNetworkStatusQuietly()
}

function radioToShow(observedRadio) {
  const settled = wifiSession.settleRadioTarget({
    target: radioTarget,
    deadline: radioTargetDeadline,
    observed: wifiSession.normalizeRadioState(observedRadio),
    now: Date.now(),
  })
  radioTarget = settled.target
  return settled.shown
}

function recheckRadioAfterEnabling(requestedAt) {
  for (const delayMs of RADIO_ON_RECHECK_DELAYS_MS) {
    scheduleTimer(refreshNetworkStatusQuietly, Math.max(0, requestedAt + delayMs - Date.now()))
  }
}

async function setWifiRadio(enabled) {
  if (enabled && cachedWifiState.blockedByEthernet) return { success: false, state: cachedWifiState.radio }
  const target = enabled ? 'on' : 'off'
  const requestedAt = Date.now()
  requestedRadio = target
  holdRadioAt(target)
  const result = await runWifiRadioScript(target)
  if (!result.success) {
    releaseRadioHold()
    return result
  }
  scriptRadioState = result.state
  scriptRadioReadAt = Date.now()
  scheduleTimer(() => {
    refreshNetworkState().catch(logNetworkFailure)
    if (enabled) scanWifiNetworks()
  }, POST_RADIO_SET_REFRESH_MS)
  if (enabled) recheckRadioAfterEnabling(requestedAt)
  return result
}

async function probeEthernetSwitching() {
  ethernetSwitchesWifiOff = await readEthernetSwitchesWifiOff()
  if (shuttingDown) return
  await refreshNetworkState()
}

function handleWillQuit() {
  shuttingDown = true
  clearAllTimers()
  if (stopPolling) stopPolling()
  stopPolling = null
  disposeNetworkNative()
}

module.exports = {
  handlers: {
    'network/wifi-signal': () => cachedStatus,
    'network/wifi-state': () => cachedWifiState,
    'network/wifi-scan': () => scanWifiNetworks(),
    'network/wifi-connect': (_event, { ssid, password }) => connectWifi({ ssid, password }),
    'network/wifi-disconnect': () => disconnectWifi(),
    'network/wifi-radio-set': (_event, enabled) => setWifiRadio(enabled),
    'network/details': () => networkDetails(),
  },

  start(broadcast) {
    broadcastFn = broadcast
    const { app, ipcMain } = require('electron')
    ipcMain.on('network/wifi-init', (event) => {
      event.returnValue = { status: cachedStatus, radio: cachedRadioEnabled }
    })
    refreshNetworkStatusQuietly()
    stopPolling = batterySaver.startAdaptivePolling(
      refreshNetworkStatusQuietly,
      NETWORK_REFRESH_INTERVAL_MS,
      BATTERY_SAVER_NETWORK_REFRESH_INTERVAL_MS,
    )
    scheduleTimer(refreshNetworkDetailsQuietly, DETAILS_WARMUP_MS)
    scheduleTimer(() => probeEthernetSwitching().catch(logNetworkFailure), SWITCHING_PROBE_DELAY_MS)
    app.on('will-quit', handleWillQuit)
  },
}
