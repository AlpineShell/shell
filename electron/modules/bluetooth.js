const { runPowerShell } = require('../powershell')
const { exec } = require('child_process')
const path = require('path')

const scanScriptPath = path.join(__dirname, '..', 'scripts', 'bluetoothScan.ps1')
const toggleScriptPath = path.join(__dirname, '..', 'scripts', 'bluetoothToggle.ps1')

let lastState = undefined

function isRadioEnabled() {
  return runPowerShell(
    "((Get-PnpDevice -Class Bluetooth -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'OK' }).Count -gt 0)"
  ).then((output) => output === 'True')
}

function getConnectedDevices() {
  return runPowerShell(
    "$d=0x02000000;Get-PnpDevice -Class Bluetooth -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'OK' -and $_.InstanceId -match '^BTHENUM\\\\Dev_' } | Where-Object { -not ((Get-PnpDeviceProperty -InstanceId $_.InstanceId -KeyName 'DEVPKEY_Device_DevNodeStatus' -ErrorAction SilentlyContinue).Data -band $d) } | Select-Object -ExpandProperty FriendlyName"
  ).then((output) => {
    if (!output) return []
    return [...new Set(output.split('\n').map(d => d.trim()).filter(Boolean))]
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

module.exports = {
  handlers: {
    'system/bluetooth': () => getBluetoothState(),
    'system/bluetooth-scan': () => scanBluetoothDevices(),
    'system/bluetooth-toggle': (_event, { instanceId, action }) => toggleBluetoothDevice(instanceId, action),
    'system/bluetooth-settings': () => openBluetoothPairing(),
  },

  start(broadcast) {
    setInterval(async () => {
      const current = await getBluetoothState()
      const key = `${current.enabled}:${current.connected}`
      if (key !== lastState) {
        lastState = key
        broadcast('system/bluetooth-changed', current)
      }
    }, 5000)
  },
}
