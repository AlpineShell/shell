const { exec } = require('child_process')
const { runPowerShell } = require('../powershell')

let lastSignal = undefined
let lastType = undefined
let lastSsid = undefined

function isWifiAdapterUp() {
  return runPowerShell(
    "Get-NetAdapter | Where-Object { $_.Name -match 'Wi-?Fi|WLAN' } | Where-Object { $_.Status -eq 'Up' } | Select-Object -First 1 -ExpandProperty Status"
  ).then((output) => output === 'Up')
}

function isEthernetConnected() {
  return runPowerShell(
    "Get-NetAdapter | Where-Object { $_.Name -match 'Ethernet|LAN' -and $_.PhysicalMediaType -ne 'Unspecified' } | Where-Object { $_.Status -eq 'Up' } | Select-Object -First 1 -ExpandProperty Name"
  ).then((output) => output.length > 0)
}

function getWifiDetails() {
  return new Promise((resolve) => {
    exec('netsh wlan show interfaces', (err, stdout) => {
      if (err || !stdout) return resolve({ signal: null, ssid: null })
      const signalMatch = stdout.match(/Signal\s+:\s+(\d+)%/)
      const ssidMatch = stdout.match(/^\s+SSID\s+:\s+(.+)/m)
      resolve({
        signal: signalMatch ? parseInt(signalMatch[1], 10) : null,
        ssid: ssidMatch ? ssidMatch[1].trim() : null,
      })
    })
  })
}

async function getNetworkStatus() {
  const ethernet = await isEthernetConnected()
  if (ethernet) return { signal: null, connected: true, type: 'ethernet', ssid: null }

  const wifiUp = await isWifiAdapterUp()
  if (!wifiUp) return { signal: null, connected: false, type: 'wifi', ssid: null }

  const { signal, ssid } = await getWifiDetails()
  return { signal, connected: true, type: 'wifi', ssid }
}

module.exports = {
  handlers: {
    'network/wifi-signal': () => getNetworkStatus(),
  },

  start(broadcast) {
    setInterval(async () => {
      const current = await getNetworkStatus()
      if (current.signal !== lastSignal || current.type !== lastType || current.ssid !== lastSsid) {
        lastSignal = current.signal
        lastType = current.type
        lastSsid = current.ssid
        broadcast('network/wifi-signal-changed', current)
      }
    }, 10000)
  },
}
