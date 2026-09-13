import { useShellState } from './useShellState'
import { UNKNOWN_BLUETOOTH_STATE, nextDeviceAction } from '../lib/bluetoothPresentation'

function toggleDevice(device: BluetoothDevice): Promise<BluetoothActionResult> {
  const action = nextDeviceAction(device)
  if (action === 'connect') return window.shell.system.bluetoothConnect(device.id)
  if (action === 'disconnect') return window.shell.system.bluetoothDisconnect(device.id)
  return Promise.resolve({ accepted: false, error: 'unsupported' })
}

function setRadio(on: boolean): Promise<BluetoothActionResult> {
  return window.shell.system.bluetoothSetRadio(on)
}

function openPairing(): Promise<BluetoothActionResult> {
  return window.shell.system.bluetoothOpenSettings()
}

function removeDevice(device: BluetoothDevice): Promise<BluetoothActionResult> {
  return window.shell.system.bluetoothRemove(device.id)
}

function repairAudio(device: BluetoothDevice): Promise<BluetoothActionResult> {
  return window.shell.system.bluetoothRepairAudio(device.id)
}

const BLUETOOTH_ACTIONS = { toggleDevice, setRadio, openPairing, removeDevice, repairAudio }

export function useBluetooth() {
  const state = useShellState<BluetoothState>(
    window.alpineBoot?.bluetooth() ?? UNKNOWN_BLUETOOTH_STATE,
    window.shell.system.bluetooth,
    window.shell.system.onBluetoothChanged
  )
  return { state, ...BLUETOOTH_ACTIONS }
}
