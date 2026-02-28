const { exec } = require('child_process')

let lastState = undefined

function getRadioEnabled() {
  return new Promise((resolve) => {
    exec(
      'powershell -NoProfile -Command "((Get-PnpDevice -Class Bluetooth -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq \'OK\' }).Count -gt 0)"',
      (err, stdout) => resolve(!err && stdout.trim() === 'True')
    )
  })
}

const SYSTEM_PATTERNS = [
  /Microsoft/i,
  /RFCOMM/i,
  /Enumerator/i,
  /Auflistung/i,
  /Bluetooth Device/i,
  /TP-Link Bluetooth/i,
]

function getConnectedDevices() {
  return new Promise((resolve) => {
    exec(
      'powershell -NoProfile -Command "Get-PnpDevice -Class Bluetooth -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq \'OK\' } | Select-Object -ExpandProperty Name"',
      (err, stdout) => {
        if (err || !stdout.trim()) return resolve(false)
        const devices = stdout.trim().split('\n').map(d => d.trim()).filter(Boolean)
        const userDevices = devices.filter(name => !SYSTEM_PATTERNS.some(p => p.test(name)))
        resolve(userDevices.length > 0)
      }
    )
  })
}

async function getBluetoothState() {
  const enabled = await getRadioEnabled()
  if (!enabled) return { enabled: false, connected: false }

  const connected = await getConnectedDevices()
  return { enabled: true, connected }
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
