const { exec } = require('child_process')

let lastSignal = undefined

function getAdapterStatus() {
  return new Promise((resolve) => {
    exec(
      'powershell -NoProfile -Command "Get-NetAdapter | Where-Object { $_.Name -match \'Wi-Fi|WLAN\' } | Select-Object -First 1 -ExpandProperty Status"',
      (err, stdout) => {
        resolve(!err && stdout.trim() === 'Up')
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

async function getWifiSignal() {
  const connected = await getAdapterStatus()
  if (!connected) return { signal: null, connected: false }

  const signal = await getSignalStrength()
  return { signal, connected: true }
}

module.exports = {
  handlers: {
    'network/wifi-signal': () => getWifiSignal(),
  },

  start(broadcast) {
    setInterval(async () => {
      const current = await getWifiSignal()
      if (current.signal !== lastSignal) {
        lastSignal = current.signal
        broadcast('network/wifi-signal-changed', current)
      }
    }, 10000)
  },
}
