export const UNKNOWN_BLUETOOTH_STATE: BluetoothState = {
  radio: { state: 'unknown', pending: null, error: null },
  devices: [],
  devicesAvailable: false,
}

const PENDING_LABELS: Record<BluetoothDeviceOperation, string> = {
  connect: 'Connecting…',
  disconnect: 'Disconnecting…',
  remove: 'Removing…',
  repair: 'Turning audio on…',
}

const ERROR_LABELS: Record<BluetoothDeviceError, string> = {
  'connect-failed': "Couldn't connect",
  'disconnect-failed': "Couldn't disconnect",
  'remove-failed': "Couldn't remove",
  'remove-partial': 'Only partly removed',
  'repair-failed': "Couldn't turn audio on",
  'repair-cancelled': 'Audio repair cancelled',
}

const RADIO_ERROR_LABELS: Record<BluetoothRadioError, string> = {
  'set-failed': "Couldn't change Bluetooth",
  denied: 'Windows blocked the change',
}

function hasConnectedDevice(state: BluetoothState): boolean {
  return state.devicesAvailable && state.devices.some((device) => device.connected)
}

export function isRadioOff(state: BluetoothState): boolean {
  const { state: radioState, pending } = state.radio
  return pending === 'off' || (!pending && radioState === 'off')
}

export function displayedRadioOn(state: BluetoothState): boolean {
  const { state: radioState, pending } = state.radio
  if (pending) return pending === 'on'
  if (radioState === 'unknown') return hasConnectedDevice(state)
  return radioState === 'on'
}

export function canToggleRadio(state: BluetoothState): boolean {
  return !state.radio.pending && state.radio.state !== 'unavailable'
}

export function indicatorKind(state: BluetoothState): BluetoothIndicatorKind {
  const { state: radioState, pending } = state.radio
  if (isRadioOff(state) || (!pending && radioState === 'unavailable')) return 'off'
  if (!state.devicesAvailable) return 'neutral'
  if (hasConnectedDevice(state)) return 'connected'
  if (pending === 'on' || radioState === 'on') return 'on'
  return 'neutral'
}

export function connectedSummary(state: BluetoothState): string | undefined {
  if (isRadioOff(state) || !state.devicesAvailable) return undefined
  const connected = state.devices.filter((device) => device.connected)
  if (connected.length === 0) return undefined
  if (connected.length === 1) return connected[0].name
  return `${connected.length} connected`
}

export function nextDeviceAction(device: BluetoothDevice): BluetoothDeviceAction | null {
  if (device.pending) return null
  if (device.canDisconnect) return 'disconnect'
  if (device.canConnect) return 'connect'
  return null
}

export function deviceStatusLabel(device: BluetoothDevice): string {
  if (device.pending) return PENDING_LABELS[device.pending]
  if (device.error) return ERROR_LABELS[device.error]
  if (device.audioDisabled) return 'Audio turned off'
  if (device.connected && device.canConnect) return 'Connected, no audio'
  return device.connected ? 'Connected' : 'Paired'
}

export function deviceActionLabel(device: BluetoothDevice): string {
  const action = nextDeviceAction(device)
  if (action === 'connect') return `Connect ${device.name}`
  if (action === 'disconnect') return `Disconnect ${device.name}`
  return `${device.name}, ${deviceStatusLabel(device)}`
}

export function radioEmptyStateTitle(state: BluetoothState): string | null {
  const { state: radioState, pending } = state.radio
  if (isRadioOff(state)) return 'Bluetooth off'
  if (!pending && radioState === 'unavailable') return 'No Bluetooth adapter'
  if (!state.devicesAvailable) return radioState === 'unknown' ? 'Checking Bluetooth…' : 'Bluetooth status unavailable'
  if (state.devices.length > 0) return null
  return radioState === 'unknown' && !pending ? 'Checking Bluetooth…' : 'No paired devices'
}

export function radioErrorLabel(error: BluetoothRadioError | null): string | null {
  return error ? RADIO_ERROR_LABELS[error] : null
}
