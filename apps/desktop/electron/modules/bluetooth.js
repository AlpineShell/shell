const { exec } = require('child_process')
const { app } = require('electron')
const path = require('path')
const { createPersistentRunner, createInteractiveRunner } = require('../powershell')
const { singleFlight } = require('../singleFlight')

const scriptsDir = app.isPackaged
  ? path.join(process.resourcesPath, 'scripts')
  : path.join(__dirname, '..', 'scripts')
const scanScriptPath = path.join(scriptsDir, 'bluetoothScan.ps1')
const toggleScriptPath = path.join(scriptsDir, 'bluetoothToggle.ps1')
const radioScriptPath = path.join(scriptsDir, 'bluetoothRadio.ps1')
const unpairScriptPath = path.join(scriptsDir, 'bluetoothUnpair.ps1')

const BLUETOOTH_SCRIPT_TIMEOUT_MS = 45000
const BLUETOOTH_REFRESH_INTERVAL_MS = 5000

const scanRunner = createPersistentRunner(undefined, BLUETOOTH_SCRIPT_TIMEOUT_MS)
const actionRunner = createInteractiveRunner(undefined, BLUETOOTH_SCRIPT_TIMEOUT_MS)

let lastState = undefined
let lastDevicesKey = undefined
let cachedState = { enabled: false, connected: false, devices: [] }
let cachedDevices = []
let broadcastRef = null

function runBluetoothScript(runner, scriptFile, args) {
  return runner.run(`& "${scriptFile}" ${args}`)
}

function parseJsonOutput(output, fallback) {
  if (!output) return fallback
  try {
    return JSON.parse(output.trim())
  } catch {
    return fallback
  }
}

function toDeviceArray(raw) {
  if (Array.isArray(raw)) return raw
  return raw ? [raw] : []
}

function deviceRank(device) {
  if (device.connected) return 0
  return device.paired ? 1 : 2
}

function inStableOrder(devices) {
  return [...devices].sort(
    (a, b) =>
      deviceRank(a) - deviceRank(b) ||
      `${a.name ?? ''}`.localeCompare(`${b.name ?? ''}`) ||
      `${a.instanceId ?? ''}`.localeCompare(`${b.instanceId ?? ''}`)
  )
}

async function fetchRadioAndDevices() {
  const output = await runBluetoothScript(scanRunner, scanScriptPath, '-WithRadio')
  const parsed = parseJsonOutput(output, null)
  if (!parsed) return null
  return { enabled: parsed.enabled === true, devices: inStableOrder(toDeviceArray(parsed.devices)) }
}

function toBluetoothState(enabled, devices) {
  if (!enabled) return { enabled: false, connected: false, devices: [] }
  const connectedNames = [...new Set(devices.filter((d) => d.connected).map((d) => d.name))]
  return { enabled: true, connected: connectedNames.length > 0, devices: connectedNames }
}

function publishBluetooth() {
  const stateKey = `${cachedState.enabled}:${cachedState.connected}`
  if (stateKey !== lastState) {
    lastState = stateKey
    broadcastRef?.('system/bluetooth-changed', cachedState)
  }
  const devicesKey = JSON.stringify(cachedDevices)
  if (devicesKey !== lastDevicesKey) {
    lastDevicesKey = devicesKey
    broadcastRef?.('system/bluetooth-devices-changed', cachedDevices)
  }
}

const refreshBluetooth = singleFlight(async () => {
  const scan = await fetchRadioAndDevices()
  if (!scan) return cachedDevices
  cachedDevices = scan.devices
  cachedState = toBluetoothState(scan.enabled, scan.devices)
  publishBluetooth()
  return cachedDevices
})

function scanAfterCurrentScan() {
  if (refreshBluetooth.isPending()) return refreshBluetooth().then(refreshBluetooth)
  return refreshBluetooth()
}

function refreshBluetoothAfter(delayMs) {
  setTimeout(scanAfterCurrentScan, delayMs)
}

async function toggleBluetoothDevice(instanceId, action) {
  const output = await runBluetoothScript(
    actionRunner,
    toggleScriptPath,
    `-InstanceId "${instanceId}" -Action "${action}"`
  )
  return parseJsonOutput(output, { success: false })
}

function openBluetoothPairing() {
  exec('DevicePairingWizard.exe')
}

async function unpairBluetoothDevice(instanceId) {
  const output = await runBluetoothScript(actionRunner, unpairScriptPath, `-InstanceId "${instanceId}"`)
  return parseJsonOutput(output, { success: false })
}

async function setBluetoothRadio(action) {
  const output = await runBluetoothScript(actionRunner, radioScriptPath, `-Action "${action}"`)
  return parseJsonOutput(output, { success: false })
}

module.exports = {
  handlers: {
    'system/bluetooth': () => cachedState,
    'system/bluetooth-devices': () => cachedDevices,
    'system/bluetooth-scan': () => refreshBluetooth(),
    'system/bluetooth-toggle': async (_event, { instanceId, action }) => {
      const result = await toggleBluetoothDevice(instanceId, action)
      refreshBluetoothAfter(action === 'disconnect' ? 1500 : 3000)
      return result
    },
    'system/bluetooth-settings': () => openBluetoothPairing(),
    'system/bluetooth-unpair': async (_event, instanceId) => {
      const result = await unpairBluetoothDevice(instanceId)
      refreshBluetoothAfter(1500)
      return result
    },
    'system/bluetooth-set-radio': async (_event, enabled) => {
      const result = await setBluetoothRadio(enabled ? 'on' : 'off')
      refreshBluetoothAfter(1500)
      return result
    },
  },

  start(broadcast) {
    broadcastRef = broadcast
    const { ipcMain } = require('electron')
    ipcMain.on('system/bluetooth-init', (event) => {
      event.returnValue = cachedState
    })
    refreshBluetooth()
    const pollTimer = setInterval(refreshBluetooth, BLUETOOTH_REFRESH_INTERVAL_MS)
    app.on('will-quit', () => {
      clearInterval(pollTimer)
      scanRunner.dispose()
      actionRunner.dispose()
    })
  },
}
