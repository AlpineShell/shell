import { describe, it, expect } from 'vitest'
import {
  UNKNOWN_BLUETOOTH_STATE,
  canToggleRadio,
  connectedSummary,
  deviceActionLabel,
  deviceStatusLabel,
  displayedRadioOn,
  indicatorKind,
  isRadioOff,
  nextDeviceAction,
  radioEmptyStateTitle,
  radioErrorLabel,
} from './bluetoothPresentation'

function device(overrides: Partial<BluetoothDevice> = {}): BluetoothDevice {
  return {
    id: 'headset',
    name: 'Headset',
    kind: 'headphones',
    connected: false,
    canConnect: true,
    canDisconnect: false,
    audioDisabled: false,
    pending: null,
    error: null,
    ...overrides,
  }
}

function state(radio: Partial<BluetoothRadio>, devices: BluetoothDevice[] = [], devicesAvailable = true): BluetoothState {
  return { radio: { state: 'on', pending: null, error: null, ...radio }, devices, devicesAvailable }
}

const connected = device({ connected: true, canConnect: false, canDisconnect: true })
const linkedWithoutAudio = device({ connected: true, canConnect: true, canDisconnect: false })

describe('indicatorKind', () => {
  it('shows a connection even before the radio has been read', () => {
    expect(indicatorKind(state({ state: 'unknown' }, [connected]))).toBe('connected')
  })

  it('stays neutral while nothing is known', () => {
    expect(indicatorKind(state({ state: 'unknown' }, [device()]))).toBe('neutral')
    expect(indicatorKind(UNKNOWN_BLUETOOTH_STATE)).toBe('neutral')
  })

  it('shows off for an off or missing radio and while switching off', () => {
    expect(indicatorKind(state({ state: 'off' }))).toBe('off')
    expect(indicatorKind(state({ state: 'unavailable' }))).toBe('off')
    expect(indicatorKind(state({ state: 'on', pending: 'off' }, [connected]))).toBe('off')
  })

  it('stays neutral when the device list cannot be read', () => {
    expect(indicatorKind(state({ state: 'on' }, [], false))).toBe('neutral')
  })

  it('shows on for an on radio with nothing connected', () => {
    expect(indicatorKind(state({ state: 'on' }, [device()]))).toBe('on')
    expect(indicatorKind(state({ state: 'off', pending: 'on' }))).toBe('on')
  })
})

describe('displayedRadioOn and isRadioOff', () => {
  it('follow the pending target while a change is in flight', () => {
    expect(displayedRadioOn(state({ state: 'off', pending: 'on' }))).toBe(true)
    expect(displayedRadioOn(state({ state: 'on', pending: 'off' }))).toBe(false)
    expect(isRadioOff(state({ state: 'on', pending: 'off' }))).toBe(true)
  })

  it('treat an unknown radio as on only when something is connected', () => {
    expect(displayedRadioOn(state({ state: 'unknown' }, [connected]))).toBe(true)
    expect(displayedRadioOn(state({ state: 'unknown' }, [device()]))).toBe(false)
    expect(isRadioOff(state({ state: 'unknown' }))).toBe(false)
  })

  it('do not trust a connection from a device list that went stale', () => {
    expect(displayedRadioOn(state({ state: 'unknown' }, [connected], false))).toBe(false)
  })
})

describe('canToggleRadio', () => {
  it('refuses while a change is pending or without a radio', () => {
    expect(canToggleRadio(state({ state: 'on' }))).toBe(true)
    expect(canToggleRadio(state({ state: 'on', pending: 'off' }))).toBe(false)
    expect(canToggleRadio(state({ state: 'unavailable' }))).toBe(false)
  })
})

describe('connectedSummary', () => {
  it('names one connected device and counts several, including two with the same name', () => {
    expect(connectedSummary(state({}, [device()]))).toBeUndefined()
    expect(connectedSummary(state({}, [connected]))).toBe('Headset')
    expect(connectedSummary(state({}, [connected, { ...connected, id: 'twin' }]))).toBe('2 connected')
  })

  it('says nothing while Bluetooth is off or the device list went stale', () => {
    expect(connectedSummary(state({ state: 'off' }, [connected]))).toBeUndefined()
    expect(connectedSummary(state({ state: 'on' }, [connected], false))).toBeUndefined()
  })
})

describe('nextDeviceAction', () => {
  it('offers connect or disconnect according to what the device can do', () => {
    expect(nextDeviceAction(device())).toBe('connect')
    expect(nextDeviceAction(connected)).toBe('disconnect')
    expect(nextDeviceAction(device({ canConnect: false }))).toBeNull()
    expect(nextDeviceAction(device({ connected: true, canConnect: false, canDisconnect: false }))).toBeNull()
  })

  it('offers connect for a device that is linked without its audio', () => {
    expect(nextDeviceAction(linkedWithoutAudio)).toBe('connect')
  })

  it('offers nothing while an operation is pending', () => {
    expect(nextDeviceAction(device({ pending: 'connect' }))).toBeNull()
  })
})

describe('deviceStatusLabel', () => {
  it('uses one ellipsis character for every pending operation', () => {
    const operations: BluetoothDeviceOperation[] = ['connect', 'disconnect', 'remove', 'repair']
    for (const pending of operations) {
      const label = deviceStatusLabel(device({ pending }))
      expect(label.endsWith('…')).toBe(true)
      expect(label).not.toContain('...')
    }
  })

  it('has a label for every error', () => {
    const errors: BluetoothDeviceError[] = ['connect-failed', 'disconnect-failed', 'remove-failed', 'remove-partial', 'repair-failed', 'repair-cancelled']
    for (const error of errors) expect(deviceStatusLabel(device({ error }))).toBeTruthy()
  })

  it('reports turned-off audio, then the connection', () => {
    expect(deviceStatusLabel(device({ audioDisabled: true, canConnect: false }))).toBe('Audio turned off')
    expect(deviceStatusLabel(connected)).toBe('Connected')
    expect(deviceStatusLabel(linkedWithoutAudio)).toBe('Connected, no audio')
    expect(deviceStatusLabel(device())).toBe('Paired')
  })
})

describe('deviceActionLabel', () => {
  it('names the action, or the state when there is none', () => {
    expect(deviceActionLabel(device())).toBe('Connect Headset')
    expect(deviceActionLabel(connected)).toBe('Disconnect Headset')
    expect(deviceActionLabel(device({ canConnect: false }))).toBe('Headset, Paired')
  })
})

describe('radioEmptyStateTitle', () => {
  it('explains why no list is shown', () => {
    expect(radioEmptyStateTitle(state({ state: 'off' }, [device()]))).toBe('Bluetooth off')
    expect(radioEmptyStateTitle(state({ state: 'unavailable' }))).toBe('No Bluetooth adapter')
    expect(radioEmptyStateTitle(state({ state: 'unknown' }))).toBe('Checking Bluetooth…')
    expect(radioEmptyStateTitle(state({ state: 'on' }, [], false))).toBe('Bluetooth status unavailable')
    expect(radioEmptyStateTitle(state({ state: 'on' }))).toBe('No paired devices')
  })

  it('shows the list whenever there are devices and the radio is not off', () => {
    expect(radioEmptyStateTitle(state({ state: 'on' }, [device()]))).toBeNull()
    expect(radioEmptyStateTitle(state({ state: 'unknown' }, [device()]))).toBeNull()
  })
})

describe('radioErrorLabel', () => {
  it('describes each radio error', () => {
    expect(radioErrorLabel(null)).toBeNull()
    expect(radioErrorLabel('denied')).toBe('Windows blocked the change')
    expect(radioErrorLabel('set-failed')).toBe("Couldn't change Bluetooth")
  })
})
