const { exec } = require('child_process')
const path = require('path')

let lastSignal = undefined
let lastType = undefined
let lastSsid = undefined

const scriptPath = path.join(__dirname, '..', 'scripts', 'networkStatus.ps1')
const scanScriptPath = path.join(__dirname, '..', 'scripts', 'wifiScan.ps1')

function getNetworkStatus() {
  return new Promise((resolve) => {
    exec(
      `powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"`,
      (err, stdout) => {
        if (err || !stdout) return resolve({ signal: null, connected: false, type: 'wifi', ssid: null })
        try {
          const parsed = JSON.parse(stdout.trim())
          resolve({
            signal: parsed.signal ?? null,
            connected: !!parsed.connected,
            type: parsed.type || 'wifi',
            ssid: parsed.ssid || null,
          })
        } catch {
          resolve({ signal: null, connected: false, type: 'wifi', ssid: null })
        }
      }
    )
  })
}

function scanWifiNetworks() {
  return new Promise((resolve) => {
    exec(
      `powershell -NoProfile -ExecutionPolicy Bypass -File "${scanScriptPath}"`,
      { timeout: 10000 },
      (err, stdout) => {
        if (err || !stdout) return resolve(null)
        try {
          const parsed = JSON.parse(stdout.trim())
          resolve(Array.isArray(parsed) ? parsed : [parsed])
        } catch {
          resolve(null)
        }
      }
    )
  })
}

function wifiConnect(ssid) {
  return new Promise((resolve) => {
    exec(`netsh wlan connect name="${ssid}"`, (err) => {
      resolve({ success: !err })
    })
  })
}

function wifiDisconnect() {
  return new Promise((resolve) => {
    exec('netsh wlan disconnect', (err) => {
      resolve({ success: !err })
    })
  })
}

module.exports = {
  handlers: {
    'network/wifi-signal': () => getNetworkStatus(),
    'network/wifi-scan': () => scanWifiNetworks(),
    'network/wifi-connect': (_event, { ssid }) => wifiConnect(ssid),
    'network/wifi-disconnect': () => wifiDisconnect(),
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
