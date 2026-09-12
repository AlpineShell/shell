const DEVICE_OPERATION_DEADLINE_MS = {
  connect: 25000,
  disconnect: 12000,
  remove: 30000,
  repair: 180000,
}
const RADIO_CHANGE_DEADLINE_MS = 15000
const ERROR_VISIBLE_MS = 8000
const REMOVAL_CONFIRMATION_READS = 2
const RADIO_STATES = new Set(['on', 'off', 'unavailable', 'unknown'])
const REMOVED_TRANSPORT_OUTCOMES = new Set(['removed', 'absent'])

function createSession() {
  return {
    radio: { state: 'unknown', pending: null, error: null },
    devices: [],
    devicesAvailable: false,
    stackSignature: null,
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

function pendingAction(session, deviceId) {
  return session.operations[deviceId]?.action ?? null
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
  if (refusal) return { session, error: refusal }
  return {
    session: {
      ...session,
      operations: { ...session.operations, [deviceId]: { action, deadline: now + DEVICE_OPERATION_DEADLINE_MS[action] } },
      errors: withoutKey(session.errors, deviceId),
      absentReads: withoutKey(session.absentReads, deviceId),
    },
    error: null,
  }
}

function failDeviceOperation(session, deviceId, kind, now) {
  if (!session.operations[deviceId]) return session
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

function clearRecoveredErrors(errors, devices) {
  const next = { ...errors }
  for (const [deviceId, error] of Object.entries(errors)) {
    if (!error.kind.startsWith('repair')) continue
    const device = devices.find((candidate) => candidate.id === deviceId)
    if (device && !device.audioDisabled) delete next[deviceId]
  }
  return next
}

function applyDeviceRead(session, read, now) {
  const next = { ...session, devices: read.devices, devicesAvailable: true, stackSignature: read.signature }
  const settled = settleDeviceOperations(next, read.confirmed, now)
  return { ...settled, errors: clearRecoveredErrors(settled.errors, settled.devices) }
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

function expireSession(session, now) {
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

function publicDevice(device, session) {
  return {
    id: device.id,
    name: device.name,
    connected: device.connected,
    canConnect: device.canConnect,
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
  applyDeviceRead,
  applyRadioRead,
  applyRadioSetResult,
  beginDeviceOperation,
  beginRadioChange,
  composeBluetoothState,
  createSession,
  expireSession,
  failDeviceOperation,
  findDevice,
  isRadioState,
  pendingAction,
  removalError,
  stateKey,
}
