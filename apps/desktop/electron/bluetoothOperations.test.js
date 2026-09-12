import { describe, it, expect } from 'vitest'
import {
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
  pendingAction,
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
})

describe('settling device operations', () => {
  it('ends a connect when the Classic link is observed', () => {
    const { session } = begin(sessionWith([device()]), 'headset', 'connect')
    const settled = applyDeviceRead(session, confirmedRead([device({ classicConnected: true, connected: true })]), START + 1000)

    expect(publicDevice(settled)).toMatchObject({ pending: null, error: null, connected: true })
  })

  it('does not end a connect on an LE-only link', () => {
    const { session } = begin(sessionWith([device()]), 'headset', 'connect')
    const settled = applyDeviceRead(session, confirmedRead([device({ connected: true })]), START + 1000)

    expect(publicDevice(settled).pending).toBe('connect')
  })

  it('ends a disconnect when the Classic link drops even if LE stays up', () => {
    const connected = device({ classicConnected: true, connected: true })
    const { session } = begin(sessionWith([connected]), 'headset', 'disconnect')
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
    const { session } = begin(sessionWith([device()]), 'headset', 'connect')
    const failed = failDeviceOperation(session, 'headset', 'connect-failed', START + 100)

    expect(publicDevice(failed)).toMatchObject({ pending: null, error: 'connect-failed' })
  })

  it('does nothing once the operation has already ended', () => {
    const session = sessionWith([device()])

    expect(failDeviceOperation(session, 'headset', 'connect-failed', START)).toBe(session)
  })

  it('lets the error expire', () => {
    const { session } = begin(sessionWith([device()]), 'headset', 'connect')
    const failed = failDeviceOperation(session, 'headset', 'connect-failed', START)

    expect(publicDevice(expireSession(failed, START + ERROR_VISIBLE_MS - 1)).error).toBe('connect-failed')
    expect(publicDevice(expireSession(failed, START + ERROR_VISIBLE_MS)).error).toBeNull()
  })

  it('drops a repair error once the audio services come back anyway', () => {
    const broken = device({ audioDisabled: true, canConnect: false })
    const { session } = begin(sessionWith([broken]), 'headset', 'repair')
    const failed = failDeviceOperation(session, 'headset', 'repair-cancelled', START)
    const recovered = applyDeviceRead(failed, confirmedRead([device()]), START + 1000)

    expect(publicDevice(recovered).error).toBeNull()
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

describe('composeBluetoothState', () => {
  it('only offers Disconnect for a Classic link', () => {
    const state = composeBluetoothState(sessionWith([device({ connected: true }), device({ id: 'b', classicConnected: true, connected: true })]))

    expect(state.devices.map((candidate) => candidate.canDisconnect)).toEqual([false, true])
  })

  it('reports whether devices could be read at all', () => {
    expect(composeBluetoothState(createSession()).devicesAvailable).toBe(false)
    expect(composeBluetoothState(sessionWith([])).devicesAvailable).toBe(true)
  })
})

describe('pendingAction', () => {
  it('names the operation a device is waiting on', () => {
    const { session } = begin(sessionWith([device()]), 'headset', 'connect')

    expect(pendingAction(session, 'headset')).toBe('connect')
    expect(pendingAction(session, 'other')).toBeNull()
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
  const first = device({ id: 'a', name: 'Buds', classicConnected: true, connected: true })
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
})
