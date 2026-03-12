const { runPowerShell } = require('../powershell')

let lastState = undefined

function isRadioEnabled() {
  return runPowerShell(
    "((Get-PnpDevice -Class Bluetooth -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'OK' }).Count -gt 0)"
  ).then((output) => output === 'True')
}

function getConnectedDevices() {
  return runPowerShell(
    "Get-PnpDevice -Class Bluetooth -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'OK' -and $_.InstanceId -match '^BTHENUM\\\\Dev_' } | Select-Object -ExpandProperty FriendlyName"
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

module.exports = {
  handlers: {
    'system/bluetooth': () => getBluetoothState(),
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
