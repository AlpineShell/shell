import { describe, it, expect } from 'vitest'
import {
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
  isCurrentOperation,
  nextRadioRetryDelay,
  removalError,
  stateKey,
} from './bluetoothOperations.js'

const START = 1_000_000

function device(overrides = {}) {
  return {
    id: 'headset',
    name: 'Headset',
    classicAddress: '001122334455',
    leAddress: null,
    classicConnected: false,
    connected: false,
    audioSinkNodeIds: ['a2dp'],
    audioDisabled: false,
    canConnect: true,
    ...overrides,
  }
}

function classicLinked(overrides = {}) {
  return device({ classicConnected: true, connected: true, ...overrides })
}

function confirmedRead(devices) {
  return { devices, signature: 'stack', confirmed: true, stackChanged: false }
}

function transitionalRead(devices) {
  return { devices, signature: 'stack', confirmed: false, stackChanged: true }
}

function sessionWith(devices) {
  return applyDeviceRead(createSession(), confirmedRead(devices), START)
}

function begin(session, deviceId, action, now = START) {
  return beginDeviceOperation(session, deviceId, action, now)
}

function publicDevice(session, deviceId = 'headset') {
  return composeBluetoothState(session).devices.find((candidate) => candidate.id === deviceId)
}

function afterFailedReads(session, count) {
  return Array.from({ length: count }).reduce((current) => applyFailedRead(current), session)
}

describe('beginDeviceOperation', () => {
  it('refuses a second operation on the same device but not on another device', () => {
    const session = sessionWith([device(), device({ id: 'speaker', name: 'Speaker' })])
    const first = begin(session, 'headset', 'connect')

    expect(begin(first.session, 'headset', 'connect').error).toBe('busy')
    expect(begin(first.session, 'speaker', 'connect').error).toBeNull()
  })

  it('refuses unknown devices and actions the device cannot take', () => {
    const session = sessionWith([device({ canConnect: false })])

    expect(begin(session, 'missing', 'connect').error).toBe('unknown-device')
    expect(begin(session, 'headset', 'connect').error).toBe('unsupported')
    expect(begin(session, 'headset', 'disconnect').error).toBe('unsupported')
    expect(begin(session, 'headset', 'repair').error).toBe('unsupported')
  })

  it('gives every operation its own id and none to a refusal', () => {
    const first = begin(sessionWith([device(), device({ id: 'speaker', name: 'Speaker' })]), 'headset', 'connect')
    const second = begin(first.session, 'speaker', 'connect')

    expect(second.operationId).not.toBe(first.operationId)
    expect(begin(second.session, 'headset', 'connect').operationId).toBeNull()
  })
})

describe('settling device operations', () => {
  it('ends a connect when the Classic link is observed', () => {
    const { session } = begin(sessionWith([device()]), 'headset', 'connect')
    const settled = applyDeviceRead(session, confirmedRead([classicLinked()]), START + 1000)

    expect(publicDevice(settled)).toMatchObject({ pending: null, error: null, connected: true })
  })

  it('does not end a connect on an LE-only link', () => {
    const { session } = begin(sessionWith([device()]), 'headset', 'connect')
    const settled = applyDeviceRead(session, confirmedRead([device({ connected: true })]), START + 1000)

    expect(publicDevice(settled).pending).toBe('connect')
  })

  it('ends a disconnect when the Classic link drops even if LE stays up', () => {
    const { session } = begin(sessionWith([classicLinked()]), 'headset', 'disconnect')
    const settled = applyDeviceRead(session, confirmedRead([device({ connected: true })]), START + 1000)

    expect(publicDevice(settled).pending).toBeNull()
  })

  it('ends a remove only after two steady reads without the device', () => {
    const { session } = begin(sessionWith([device()]), 'headset', 'remove')
    const once = applyDeviceRead(session, confirmedRead([]), START + 1000)
    const twice = applyDeviceRead(once, confirmedRead([]), START + 2000)

    expect(composeBluetoothState(once).devices).toEqual([])
    expect(once.operations.headset).toBeDefined()
    expect(twice.operations.headset).toBeUndefined()
    expect(twice.errors.headset).toBeUndefined()
  })

  it('does not count reads taken while the Bluetooth stack is changing', () => {
    const { session } = begin(sessionWith([device()]), 'headset', 'remove')
    const transitional = applyDeviceRead(session, transitionalRead([]), START + 1000)
    const steady = applyDeviceRead(transitional, confirmedRead([]), START + 2000)

    expect(steady.operations.headset).toBeDefined()
  })

  it('restarts the removal count when the device comes back', () => {
    const { session } = begin(sessionWith([device()]), 'headset', 'remove')
    const gone = applyDeviceRead(session, confirmedRead([]), START + 1000)
    const back = applyDeviceRead(gone, confirmedRead([device()]), START + 2000)
    const goneAgain = applyDeviceRead(back, confirmedRead([]), START + 3000)

    expect(goneAgain.operations.headset).toBeDefined()
  })

  it('ends a repair when the audio services are back on', () => {
    const { session } = begin(sessionWith([device({ audioDisabled: true, canConnect: false })]), 'headset', 'repair')
    const settled = applyDeviceRead(session, confirmedRead([device()]), START + 5000)

    expect(publicDevice(settled).pending).toBeNull()
  })

  it.each(Object.entries(DEVICE_OPERATION_DEADLINE_MS))('times a %s out into its error', (action, deadline) => {
    const start = device({
      classicConnected: action === 'disconnect',
      connected: action === 'disconnect',
      audioDisabled: action === 'repair',
      canConnect: action !== 'repair',
    })
    const { session } = begin(sessionWith([start]), 'headset', action)

    expect(publicDevice(expireSession(session, START + deadline - 1)).pending).toBe(action)
    expect(publicDevice(expireSession(session, START + deadline))).toMatchObject({ pending: null, error: `${action}-failed` })
  })
})

describe('failDeviceOperation', () => {
  it('clears the pending operation and records the error', () => {
    const { session, operationId } = begin(sessionWith([device()]), 'headset', 'connect')
    const failed = failDeviceOperation(session, 'headset', operationId, 'connect-failed', START + 100)

    expect(publicDevice(failed)).toMatchObject({ pending: null, error: 'connect-failed' })
  })

  it('does nothing once the operation has already ended', () => {
    const { session, operationId } = begin(sessionWith([device()]), 'headset', 'connect')
    const connected = applyDeviceRead(session, confirmedRead([classicLinked()]), START + 1000)

    expect(failDeviceOperation(connected, 'headset', operationId, 'connect-failed', START + 1000)).toBe(connected)
  })

  it('leaves a newer operation alone when an older one fails late', () => {
    const { session: connecting, operationId: connectId } = begin(sessionWith([device()]), 'headset', 'connect')
    const connected = applyDeviceRead(connecting, confirmedRead([classicLinked()]), START + 1000)
    const { session: removing } = begin(connected, 'headset', 'remove', START + 2000)
    const late = failDeviceOperation(removing, 'headset', connectId, 'connect-failed', START + 15000)

    expect(publicDevice(late)).toMatchObject({ pending: 'remove', error: null })
  })

  it('lets the error expire', () => {
    const { session, operationId } = begin(sessionWith([device()]), 'headset', 'connect')
    const failed = failDeviceOperation(session, 'headset', operationId, 'connect-failed', START)

    expect(publicDevice(expireSession(failed, START + ERROR_VISIBLE_MS - 1)).error).toBe('connect-failed')
    expect(publicDevice(expireSession(failed, START + ERROR_VISIBLE_MS)).error).toBeNull()
  })

  it('drops a repair error once the audio services come back anyway', () => {
    const broken = device({ audioDisabled: true, canConnect: false })
    const { session, operationId } = begin(sessionWith([broken]), 'headset', 'repair')
    const failed = failDeviceOperation(session, 'headset', operationId, 'repair-cancelled', START)
    const recovered = applyDeviceRead(failed, confirmedRead([device()]), START + 1000)

    expect(publicDevice(recovered).error).toBeNull()
  })

  it('drops a connect error once the Classic link comes up anyway', () => {
    const deadline = START + DEVICE_OPERATION_DEADLINE_MS.connect
    const { session } = begin(sessionWith([device()]), 'headset', 'connect')
    const timedOut = expireSession(session, deadline)
    const recovered = applyDeviceRead(timedOut, confirmedRead([classicLinked()]), deadline + 1000)

    expect(publicDevice(timedOut).error).toBe('connect-failed')
    expect(publicDevice(recovered).error).toBeNull()
  })

  it('drops a disconnect error once the Classic link drops anyway', () => {
    const { session, operationId } = begin(sessionWith([classicLinked()]), 'headset', 'disconnect')
    const failed = applyDeviceRead(failDeviceOperation(session, 'headset', operationId, 'disconnect-failed', START), confirmedRead([classicLinked()]), START + 500)
    const recovered = applyDeviceRead(failed, confirmedRead([device()]), START + 1500)

    expect(publicDevice(failed).error).toBe('disconnect-failed')
    expect(publicDevice(recovered).error).toBeNull()
  })
})

describe('isCurrentOperation', () => {
  it('recognises only the operation the device is still waiting on', () => {
    const { session, operationId } = begin(sessionWith([device()]), 'headset', 'connect')

    expect(isCurrentOperation(session, 'headset', operationId)).toBe(true)
    expect(isCurrentOperation(session, 'headset', operationId + 1)).toBe(false)
    expect(isCurrentOperation(session, 'other', operationId)).toBe(false)
  })
})

describe('applyFailedRead', () => {
  it('keeps the devices available through a short run of failed reads', () => {
    const session = afterFailedReads(sessionWith([device()]), STALE_AFTER_FAILED_READS - 1)

    expect(composeBluetoothState(session).devicesAvailable).toBe(true)
  })

  it('marks the devices unavailable once reads keep failing, until a read succeeds', () => {
    const stale = afterFailedReads(sessionWith([device()]), STALE_AFTER_FAILED_READS)
    const recovered = applyDeviceRead(stale, confirmedRead([device()]), START + 5000)

    expect(composeBluetoothState(stale).devicesAvailable).toBe(false)
    expect(composeBluetoothState(recovered).devicesAvailable).toBe(true)
  })

  it('counts from zero again after a successful read', () => {
    const almostStale = afterFailedReads(sessionWith([device()]), STALE_AFTER_FAILED_READS - 1)
    const readAgain = applyDeviceRead(almostStale, confirmedRead([device()]), START + 1000)

    expect(composeBluetoothState(applyFailedRead(readAgain)).devicesAvailable).toBe(true)
  })
})

describe('radio changes', () => {
  const onSession = applyRadioRead(createSession(), 'on')

  it('stays pending until the radio reads back the target', () => {
    const { session } = beginRadioChange(onSession, 'off', START)

    expect(composeBluetoothState(session).radio).toEqual({ state: 'on', pending: 'off', error: null })
    expect(composeBluetoothState(applyRadioRead(session, 'off')).radio).toEqual({ state: 'off', pending: null, error: null })
  })

  it('refuses a second change while one is pending, and any change without a radio', () => {
    const { session } = beginRadioChange(onSession, 'off', START)

    expect(beginRadioChange(session, 'on', START).error).toBe('busy')
    expect(beginRadioChange(applyRadioRead(createSession(), 'unavailable'), 'on', START).error).toBe('unavailable')
  })

  it('reports a refused change as denied', () => {
    const { session } = beginRadioChange(onSession, 'off', START)
    const result = applyRadioSetResult(session, { state: 'on', error: 'denied' }, START)

    expect(composeBluetoothState(result).radio).toEqual({ state: 'on', pending: null, error: 'denied' })
  })

  it('reports a failed script as set-failed', () => {
    const { session } = beginRadioChange(onSession, 'off', START)

    expect(composeBluetoothState(applyRadioSetResult(session, null, START)).radio.error).toBe('set-failed')
    expect(composeBluetoothState(applyRadioSetResult(session, { state: null, error: 'timeout' }, START)).radio.error).toBe('set-failed')
  })

  it('keeps waiting when the read-back lags, then fails at the deadline', () => {
    const { session } = beginRadioChange(onSession, 'off', START)
    const lagging = applyRadioSetResult(session, { state: 'on', error: null }, START + 500)

    expect(composeBluetoothState(lagging).radio.pending).toBe('off')
    expect(composeBluetoothState(expireSession(lagging, START + RADIO_CHANGE_DEADLINE_MS)).radio).toMatchObject({ pending: null, error: 'set-failed' })
  })

  it('ignores a radio read that is not a known state', () => {
    expect(applyRadioRead(onSession, 'sideways')).toBe(onSession)
  })
})

describe('nextRadioRetryDelay', () => {
  it('starts short and doubles up to a ceiling', () => {
    const delays = [nextRadioRetryDelay(0)]
    while (delays.length < 6) delays.push(nextRadioRetryDelay(delays.at(-1)))

    expect(delays).toEqual([RADIO_RETRY_FIRST_MS, 10000, 20000, 40000, RADIO_RETRY_MAX_MS, RADIO_RETRY_MAX_MS])
  })
})

describe('composeBluetoothState', () => {
  it('only offers Disconnect for a Classic link', () => {
    const state = composeBluetoothState(sessionWith([device({ connected: true }), classicLinked({ id: 'b' })]))

    expect(state.devices.map((candidate) => candidate.canDisconnect)).toEqual([false, true])
  })

  it('offers Connect for an LE-only link but not once the Classic link is up', () => {
    const state = composeBluetoothState(sessionWith([device({ connected: true }), classicLinked({ id: 'b' })]))

    expect(state.devices.map((candidate) => candidate.canConnect)).toEqual([true, false])
  })

  it('reports whether devices could be read at all', () => {
    expect(composeBluetoothState(createSession()).devicesAvailable).toBe(false)
    expect(composeBluetoothState(sessionWith([])).devicesAvailable).toBe(true)
  })
})

describe('removalError', () => {
  it('succeeds when every transport was removed or was already gone', () => {
    expect(removalError({ classic: 'removed', le: 'absent' })).toBeNull()
    expect(removalError({ classic: 'removed', le: null })).toBeNull()
  })

  it('reports a partial removal when one transport stayed paired', () => {
    expect(removalError({ classic: 'removed', le: 'failed' })).toBe('remove-partial')
  })

  it('reports a failure when nothing was removed', () => {
    expect(removalError({ classic: 'failed', le: 'absent' })).toBe('remove-failed')
    expect(removalError({ classic: null, le: null, error: 'invalid-address' })).toBe('remove-failed')
    expect(removalError(null)).toBe('remove-failed')
  })
})

describe('stateKey', () => {
  const first = classicLinked({ id: 'a', name: 'Buds' })
  const second = device({ id: 'b', name: 'Speaker' })
  const base = sessionWith([first, second])

  it('changes when a second device connects while another stays connected', () => {
    const both = sessionWith([first, { ...second, classicConnected: true, connected: true }])

    expect(stateKey(composeBluetoothState(both))).not.toBe(stateKey(composeBluetoothState(base)))
  })

  it('changes when a connected device is renamed', () => {
    const renamed = sessionWith([{ ...first, name: 'New Buds' }, second])

    expect(stateKey(composeBluetoothState(renamed))).not.toBe(stateKey(composeBluetoothState(base)))
  })

  it('changes when an operation starts', () => {
    const { session } = begin(base, 'b', 'connect')

    expect(stateKey(composeBluetoothState(session))).not.toBe(stateKey(composeBluetoothState(base)))
  })

  it('changes when the device list goes stale', () => {
    const stale = afterFailedReads(base, STALE_AFTER_FAILED_READS)

    expect(stateKey(composeBluetoothState(stale))).not.toBe(stateKey(composeBluetoothState(base)))
  })
})

describe('repeated reads of an unchanged stack', () => {
  it('keeps the same session when the same devices are read again with nothing pending', () => {
    const devices = [device()]
    const session = applyDeviceRead(createSession(), confirmedRead(devices), START)

    expect(applyDeviceRead(session, confirmedRead(devices), START + 1000)).toBe(session)
  })

  it('still settles an operation when the same devices are read again', () => {
    const devices = [device()]
    const { session } = begin(applyDeviceRead(createSession(), confirmedRead(devices), START), 'headset', 'remove')
    const repeated = applyDeviceRead(session, confirmedRead(devices), START + 1000)

    expect(repeated).not.toBe(session)
    expect(repeated.operations.headset.action).toBe('remove')
  })

  it('adopts the devices a stack change held back on the next read', () => {
    const before = sessionWith([device()])
    const transitional = applyDeviceRead(before, transitionalRead(before.devices), START + 1000)
    const steady = applyDeviceRead(transitional, confirmedRead([device({ name: 'Renamed' })]), START + 2000)

    expect(steady.devices[0].name).toBe('Renamed')
  })

  it('leaves an idle session untouched when nothing can expire', () => {
    const session = sessionWith([device()])

    expect(expireSession(session, START + DEVICE_OPERATION_DEADLINE_MS.repair * 10)).toBe(session)
  })

  it('still expires a radio change that ran past its deadline', () => {
    const { session } = beginRadioChange(sessionWith([device()]), 'on', START)
    const expired = expireSession(session, START + RADIO_CHANGE_DEADLINE_MS)

    expect(expired.radio.pending).toBeNull()
    expect(expired.radio.error.kind).toBe('set-failed')
  })

  it('composes the same state from a kept session as from a rebuilt one', () => {
    const devices = [device()]
    const session = applyDeviceRead(createSession(), confirmedRead(devices), START)
    const rebuilt = { ...session, operations: {}, errors: {}, absentReads: {} }

    expect(stateKey(composeBluetoothState(applyDeviceRead(session, confirmedRead(devices), START + 1000))))
      .toBe(stateKey(composeBluetoothState(rebuilt)))
  })
})
