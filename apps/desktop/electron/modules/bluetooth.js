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
let readerChannel = null
let actionChannel = null

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

function actionWorkers() {
  if (!actionChannel) actionChannel = createWorkerChannel({ createWorker: createBluetoothWorker, label: 'bluetooth-actions' })
  return actionChannel
}

function currentState() {
  return operations.composeBluetoothState(session)
}

function publish() {
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

function applySnapshot(snapshot) {
  const devices = inStableOrder(groupDevices(snapshot))
  const read = reconcileDeviceRead(
    { previousDevices: session.devices, previousSignature: session.stackSignature },
    { devices, stackIds: snapshot.stackIds },
  )
  session = operations.applyDeviceRead(session, read, Date.now())
  if (read.stackChanged) refreshRadioQuietly('stack-changed')
}

async function readDevicesOnWorker() {
  const startedAt = Date.now()
  const outcome = await readerWorkers().request({ type: 'read-nodes' }, READ_WATCHDOG_MS)
  const elapsedMs = Date.now() - startedAt
  if (elapsedMs > SLOW_READ_MS) failures.failure('slow-read', { elapsedMs, ok: outcome.ok })
  else failures.success('slow-read')
  if (outcome.ok && outcome.value) {
    failures.success('read-failed')
    applySnapshot(outcome.value)
  } else {
    failures.failure('read-failed', outcome.error ?? 'the reader returned nothing')
  }
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
  if (snapshot) applySnapshot(snapshot)
  else failures.failure('read-failed', 'the boot read returned nothing')
  expireAndPublish()
}

const readRadio = singleFlight(() => runScript('bluetoothRadio.ps1', ['-Action', 'get'], RADIO_READ_TIMEOUT_MS))

async function refreshRadio(reason) {
  const { value, failure } = await readRadio()
  if (!operations.isRadioState(value?.state)) {
    failures.failure('radio-read-failed', failure ?? value?.error ?? 'no radio state')
    return
  }
  failures.success('radio-read-failed')
  const cached = session.radio.state
  if (reason === 'surface' && cached !== 'unknown' && cached !== value.state) diagnostics.record('radio-drift', { cached, read: value.state })
  session = operations.applyRadioRead(session, value.state)
  expireAndPublish()
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
  if (begun.error) return begun.error
  session = begun.session
  publish()
  return null
}

function failOperation(deviceId, kind, detail) {
  reportActionFailure(kind, { deviceId, ...detail })
  session = operations.failDeviceOperation(session, deviceId, kind, Date.now())
  publish()
}

async function runNativeAction(deviceId, action, request) {
  const outcome = await actionWorkers().request(request, ACTION_WATCHDOG_MS)
  const result = outcome.ok ? outcome.value : null
  if (!result?.ok) failOperation(deviceId, `${action}-failed`, result ?? { error: outcome.error })
  await readFreshDevices()
  return result
}

function connectDevice(deviceId) {
  if (actionWorkers().isBusy()) return refuse('busy')
  const device = operations.findDevice(session, deviceId)
  const refusal = beginOperation(deviceId, 'connect')
  if (refusal) return refuse(refusal)
  runNativeAction(deviceId, 'connect', {
    type: 'connect-device',
    serviceNodeIds: device.audioSinkNodeIds,
    timeoutMs: CONNECT_REQUEST_TIMEOUT_MS,
  }).catch(logUnexpected)
  return { accepted: true }
}

async function escalateDisconnect(deviceId, address) {
  if (operations.pendingAction(session, deviceId) !== 'disconnect' || actionWorkers().isBusy()) return
  diagnostics.record('disconnect-escalated', { deviceId })
  await runNativeAction(deviceId, 'disconnect', { type: 'disconnect-link', address, timeoutMs: DISCONNECT_REQUEST_TIMEOUT_MS })
}

function scheduleDisconnectEscalation(deviceId, address, result) {
  if (!result?.ok || !String(result.method).startsWith('ks-') || !address) return
  setTimeout(() => escalateDisconnect(deviceId, address).catch(logUnexpected), DISCONNECT_ESCALATION_MS)
}

function disconnectDevice(deviceId) {
  if (actionWorkers().isBusy()) return refuse('busy')
  const device = operations.findDevice(session, deviceId)
  const refusal = beginOperation(deviceId, 'disconnect')
  if (refusal) return refuse(refusal)
  runNativeAction(deviceId, 'disconnect', {
    type: 'disconnect-device',
    serviceNodeIds: device.audioSinkNodeIds,
    address: device.classicAddress,
    timeoutMs: DISCONNECT_REQUEST_TIMEOUT_MS,
  })
    .then((result) => scheduleDisconnectEscalation(deviceId, device.classicAddress, result))
    .catch(logUnexpected)
  return { accepted: true }
}

function removalArguments(device) {
  return [
    ...(device.classicAddress ? ['-ClassicAddress', device.classicAddress] : []),
    ...(device.leAddress ? ['-LeAddress', device.leAddress] : []),
  ]
}

async function runRemoval(deviceId, device) {
  const { value, failure } = await runScript('bluetoothUnpair.ps1', removalArguments(device), REMOVE_TIMEOUT_MS)
  const error = operations.removalError(value)
  if (error) failOperation(deviceId, error, value ?? { failure })
  await readFreshDevices()
}

function removeDevice(deviceId) {
  const device = operations.findDevice(session, deviceId)
  const refusal = beginOperation(deviceId, 'remove')
  if (refusal) return refuse(refusal)
  runRemoval(deviceId, device).catch(logUnexpected)
  return { accepted: true }
}

async function runRepair(deviceId, device) {
  const { value, failure } = await runScript('bluetoothEnableAudioServices.ps1', ['-Address', device.classicAddress], REPAIR_TIMEOUT_MS)
  if (!value?.success) failOperation(deviceId, value?.error === 'cancelled' ? 'repair-cancelled' : 'repair-failed', value ?? { failure })
  await readFreshDevices()
}

function repairAudio(deviceId) {
  const device = operations.findDevice(session, deviceId)
  const refusal = beginOperation(deviceId, 'repair')
  if (refusal) return refuse(refusal)
  runRepair(deviceId, device).catch(logUnexpected)
  return { accepted: true }
}

async function runRadioChange(target) {
  const { value, failure } = await runScript('bluetoothRadio.ps1', ['-Action', target], RADIO_SET_TIMEOUT_MS)
  if (!value || value.error) reportActionFailure('radio-set-failed', value ?? { failure })
  session = operations.applyRadioSetResult(session, value, Date.now())
  expireAndPublish()
  await readFreshDevices()
  if (session.radio.pending) setTimeout(() => refreshRadioQuietly('settle'), RADIO_SETTLE_CHECK_MS)
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

function subscribeToQuit(stopPolling) {
  const { app } = require('electron')
  app.on('will-quit', () => {
    stopPolling?.()
    readerChannel?.dispose()
    actionChannel?.dispose()
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
