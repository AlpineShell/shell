const DEVICE_OPERATION_DEADLINE_MS = {
  connect: 25000,
  disconnect: 12000,
  remove: 30000,
  repair: 180000,
}
const RADIO_CHANGE_DEADLINE_MS = 15000
const ERROR_VISIBLE_MS = 8000
const REMOVAL_CONFIRMATION_READS = 2
const STALE_AFTER_FAILED_READS = 3
const RADIO_RETRY_FIRST_MS = 5000
const RADIO_RETRY_MAX_MS = 60000
const RADIO_STATES = new Set(['on', 'off', 'unavailable', 'unknown'])
const REMOVED_TRANSPORT_OUTCOMES = new Set(['removed', 'absent'])
const ERROR_RECOVERED_WHEN = {
  'connect-failed': (device) => device.classicConnected,
  'disconnect-failed': (device) => !device.classicConnected,
  'repair-failed': (device) => !device.audioDisabled,
  'repair-cancelled': (device) => !device.audioDisabled,
}

function createSession() {
  return {
    radio: { state: 'unknown', pending: null, error: null },
    devices: [],
    devicesAvailable: false,
    failedReads: 0,
    stackSignature: null,
    lastOperationId: 0,
    operations: {},
    errors: {},
    absentReads: {},
  }
}

function withoutKey(record, key) {
  const next = { ...record }
  delete next[key]
  return next
}

function findDevice(session, deviceId) {
  return session.devices.find((device) => device.id === deviceId) ?? null
}

function isCurrentOperation(session, deviceId, operationId) {
  const operation = session.operations[deviceId]
  return !!operation && operation.id === operationId
}

function isRadioState(state) {
  return RADIO_STATES.has(state)
}

function removalError(result) {
  const outcomes = [result?.classic, result?.le].filter((outcome) => typeof outcome === 'string')
  if (outcomes.length === 0) return 'remove-failed'
  if (outcomes.every((outcome) => REMOVED_TRANSPORT_OUTCOMES.has(outcome))) return null
  return outcomes.includes('removed') ? 'remove-partial' : 'remove-failed'
}

function operationRefusal(session, device, action) {
  if (!device) return 'unknown-device'
  if (session.operations[device.id]) return 'busy'
  if (action === 'connect' && (!device.canConnect || device.classicConnected)) return 'unsupported'
  if (action === 'disconnect' && !device.classicConnected) return 'unsupported'
  if (action === 'repair' && !device.audioDisabled) return 'unsupported'
  return null
}

function beginDeviceOperation(session, deviceId, action, now) {
  const refusal = operationRefusal(session, findDevice(session, deviceId), action)
  if (refusal) return { session, error: refusal, operationId: null }
  const operationId = session.lastOperationId + 1
  const operation = { id: operationId, action, deadline: now + DEVICE_OPERATION_DEADLINE_MS[action] }
  return {
    session: {
      ...session,
      lastOperationId: operationId,
      operations: { ...session.operations, [deviceId]: operation },
      errors: withoutKey(session.errors, deviceId),
      absentReads: withoutKey(session.absentReads, deviceId),
    },
    error: null,
    operationId,
  }
}

function failDeviceOperation(session, deviceId, operationId, kind, now) {
  if (!isCurrentOperation(session, deviceId, operationId)) return session
  return {
    ...session,
    operations: withoutKey(session.operations, deviceId),
    errors: { ...session.errors, [deviceId]: { kind, expiresAt: now + ERROR_VISIBLE_MS } },
    absentReads: withoutKey(session.absentReads, deviceId),
  }
}

function nextAbsentCount(previous, device, confirmed) {
  if (device) return 0
  return confirmed ? previous + 1 : previous
}

function operationReached(action, device, absentReads) {
  if (action === 'remove') return absentReads >= REMOVAL_CONFIRMATION_READS
  if (!device) return false
  if (action === 'connect') return device.classicConnected
  if (action === 'disconnect') return !device.classicConnected
  return !device.audioDisabled
}

function settleDeviceOperations(session, confirmed, now) {
  const operations = {}
  const errors = { ...session.errors }
  const absentReads = {}
  for (const [deviceId, operation] of Object.entries(session.operations)) {
    const device = findDevice(session, deviceId)
    const absent = operation.action === 'remove'
      ? nextAbsentCount(session.absentReads[deviceId] ?? 0, device, confirmed)
      : 0
    if (operationReached(operation.action, device, absent)) {
      delete errors[deviceId]
      continue
    }
    if (now >= operation.deadline) {
      errors[deviceId] = { kind: `${operation.action}-failed`, expiresAt: now + ERROR_VISIBLE_MS }
      continue
    }
    operations[deviceId] = operation
    if (operation.action === 'remove') absentReads[deviceId] = absent
  }
  return { ...session, operations, errors, absentReads }
}

function isErrorRecovered(error, device) {
  const recovered = ERROR_RECOVERED_WHEN[error.kind]
  return !!device && !!recovered && recovered(device)
}

function clearRecoveredErrors(errors, devices) {
  const next = { ...errors }
  for (const [deviceId, error] of Object.entries(errors)) {
    const device = devices.find((candidate) => candidate.id === deviceId)
    if (isErrorRecovered(error, device)) delete next[deviceId]
  }
  return next
}

function isEmptyRecord(record) {
  return Object.keys(record).length === 0
}

function hasDeviceWork(session) {
  return !isEmptyRecord(session.operations) || !isEmptyRecord(session.errors) || !isEmptyRecord(session.absentReads)
}

function isRepeatOfAppliedRead(session, read) {
  return read.devices === session.devices
    && read.signature === session.stackSignature
    && session.devicesAvailable
    && session.failedReads === 0
    && !hasDeviceWork(session)
}

function applyDeviceRead(session, read, now) {
  if (isRepeatOfAppliedRead(session, read)) return session
  const next = { ...session, devices: read.devices, devicesAvailable: true, failedReads: 0, stackSignature: read.signature }
  const settled = settleDeviceOperations(next, read.confirmed, now)
  return { ...settled, errors: clearRecoveredErrors(settled.errors, settled.devices) }
}

function applyFailedRead(session) {
  const failedReads = session.failedReads + 1
  return { ...session, failedReads, devicesAvailable: session.devicesAvailable && failedReads < STALE_AFTER_FAILED_READS }
}

function expireErrors(errors, now) {
  return Object.fromEntries(Object.entries(errors).filter(([, error]) => error.expiresAt > now))
}

function expireRadio(radio, now) {
  let next = radio
  if (next.pending && now >= next.pending.deadline) {
    next = { ...next, pending: null, error: { kind: 'set-failed', expiresAt: now + ERROR_VISIBLE_MS } }
  }
  if (next.error && now >= next.error.expiresAt) next = { ...next, error: null }
  return next
}

function isSessionIdle(session) {
  return !hasDeviceWork(session) && !session.radio.pending && !session.radio.error
}

function expireSession(session, now) {
  if (isSessionIdle(session)) return session
  const settled = settleDeviceOperations(session, false, now)
  return { ...settled, errors: expireErrors(settled.errors, now), radio: expireRadio(settled.radio, now) }
}

function beginRadioChange(session, target, now) {
  if (session.radio.pending) return { session, error: 'busy' }
  if (session.radio.state === 'unavailable') return { session, error: 'unavailable' }
  return {
    session: {
      ...session,
      radio: { ...session.radio, pending: { target, deadline: now + RADIO_CHANGE_DEADLINE_MS }, error: null },
    },
    error: null,
  }
}

function applyRadioRead(session, state) {
  if (!isRadioState(state)) return session
  const pending = session.radio.pending?.target === state ? null : session.radio.pending
  return { ...session, radio: { ...session.radio, state, pending } }
}

function applyRadioSetResult(session, result, now) {
  const withState = applyRadioRead(session, result?.state)
  if (result && !result.error) return withState
  const kind = result?.error === 'denied' ? 'denied' : 'set-failed'
  return { ...withState, radio: { ...withState.radio, pending: null, error: { kind, expiresAt: now + ERROR_VISIBLE_MS } } }
}

function nextRadioRetryDelay(previousMs) {
  return previousMs > 0 ? Math.min(previousMs * 2, RADIO_RETRY_MAX_MS) : RADIO_RETRY_FIRST_MS
}

function publicDevice(device, session) {
  return {
    id: device.id,
    name: device.name,
    kind: device.kind ?? 'other',
    connected: device.connected,
    canConnect: device.canConnect && !device.classicConnected,
    canDisconnect: device.classicConnected,
    audioDisabled: device.audioDisabled,
    pending: session.operations[device.id]?.action ?? null,
    error: session.errors[device.id]?.kind ?? null,
  }
}

function composeBluetoothState(session) {
  return {
    radio: {
      state: session.radio.state,
      pending: session.radio.pending?.target ?? null,
      error: session.radio.error?.kind ?? null,
    },
    devices: session.devices.map((device) => publicDevice(device, session)),
    devicesAvailable: session.devicesAvailable,
  }
}

function stateKey(state) {
  return JSON.stringify(state)
}

module.exports = {
  DEVICE_OPERATION_DEADLINE_MS,
  ERROR_VISIBLE_MS,
  RADIO_CHANGE_DEADLINE_MS,
  RADIO_RETRY_FIRST_MS,
  RADIO_RETRY_MAX_MS,
  STALE_AFTER_FAILED_READS,
  applyDeviceRead,
  applyFailedRead,
  applyRadioRead,
  applyRadioSetResult,
  beginDeviceOperation,
  beginRadioChange,
  composeBluetoothState,
  createSession,
  expireSession,
  failDeviceOperation,
  findDevice,
  isCurrentOperation,
  isRadioState,
  nextRadioRetryDelay,
  removalError,
  stateKey,
}
