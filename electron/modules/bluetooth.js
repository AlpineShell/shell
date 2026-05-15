const { runPowerShell } = require('../powershell')
const { exec } = require('child_process')
const { app } = require('electron')
const path = require('path')

const scriptsDir = app.isPackaged
  ? path.join(process.resourcesPath, 'scripts')
  : path.join(__dirname, '..', 'scripts')
const scanScriptPath = path.join(scriptsDir, 'bluetoothScan.ps1')
const toggleScriptPath = path.join(scriptsDir, 'bluetoothToggle.ps1')
const radioScriptPath = path.join(scriptsDir, 'bluetoothRadio.ps1')

let lastState = undefined
let cachedState = { enabled: false, connected: false, devices: [] }
let broadcastRef = null

function isRadioEnabled() {
  return runPowerShell(
    "((Get-PnpDevice -Class Bluetooth -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'OK' }).Count -gt 0)"
  ).then((output) => output === 'True')
}

function getConnectedDevices() {
  return new Promise((resolve) => {
    exec(
      `powershell -NoProfile -ExecutionPolicy Bypass -File "${scanScriptPath}"`,
      (err, stdout) => {
        if (err || !stdout) return resolve([])
        try {
          const parsed = JSON.parse(stdout.trim())
          const list = Array.isArray(parsed) ? parsed : [parsed]
          const names = list.filter((d) => d.connected).map((d) => d.name)
          resolve([...new Set(names)])
        } catch {
          resolve([])
        }
      }
    )
  })
}

async function getBluetoothState() {
  const enabled = await isRadioEnabled()
  if (!enabled) return { enabled: false, connected: false, devices: [] }

  const devices = await getConnectedDevices()
  return { enabled: true, connected: devices.length > 0, devices }
}

function scanBluetoothDevices() {
  return new Promise((resolve) => {
    exec(
      `powershell -NoProfile -ExecutionPolicy Bypass -File "${scanScriptPath}"`,
      (err, stdout) => {
        if (err || !stdout) return resolve([])
        try {
          const parsed = JSON.parse(stdout.trim())
          resolve(Array.isArray(parsed) ? parsed : [parsed])
        } catch {
          resolve([])
        }
      }
    )
  })
}

function toggleBluetoothDevice(instanceId, action) {
  return new Promise((resolve) => {
    exec(
      `powershell -NoProfile -ExecutionPolicy Bypass -File "${toggleScriptPath}" -InstanceId "${instanceId}" -Action "${action}"`,
      (err, stdout) => {
        if (err || !stdout) return resolve({ success: false })
        try {
          resolve(JSON.parse(stdout.trim()))
        } catch {
          resolve({ success: false })
        }
      }
    )
  })
}

function openBluetoothPairing() {
  exec('DevicePairingWizard.exe')
}

function setBluetoothRadio(action) {
  return new Promise((resolve) => {
    exec(
      `powershell -NoProfile -ExecutionPolicy Bypass -File "${radioScriptPath}" -Action "${action}"`,
      (err, stdout) => {
        if (err || !stdout) return resolve({ success: false })
        try { resolve(JSON.parse(stdout.trim())) } catch { resolve({ success: false }) }
      }
    )
  })
}

module.exports = {
  handlers: {
    'system/bluetooth': () => cachedState,
    'system/bluetooth-scan': () => scanBluetoothDevices(),
    'system/bluetooth-toggle': async (_event, { instanceId, action }) => {
      const result = await toggleBluetoothDevice(instanceId, action)
      const delay = action === 'disconnect' ? 1500 : 3000
      setTimeout(async () => {
        const [state, devices] = await Promise.all([
          getBluetoothState(),
          scanBluetoothDevices(),
        ])
        cachedState = state
        lastState = `${state.enabled}:${state.connected}`
        broadcastRef?.('system/bluetooth-changed', state)
        broadcastRef?.('system/bluetooth-devices-changed', devices)
      }, delay)
      return result
    },
    'system/bluetooth-settings': () => openBluetoothPairing(),
    'system/bluetooth-set-radio': async (_event, enabled) => {
      const result = await setBluetoothRadio(enabled ? 'on' : 'off')
      setTimeout(async () => {
        const state = await getBluetoothState()
        cachedState = state
        lastState = `${state.enabled}:${state.connected}`
        broadcastRef?.('system/bluetooth-changed', state)
      }, 1500)
      return result
    },
  },

  start(broadcast) {
    broadcastRef = broadcast
    async function poll() {
      const current = await getBluetoothState()
      cachedState = current
      const key = `${current.enabled}:${current.connected}`
      if (key !== lastState) {
        lastState = key
        broadcast('system/bluetooth-changed', current)
      }
    }
    poll()
    setInterval(poll, 5000)
  },
}
