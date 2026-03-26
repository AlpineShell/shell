const { runPowerShell } = require('../powershell')
const { exec } = require('child_process')
const path = require('path')

const scanScriptPath = path.join(__dirname, '..', 'scripts', 'bluetoothScan.ps1')
const toggleScriptPath = path.join(__dirname, '..', 'scripts', 'bluetoothToggle.ps1')

let lastState = undefined
let broadcastRef = null

function isRadioEnabled() {
  return runPowerShell(
    "((Get-PnpDevice -Class Bluetooth -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'OK' }).Count -gt 0)"
  ).then((output) => output === 'True')
}

function getConnectedDevices() {
  return runPowerShell(
    "$ag=@('0000110B','0000111E','0000110E','0000110C');$svcs=Get-PnpDevice -Class Bluetooth -ErrorAction SilentlyContinue | Where-Object { $_.InstanceId -match 'BTHENUM' -and $_.InstanceId -notmatch '^BTHENUM\\\\Dev_' -and $_.Status -eq 'OK' };$hexes=@{};foreach($s in $svcs){foreach($g in $ag){if($s.InstanceId -match $g -and $s.InstanceId -match '([0-9a-fA-F]{12})'){$hexes[$Matches[1]]=$true;break}}};Get-PnpDevice -Class Bluetooth -ErrorAction SilentlyContinue | Where-Object { $_.InstanceId -match '^BTHENUM\\\\Dev_([0-9a-fA-F]{12})' -and $hexes[$Matches[1]] } | Select-Object -ExpandProperty FriendlyName"
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
    'system/bluetooth-toggle': async (_event, { instanceId, action }) => {
      const result = await toggleBluetoothDevice(instanceId, action)
      const delay = action === 'disconnect' ? 1500 : 3000
      setTimeout(async () => {
        const [state, devices] = await Promise.all([
          getBluetoothState(),
          scanBluetoothDevices(),
        ])
        lastState = `${state.enabled}:${state.connected}`
        broadcastRef?.('system/bluetooth-changed', state)
        broadcastRef?.('system/bluetooth-devices-changed', devices)
      }, delay)
      return result
    },
    'system/bluetooth-settings': () => openBluetoothPairing(),
  },

  start(broadcast) {
    broadcastRef = broadcast
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
