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

let broadcastFn = null

function fetchWifiList() {
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

function scanWifiNetworks() {
  exec('netsh wlan scan', () => {
    setTimeout(async () => {
      const fresh = await fetchWifiList()
      if (fresh && broadcastFn) broadcastFn('network/wifi-scan-updated', fresh)
    }, 3000)
  })
  return fetchWifiList()
}

function wifiConnect(ssid, password) {
  return new Promise((resolve) => {
    exec(`netsh wlan connect name="${ssid}"`, (err) => {
      if (!err) return resolve({ success: true })
      if (!password) return resolve({ success: false, needsPassword: true })

      const fs = require('fs')
      const os = require('os')
      const profileXml = `<?xml version="1.0"?>
<WLANProfile xmlns="http://www.microsoft.com/networking/WLAN/profile/v1">
  <name>${ssid}</name>
  <SSIDConfig><SSID><name>${ssid}</name></SSID></SSIDConfig>
  <connectionType>ESS</connectionType>
  <connectionMode>auto</connectionMode>
  <MSM><security>
    <authEncryption><authentication>WPA2PSK</authentication><encryption>AES</encryption><useOneX>false</useOneX></authEncryption>
    <sharedKey><keyType>passPhrase</keyType><protected>false</protected><keyMaterial>${password}</keyMaterial></sharedKey>
  </security></MSM>
</WLANProfile>`

      const tmpPath = path.join(os.tmpdir(), `wifi_${Date.now()}.xml`)
      fs.writeFileSync(tmpPath, profileXml)
      exec(`netsh wlan add profile filename="${tmpPath}" && netsh wlan connect name="${ssid}"`, (err2) => {
        try { fs.unlinkSync(tmpPath) } catch {}
        resolve({ success: !err2 })
      })
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
    'network/wifi-connect': (_event, { ssid, password }) => wifiConnect(ssid, password),
    'network/wifi-disconnect': () => wifiDisconnect(),
  },

  start(broadcast) {
    broadcastFn = broadcast;
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
