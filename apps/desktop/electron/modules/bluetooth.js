const { exec } = require('child_process')
const { app } = require('electron')
const path = require('path')
const { singleFlight } = require('../singleFlight')

const scriptsDir = app.isPackaged
  ? path.join(process.resourcesPath, 'scripts')
  : path.join(__dirname, '..', 'scripts')
const scanScriptPath = path.join(scriptsDir, 'bluetoothScan.ps1')
const toggleScriptPath = path.join(scriptsDir, 'bluetoothToggle.ps1')
const radioScriptPath = path.join(scriptsDir, 'bluetoothRadio.ps1')
const unpairScriptPath = path.join(scriptsDir, 'bluetoothUnpair.ps1')

const BLUETOOTH_REFRESH_INTERVAL_MS = 5000
const POST_DISCONNECT_REFRESH_MS = 1500
const POST_CONNECT_REFRESH_MS = 3000

let lastState = undefined
let lastDevicesKey = undefined
let cachedState = { enabled: false, connected: false, devices: [] }
let cachedDevices = []
let broadcastRef = null

function runBluetoothScript(scriptFile, args = '') {
  return new Promise((resolve) => {
    exec(
      `powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptFile}" ${args}`,
      (err, stdout) => resolve(err || !stdout ? null : stdout.trim())
    )
  })
}

function parseJsonOutput(output, fallback) {
  if (!output) return fallback
  try {
    return JSON.parse(output)
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
  const parsed = parseJsonOutput(await runBluetoothScript(scanScriptPath, '-WithRadio'), null)
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

function logRefreshFailure(error) {
  console.error('[bluetooth] refresh failed:', error.message)
}

function refreshBluetoothQuietly() {
  refreshBluetooth().catch(logRefreshFailure)
}

function scanAfterCurrentScan() {
  if (refreshBluetooth.isPending()) return refreshBluetooth().then(refreshBluetooth)
  return refreshBluetooth()
}

function refreshBluetoothAfter(delayMs) {
  setTimeout(() => scanAfterCurrentScan().catch(logRefreshFailure), delayMs)
}

async function toggleBluetoothDevice(instanceId, action) {
  const output = await runBluetoothScript(toggleScriptPath, `-InstanceId "${instanceId}" -Action "${action}"`)
  return parseJsonOutput(output, { success: false })
}

function openBluetoothPairing() {
  exec('DevicePairingWizard.exe')
}

async function unpairBluetoothDevice(instanceId) {
  const output = await runBluetoothScript(unpairScriptPath, `-InstanceId "${instanceId}"`)
  return parseJsonOutput(output, { success: false })
}

async function setBluetoothRadio(action) {
  const output = await runBluetoothScript(radioScriptPath, `-Action "${action}"`)
  return parseJsonOutput(output, { success: false })
}

module.exports = {
  handlers: {
    'system/bluetooth': () => cachedState,
    'system/bluetooth-devices': () => cachedDevices,
    'system/bluetooth-scan': () => refreshBluetooth(),
    'system/bluetooth-toggle': async (_event, { instanceId, action }) => {
      const result = await toggleBluetoothDevice(instanceId, action)
      refreshBluetoothAfter(action === 'disconnect' ? POST_DISCONNECT_REFRESH_MS : POST_CONNECT_REFRESH_MS)
      return result
    },
    'system/bluetooth-settings': () => openBluetoothPairing(),
    'system/bluetooth-unpair': async (_event, instanceId) => {
      const result = await unpairBluetoothDevice(instanceId)
      refreshBluetoothAfter(POST_DISCONNECT_REFRESH_MS)
      return result
    },
    'system/bluetooth-set-radio': async (_event, enabled) => {
      const result = await setBluetoothRadio(enabled ? 'on' : 'off')
      refreshBluetoothAfter(POST_DISCONNECT_REFRESH_MS)
      return result
    },
  },

  start(broadcast) {
    broadcastRef = broadcast
    const { ipcMain } = require('electron')
    ipcMain.on('system/bluetooth-init', (event) => {
      event.returnValue = cachedState
    })
    refreshBluetoothQuietly()
    const pollTimer = setInterval(refreshBluetoothQuietly, BLUETOOTH_REFRESH_INTERVAL_MS)
    app.on('will-quit', () => clearInterval(pollTimer))
  },
}
