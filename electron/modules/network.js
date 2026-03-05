const { exec } = require('child_process')

let lastSignal = undefined
let lastType = undefined

function getAdapterStatus() {
  return new Promise((resolve) => {
    exec(
      'powershell -NoProfile -Command "Get-NetAdapter | Where-Object { $_.Name -match \'Wi-?Fi|WLAN\' } | Where-Object { $_.Status -eq \'Up\' } | Select-Object -First 1 -ExpandProperty Status"',
      (err, stdout) => {
        resolve(!err && stdout.trim() === 'Up')
      }
    )
  })
}

function getEthernetStatus() {
  return new Promise((resolve) => {
    exec(
      'powershell -NoProfile -Command "Get-NetAdapter | Where-Object { $_.Name -match \'Ethernet|LAN\' -and $_.PhysicalMediaType -ne \'Unspecified\' } | Where-Object { $_.Status -eq \'Up\' } | Select-Object -First 1 -ExpandProperty Name"',
      (err, stdout) => {
        resolve(!err && stdout.trim().length > 0)
      }
    )
  })
}

function getSignalStrength() {
  return new Promise((resolve) => {
    exec('netsh wlan show interfaces', (err, stdout) => {
      if (err || !stdout) return resolve(null)
      const match = stdout.match(/Signal\s+:\s+(\d+)%/)
      resolve(match ? parseInt(match[1], 10) : null)
    })
  })
}

async function getNetworkStatus() {
  const ethernet = await getEthernetStatus()
  if (ethernet) return { signal: null, connected: true, type: 'ethernet' }

  const wifiConnected = await getAdapterStatus()
  if (!wifiConnected) return { signal: null, connected: false, type: 'wifi' }

  const signal = await getSignalStrength()
  return { signal, connected: true, type: 'wifi' }
}

module.exports = {
  handlers: {
    'network/wifi-signal': () => getNetworkStatus(),
  },

  start(broadcast) {
    setInterval(async () => {
      const current = await getNetworkStatus()
      if (current.signal !== lastSignal || current.type !== lastType) {
        lastSignal = current.signal
        lastType = current.type
        broadcast('network/wifi-signal-changed', current)
      }
    }, 10000)
  },
}
