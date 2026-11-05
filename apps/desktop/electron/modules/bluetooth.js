const path = require('path')
const { spawn } = require('child_process')
const { singleFlight } = require('../singleFlight')
const { runPowerShellFile } = require('../powershell')
const { createWorkerChannel } = require('../workerChannel')
const { createDiagnosticLog, createFailureReporter } = require('../diagnosticLog')
const bluetoothNative = require('../bluetoothNative')
const { groupDevices, inStableOrder, reconcileDeviceRead } = require('../bluetoothDevices')
const operations = require('../bluetoothOperations')
const batterySaver = require('./batterySaver')

const POLL_INTERVAL_MS = 1000
const BATTERY_SAVER_POLL_INTERVAL_MS = 5000
const READ_WATCHDOG_MS = 2000
const SLOW_READ_MS = 50
const CONNECT_REQUEST_TIMEOUT_MS = 15000
const DISCONNECT_REQUEST_TIMEOUT_MS = 6000
const ACTION_WATCHDOG_MS = 45000
const DISCONNECT_ESCALATION_MS = 4000
const RADIO_READ_TIMEOUT_MS = 10000
const RADIO_SET_TIMEOUT_MS = 15000
const RADIO_SETTLE_CHECK_MS = 2000
const REMOVE_TIMEOUT_MS = 30000
const REPAIR_TIMEOUT_MS = 180000
const LOG_FILE_NAME = 'bluetooth-log.json'
const LOG_MAX_ENTRIES = 50
const WORKER_ENTRY = path.join(__dirname, '..', 'bluetoothWorker.js')

let session = operations.createSession()
let broadcastRef = null
let lastPublishedKey = null
let lastComposedSession = null
let lastDeviceRead = { readId: null, devices: null, stackIds: null }
let readerChannel = null
let radioRetryTimer = null
let radioRetryDelayMs = 0
const activeActionChannels = new Set()
const channelsHoldingAbandonedIo = []

const diagnostics = createDiagnosticLog({ fileName: LOG_FILE_NAME, maxEntries: LOG_MAX_ENTRIES })
const failures = createFailureReporter({ record: diagnostics.record, prefix: '[bluetooth]' })

function logUnexpected(error) {
  failures.failure(`unexpected: ${error?.message ?? String(error)}`, null)
}

function reportActionFailure(kind, detail) {
  console.error(`[bluetooth] ${kind}:`, JSON.stringify(detail ?? null))
  diagnostics.record(kind, detail ?? null)
}

function scriptPath(name) {
  const { app } = require('electron')
  const directory = app.isPackaged ? path.join(process.resourcesPath, 'scripts') : path.join(__dirname, '..', 'scripts')
  return path.join(directory, name)
}

function parseLastJsonLine(text) {
  const line = String(text ?? '').split(/\r?\n/).filter((candidate) => candidate.trim()).at(-1)
  if (!line) return null
  try {
    return JSON.parse(line)
  } catch {
    return null
  }
}

function describeScriptRun(result) {
  if (result.timedOut) return 'timed out'
  return `exit ${result.exitCode}${result.stderr ? `: ${result.stderr}` : ''}`
}

async function runScript(name, args, timeoutMs) {
  const result = await runPowerShellFile(scriptPath(name), args, { timeoutMs })
  const value = result.timedOut ? null : parseLastJsonLine(result.stdout)
  return value ? { value, failure: null } : { value: null, failure: describeScriptRun(result) }
}

function createBluetoothWorker() {
  const { Worker } = require('worker_threads')
  return new Worker(WORKER_ENTRY)
}

function readerWorkers() {
  if (!readerChannel) readerChannel = createWorkerChannel({ createWorker: createBluetoothWorker, label: 'bluetooth-reader' })
  return readerChannel
}

function releaseActionChannel(channel, outcome) {
  activeActionChannels.delete(channel)
  if (outcome.ok && outcome.value?.abandoned) channelsHoldingAbandonedIo.push(channel)
  else channel.dispose()
}

async function requestOnActionWorker(request) {
  const channel = createWorkerChannel({ createWorker: createBluetoothWorker, label: 'bluetooth-action' })
  activeActionChannels.add(channel)
  const outcome = await channel.request(request, ACTION_WATCHDOG_MS)
  releaseActionChannel(channel, outcome)
  return outcome
}

function currentState() {
  return operations.composeBluetoothState(session)
}

function publish() {
  if (session === lastComposedSession) return
  lastComposedSession = session
  const state = currentState()
  const key = operations.stateKey(state)
  if (key === lastPublishedKey) return
  lastPublishedKey = key
  broadcastRef?.('system/bluetooth-changed', state)
}

function expireAndPublish() {
  session = operations.expireSession(session, Date.now())
  publish()
}

function reportReadDuration(elapsedMs, ok) {
  if (elapsedMs > SLOW_READ_MS) failures.failure('slow-read', { elapsedMs, ok })
  else failures.success('slow-read')
}

function deviceReadOfSnapshot(readId, snapshot) {
  return { readId, devices: inStableOrder(groupDevices(snapshot)), stackIds: snapshot.stackIds }
}

function deviceReadOfReply(reply) {
  if (reply?.unchanged) return lastDeviceRead
  if (!reply?.snapshot) return null
  lastDeviceRead = deviceReadOfSnapshot(reply.readId, reply.snapshot)
  return lastDeviceRead
}

function applyDeviceRead(deviceRead) {
  const read = reconcileDeviceRead(
    { previousDevices: session.devices, previousSignature: session.stackSignature },
    { devices: deviceRead.devices, stackIds: deviceRead.stackIds },
  )
  session = operations.applyDeviceRead(session, read, Date.now())
  return read.stackChanged
}

function applyReadOutcome(deviceRead, failure) {
  if (!deviceRead) {
    failures.failure('read-failed', failure)
    session = operations.applyFailedRead(session)
    return
  }
  failures.success('read-failed')
  if (applyDeviceRead(deviceRead)) refreshRadioQuietly('stack-changed')
}

async function readDevicesOnWorker() {
  const startedAt = Date.now()
  const outcome = await readerWorkers().request({ type: 'read-nodes-if-changed', knownReadId: lastDeviceRead.readId }, READ_WATCHDOG_MS)
  reportReadDuration(Date.now() - startedAt, outcome.ok)
  applyReadOutcome(outcome.ok ? deviceReadOfReply(outcome.value) : null, outcome.error ?? 'the reader returned nothing')
  expireAndPublish()
}

const readDevices = singleFlight(readDevicesOnWorker)

function pollDevices() {
  if (readDevices.isPending()) return
  readDevices().catch(logUnexpected)
}

async function readFreshDevices() {
  if (readDevices.isPending()) await readDevices()
  return readDevices()
}

function readDevicesAtBoot() {
  const snapshot = bluetoothNative.readBluetoothNodes()
  applyReadOutcome(snapshot ? deviceReadOfSnapshot(null, snapshot) : null, 'the boot read returned nothing')
  expireAndPublish()
}

const readRadio = singleFlight(() => runScript('bluetoothRadio.ps1', ['-Action', 'get'], RADIO_READ_TIMEOUT_MS))

function retryRadioRead() {
  radioRetryTimer = null
  if (session.radio.state === 'unknown') refreshRadioQuietly('retry')
}

function scheduleRadioRetry() {
  if (radioRetryTimer || session.radio.state !== 'unknown') return
  radioRetryDelayMs = operations.nextRadioRetryDelay(radioRetryDelayMs)
  radioRetryTimer = setTimeout(retryRadioRead, radioRetryDelayMs)
}

function cancelRadioRetry() {
  clearTimeout(radioRetryTimer)
  radioRetryTimer = null
  radioRetryDelayMs = 0
}

function recordRadioDrift(reason, state) {
  const cached = session.radio.state
  if (reason === 'surface' && cached !== 'unknown' && cached !== state) diagnostics.record('radio-drift', { cached, read: state })
}

function applyRadioState(reason, state) {
  failures.success('radio-read-failed')
  cancelRadioRetry()
  recordRadioDrift(reason, state)
  session = operations.applyRadioRead(session, state)
  expireAndPublish()
}

function handleRadioReadFailure(detail) {
  failures.failure('radio-read-failed', detail)
  scheduleRadioRetry()
}

async function refreshRadio(reason) {
  const { value, failure } = await readRadio()
  if (operations.isRadioState(value?.state)) applyRadioState(reason, value.state)
  else handleRadioReadFailure(failure ?? value?.error ?? 'no radio state')
}

function refreshRadioQuietly(reason) {
  refreshRadio(reason).catch(logUnexpected)
}

async function refreshBluetooth() {
  await Promise.all([readFreshDevices(), refreshRadio('surface')])
  return currentState()
}

function refuse(error) {
  return { accepted: false, error }
}

function beginOperation(deviceId, action) {
  const begun = operations.beginDeviceOperation(session, deviceId, action, Date.now())
  if (begun.error) return { error: begun.error, operationId: null }
  session = begun.session
  publish()
  return { error: null, operationId: begun.operationId }
}

function failOperation(deviceId, operationId, kind, detail) {
  reportActionFailure(kind, { deviceId, ...detail })
  session = operations.failDeviceOperation(session, deviceId, operationId, kind, Date.now())
  publish()
}

async function runNativeAction(deviceId, operationId, action, request) {
  const outcome = await requestOnActionWorker(request)
  const result = outcome.ok ? outcome.value : null
  await readFreshDevices()
  if (!result?.ok) failOperation(deviceId, operationId, `${action}-failed`, result ?? { error: outcome.error })
  return result
}

function connectDevice(deviceId) {
  const device = operations.findDevice(session, deviceId)
  const { error, operationId } = beginOperation(deviceId, 'connect')
  if (error) return refuse(error)
  runNativeAction(deviceId, operationId, 'connect', {
    type: 'connect-device',
    serviceNodeIds: device.audioSinkNodeIds,
    timeoutMs: CONNECT_REQUEST_TIMEOUT_MS,
  }).catch(logUnexpected)
  return { accepted: true }
}

async function escalateDisconnect(deviceId, operationId, address) {
  if (!operations.isCurrentOperation(session, deviceId, operationId)) return
  diagnostics.record('disconnect-escalated', { deviceId })
  await runNativeAction(deviceId, operationId, 'disconnect', { type: 'disconnect-link', address, timeoutMs: DISCONNECT_REQUEST_TIMEOUT_MS })
}

function scheduleDisconnectEscalation(deviceId, operationId, address, result) {
  if (!result?.ok || !String(result.method).startsWith('ks-') || !address) return
  setTimeout(() => escalateDisconnect(deviceId, operationId, address).catch(logUnexpected), DISCONNECT_ESCALATION_MS)
}

function disconnectDevice(deviceId) {
  const device = operations.findDevice(session, deviceId)
  const { error, operationId } = beginOperation(deviceId, 'disconnect')
  if (error) return refuse(error)
  runNativeAction(deviceId, operationId, 'disconnect', {
    type: 'disconnect-device',
    serviceNodeIds: device.audioSinkNodeIds,
    address: device.classicAddress,
    timeoutMs: DISCONNECT_REQUEST_TIMEOUT_MS,
  })
    .then((result) => scheduleDisconnectEscalation(deviceId, operationId, device.classicAddress, result))
    .catch(logUnexpected)
  return { accepted: true }
}

function removalArguments(device) {
  return [
    ...(device.classicAddress ? ['-ClassicAddress', device.classicAddress] : []),
    ...(device.leAddress ? ['-LeAddress', device.leAddress] : []),
  ]
}

async function runRemoval(deviceId, operationId, device) {
  const { value, failure } = await runScript('bluetoothUnpair.ps1', removalArguments(device), REMOVE_TIMEOUT_MS)
  await readFreshDevices()
  const error = operations.removalError(value)
  if (error) failOperation(deviceId, operationId, error, value ?? { failure })
}

function removeDevice(deviceId) {
  const device = operations.findDevice(session, deviceId)
  const { error, operationId } = beginOperation(deviceId, 'remove')
  if (error) return refuse(error)
  runRemoval(deviceId, operationId, device).catch(logUnexpected)
  return { accepted: true }
}

async function runRepair(deviceId, operationId, device) {
  const { value, failure } = await runScript('bluetoothEnableAudioServices.ps1', ['-Address', device.classicAddress], REPAIR_TIMEOUT_MS)
  await readFreshDevices()
  if (!value?.success) failOperation(deviceId, operationId, value?.error === 'cancelled' ? 'repair-cancelled' : 'repair-failed', value ?? { failure })
}

function repairAudio(deviceId) {
  const device = operations.findDevice(session, deviceId)
  const { error, operationId } = beginOperation(deviceId, 'repair')
  if (error) return refuse(error)
  runRepair(deviceId, operationId, device).catch(logUnexpected)
  return { accepted: true }
}

function applyRadioSetOutcome(value, failure) {
  if (!value || value.error) reportActionFailure('radio-set-failed', value ?? { failure })
  session = operations.applyRadioSetResult(session, value, Date.now())
  expireAndPublish()
}

async function followUpRadioChange() {
  await readFreshDevices()
  if (session.radio.pending) setTimeout(() => refreshRadioQuietly('settle'), RADIO_SETTLE_CHECK_MS)
}

async function runRadioChange(target) {
  const { value, failure } = await runScript('bluetoothRadio.ps1', ['-Action', target], RADIO_SET_TIMEOUT_MS)
  applyRadioSetOutcome(value, failure)
  await followUpRadioChange()
}

function setRadio(on) {
  const begun = operations.beginRadioChange(session, on ? 'on' : 'off', Date.now())
  if (begun.error) return refuse(begun.error)
  session = begun.session
  publish()
  runRadioChange(on ? 'on' : 'off').catch(logUnexpected)
  return { accepted: true }
}

function pairingWizardPath() {
  const windowsDirectory = process.env.SystemRoot || process.env.windir || 'C:\\Windows'
  return path.join(windowsDirectory, 'System32', 'DevicePairingWizard.exe')
}

function openPairingWizard() {
  return new Promise((resolve) => {
    let child
    try {
      child = spawn(pairingWizardPath(), [], { detached: true, stdio: 'ignore' })
    } catch (e) {
      reportActionFailure('pairing-wizard-failed', e?.message ?? String(e))
      resolve(refuse('spawn-failed'))
      return
    }
    child.once('spawn', () => {
      child.unref()
      resolve({ accepted: true })
    })
    child.once('error', (e) => {
      reportActionFailure('pairing-wizard-failed', e?.message ?? String(e))
      resolve(refuse(e?.code ?? 'spawn-failed'))
    })
  })
}

function guarded(action) {
  return (...args) => {
    try {
      return action(...args)
    } catch (e) {
      logUnexpected(e)
      return refuse('internal')
    }
  }
}

function registerInitChannel() {
  const { ipcMain } = require('electron')
  ipcMain.on('system/bluetooth-init', (event) => {
    event.returnValue = currentState()
  })
}

function subscribeToWake() {
  const { powerMonitor } = require('electron')
  const onWake = () => {
    readFreshDevices().catch(logUnexpected)
    refreshRadioQuietly('resume')
  }
  for (const event of ['resume', 'unlock-screen']) powerMonitor.on(event, onWake)
}

function disposeWorkers() {
  readerChannel?.dispose()
  for (const channel of activeActionChannels) channel.dispose()
}

function subscribeToQuit(stopPolling) {
  const { app } = require('electron')
  app.on('will-quit', () => {
    stopPolling?.()
    cancelRadioRetry()
    disposeWorkers()
  })
}

function attempt(label, step) {
  try {
    return step()
  } catch (e) {
    console.error(`[bluetooth] ${label} failed:`, e?.message ?? e)
    return null
  }
}

module.exports = {
  handlers: {
    'system/bluetooth': () => currentState(),
    'system/bluetooth-refresh': () => refreshBluetooth().catch((e) => {
      logUnexpected(e)
      return currentState()
    }),
    'system/bluetooth-connect': guarded((_event, deviceId) => connectDevice(String(deviceId))),
    'system/bluetooth-disconnect': guarded((_event, deviceId) => disconnectDevice(String(deviceId))),
    'system/bluetooth-remove': guarded((_event, deviceId) => removeDevice(String(deviceId))),
    'system/bluetooth-repair-audio': guarded((_event, deviceId) => repairAudio(String(deviceId))),
    'system/bluetooth-set-radio': guarded((_event, on) => setRadio(on === true)),
    'system/bluetooth-settings': () => openPairingWizard(),
  },

  start(broadcast) {
    broadcastRef = broadcast
    attempt('init channel', registerInitChannel)
    attempt('boot read', readDevicesAtBoot)
    attempt('radio read', () => refreshRadioQuietly('start'))
    const stopPolling = attempt('polling', () =>
      batterySaver.startAdaptivePolling(pollDevices, POLL_INTERVAL_MS, BATTERY_SAVER_POLL_INTERVAL_MS),
    )
    attempt('wake subscription', subscribeToWake)
    attempt('quit subscription', () => subscribeToQuit(stopPolling))
  },
}
