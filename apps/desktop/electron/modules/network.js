const { exec } = require('child_process')
const { app } = require('electron')
const path = require('path')
const { createPersistentRunner } = require('../powershell')
const { singleFlight } = require('../singleFlight')

let lastSignal = undefined
let lastType = undefined
let lastSsid = undefined
let cachedStatus = { signal: null, connected: false, type: 'wifi', ssid: null }
let cachedNetworks = []
let cachedRadio = true
let wifiRescanPending = false

const scriptsDir = app.isPackaged
  ? path.join(process.resourcesPath, 'scripts')
  : path.join(__dirname, '..', 'scripts')
const scriptPath = path.join(scriptsDir, 'networkStatus.ps1')
const scanScriptPath = path.join(scriptsDir, 'wifiScan.ps1')
const radioScriptPath = path.join(scriptsDir, 'wifiRadio.ps1')

const NETWORK_SCRIPT_TIMEOUT_MS = 15000
const NETWORK_REFRESH_INTERVAL_MS = 10000
const WIFI_RESCAN_SETTLE_MS = 3000

const runner = createPersistentRunner(undefined, NETWORK_SCRIPT_TIMEOUT_MS)

let broadcastFn = null

function runNetworkScript(scriptFile, args = '') {
  return runner.run(`& "${scriptFile}" ${args}`)
}

function parseJsonOutput(output, fallback) {
  if (!output) return fallback
  try {
    return JSON.parse(output.trim())
  } catch {
    return fallback
  }
}

const EMPTY_STATUS = { signal: null, connected: false, type: 'wifi', ssid: null }
const UNKNOWN_RADIO = { success: false, state: 'unknown' }

async function fetchNetworkStatusAndRadio() {
  const parsed = parseJsonOutput(await runNetworkScript(scriptPath), null)
  if (!parsed) return { status: { ...EMPTY_STATUS }, radio: { ...UNKNOWN_RADIO } }
  return {
    status: {
      signal: parsed.signal ?? null,
      connected: !!parsed.connected,
      type: parsed.type || 'wifi',
      ssid: parsed.ssid || null,
    },
    radio: {
      success: !!parsed.radioSuccess,
      state: parsed.radioState || 'unknown',
    },
  }
}

function applyWifiRadioState(enabled) {
  if (enabled === cachedRadio) return
  cachedRadio = enabled
  if (broadcastFn) broadcastFn('network/wifi-radio-changed', cachedRadio)
}

function publishNetworkStatus() {
  if (
    cachedStatus.signal === lastSignal &&
    cachedStatus.type === lastType &&
    cachedStatus.ssid === lastSsid
  ) {
    return
  }
  lastSignal = cachedStatus.signal
  lastType = cachedStatus.type
  lastSsid = cachedStatus.ssid
  if (broadcastFn) broadcastFn('network/wifi-signal-changed', cachedStatus)
}

const refreshNetworkStatus = singleFlight(async () => {
  const { status, radio } = await fetchNetworkStatusAndRadio()
  cachedStatus = status
  if (radio.success) applyWifiRadioState(radio.state === 'on')
  publishNetworkStatus()
  return cachedStatus
})

const refreshWifiList = singleFlight(async () => {
  const parsed = parseJsonOutput(await runNetworkScript(scanScriptPath), null)
  if (!parsed) return null
  cachedNetworks = Array.isArray(parsed) ? parsed : [parsed]
  return cachedNetworks
})

async function publishFreshWifiList() {
  wifiRescanPending = false
  const fresh = await refreshWifiList()
  if (fresh && broadcastFn) broadcastFn('network/wifi-scan-updated', fresh)
}

function requestWifiRescan() {
  if (wifiRescanPending) return
  wifiRescanPending = true
  runner.run('netsh wlan scan').then(() => {
    setTimeout(publishFreshWifiList, WIFI_RESCAN_SETTLE_MS)
  })
}

function scanWifiNetworks() {
  requestWifiRescan()
  return refreshWifiList()
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

async function runWifiRadioScript(action) {
  const output = await runNetworkScript(radioScriptPath, `-Action "${action}"`)
  return parseJsonOutput(output, { success: false, state: 'unknown' })
}

const getWifiRadio = singleFlight(() => runWifiRadioScript('get'))

function adoptRadioResult(result) {
  if (result.success) applyWifiRadioState(result.state === 'on')
  return result
}

module.exports = {
  handlers: {
    'network/wifi-signal': () => cachedStatus,
    'network/wifi-networks': () => cachedNetworks,
    'network/wifi-scan': () => scanWifiNetworks(),
    'network/wifi-connect': (_event, { ssid, password }) => wifiConnect(ssid, password),
    'network/wifi-disconnect': () => wifiDisconnect(),
    'network/wifi-radio-get': async () => adoptRadioResult(await getWifiRadio()),
    'network/wifi-radio-set': async (_event, enabled) => {
      const result = adoptRadioResult(await runWifiRadioScript(enabled ? 'on' : 'off'))
      setTimeout(refreshNetworkStatus, 1500)
      return result
    },
  },

  start(broadcast) {
    broadcastFn = broadcast
    const { ipcMain } = require('electron')
    ipcMain.on('network/wifi-init', (event) => {
      event.returnValue = { status: cachedStatus, radio: cachedRadio }
    })
    refreshNetworkStatus()
    setInterval(refreshNetworkStatus, NETWORK_REFRESH_INTERVAL_MS)
  },
}
