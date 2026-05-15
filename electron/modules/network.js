const { exec } = require('child_process')
const { app } = require('electron')
const path = require('path')

let lastSignal = undefined
let lastType = undefined
let lastSsid = undefined
let cachedStatus = { signal: null, connected: false, type: 'wifi', ssid: null }
let cachedNetworks = []
let cachedRadio = true

const scriptsDir = app.isPackaged
  ? path.join(process.resourcesPath, 'scripts')
  : path.join(__dirname, '..', 'scripts')
const scriptPath = path.join(scriptsDir, 'networkStatus.ps1')
const scanScriptPath = path.join(scriptsDir, 'wifiScan.ps1')
const radioScriptPath = path.join(scriptsDir, 'wifiRadio.ps1')

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
          cachedNetworks = Array.isArray(parsed) ? parsed : [parsed]
          resolve(cachedNetworks)
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

function wifiRadio(action) {
  return new Promise((resolve) => {
    exec(
      `powershell -NoProfile -ExecutionPolicy Bypass -File "${radioScriptPath}" -Action "${action}"`,
      (err, stdout) => {
        if (err || !stdout) return resolve({ success: false, state: 'unknown' })
        try { resolve(JSON.parse(stdout.trim())) } catch { resolve({ success: false, state: 'unknown' }) }
      }
    )
  })
}

module.exports = {
  handlers: {
    'network/wifi-signal': () => cachedStatus,
    'network/wifi-networks': () => cachedNetworks,
    'network/wifi-scan': () => scanWifiNetworks(),
    'network/wifi-connect': (_event, { ssid, password }) => wifiConnect(ssid, password),
    'network/wifi-disconnect': () => wifiDisconnect(),
    'network/wifi-radio-get': async () => {
      const result = await wifiRadio('get')
      if (result.success) cachedRadio = result.state === 'on'
      return result
    },
    'network/wifi-radio-set': async (_event, enabled) => {
      const result = await wifiRadio(enabled ? 'on' : 'off')
      if (result.success) cachedRadio = result.state === 'on'
      setTimeout(async () => {
        const current = await getNetworkStatus()
        cachedStatus = current
        if (broadcastFn) broadcastFn('network/wifi-signal-changed', current)
      }, 1500)
      return result
    },
  },

  start(broadcast) {
    broadcastFn = broadcast;
    const { ipcMain } = require('electron')
    ipcMain.on('network/wifi-init', (event) => {
      event.returnValue = { status: cachedStatus, radio: cachedRadio }
    })
    async function poll() {
      const [current, radio] = await Promise.all([
        getNetworkStatus(),
        wifiRadio('get'),
      ])
      cachedStatus = current
      if (radio.success) cachedRadio = radio.state === 'on'
      if (current.signal !== lastSignal || current.type !== lastType || current.ssid !== lastSsid) {
        lastSignal = current.signal
        lastType = current.type
        lastSsid = current.ssid
        broadcast('network/wifi-signal-changed', current)
      }
    }
    poll()
    setInterval(poll, 10000)
  },
}
