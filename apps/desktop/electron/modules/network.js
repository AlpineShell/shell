const { exec } = require('child_process')
const { app } = require('electron')
const path = require('path')
const { singleFlight } = require('../singleFlight')
const {
  readWifiRadioState,
  readWifiConnection,
  readInterfaceGeneration,
  disposeNetworkNative,
} = require('../networkNative')

let lastSignal = undefined
let lastType = undefined
let lastSsid = undefined
let cachedStatus = { signal: null, connected: false, type: 'wifi', ssid: null }
let cachedNetworks = []
let cachedRadio = true
let cachedLink = null
let lastInterfaceGeneration = null
let broadcastFn = null

const scriptsDir = app.isPackaged
  ? path.join(process.resourcesPath, 'scripts')
  : path.join(__dirname, '..', 'scripts')
const scriptPath = path.join(scriptsDir, 'networkStatus.ps1')
const scanScriptPath = path.join(scriptsDir, 'wifiScan.ps1')
const radioScriptPath = path.join(scriptsDir, 'wifiRadio.ps1')

const WIFI_LIST_TIMEOUT_MS = 10000
const NETWORK_REFRESH_INTERVAL_MS = 10000
const WIFI_RESCAN_SETTLE_MS = 3000
const POST_RADIO_SET_REFRESH_MS = 1500

function runScript(scriptFile, args = '', options = {}) {
  return new Promise((resolve) => {
    exec(
      `powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptFile}" ${args}`,
      options,
      (err, stdout) => resolve(err || !stdout ? null : stdout.trim())
    )
  })
}

function parseJsonOutput(output, fallback) {
  if (!output) return fallback
  try {
    return JSON.parse(output)
  } catch {
    return fallback
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

async function readLinkVerdict() {
  const parsed = parseJsonOutput(await runScript(scriptPath), null)
  if (!parsed) return null
  return {
    connected: !!parsed.connected,
    type: parsed.type || 'wifi',
    signal: parsed.signal ?? null,
    ssid: parsed.ssid || null,
    radio: parsed.radioSuccess ? parsed.radioState === 'on' : null,
  }
}

async function refreshFromScriptAlone() {
  const verdict = await readLinkVerdict()
  if (!verdict) return cachedStatus
  if (verdict.radio !== null) applyWifiRadioState(verdict.radio)
  cachedStatus = { signal: verdict.signal, connected: verdict.connected, type: verdict.type, ssid: verdict.ssid }
  publishNetworkStatus()
  return cachedStatus
}

function toWifiStatus(connection) {
  if (!connection.connected) return { signal: null, connected: false, type: 'wifi', ssid: null }
  return { signal: connection.signal, connected: true, type: 'wifi', ssid: connection.ssid }
}

async function refreshNetworkState() {
  const generation = readInterfaceGeneration()
  const radio = generation === null ? null : readWifiRadioState()
  if (generation === null || radio === null) return refreshFromScriptAlone()
  if (generation !== lastInterfaceGeneration || !cachedLink) {
    const verdict = await readLinkVerdict()
    if (!verdict) return cachedStatus
    lastInterfaceGeneration = generation
    cachedLink = verdict
  }
  if (radio !== 'unavailable') applyWifiRadioState(radio === 'on')
  else if (cachedLink.radio !== null) applyWifiRadioState(cachedLink.radio)
  if (cachedLink.type === 'ethernet') {
    cachedStatus = { signal: null, connected: true, type: 'ethernet', ssid: null }
  } else {
    const connection = await readWifiConnection()
    if (!connection) return refreshFromScriptAlone()
    cachedStatus = toWifiStatus(connection)
  }
  publishNetworkStatus()
  return cachedStatus
}

const refreshNetworkStatus = singleFlight(refreshNetworkState)

function logNetworkFailure(error) {
  console.error('[network] refresh failed:', error.message)
}

function refreshNetworkStatusQuietly() {
  refreshNetworkStatus().catch(logNetworkFailure)
}

const fetchWifiList = singleFlight(async () => {
  const parsed = parseJsonOutput(await runScript(scanScriptPath, '', { timeout: WIFI_LIST_TIMEOUT_MS }), null)
  if (!parsed) return null
  cachedNetworks = Array.isArray(parsed) ? parsed : [parsed]
  return cachedNetworks
})

const runWifiRescanCycle = singleFlight(
  () =>
    new Promise((resolve) => {
      exec('netsh wlan scan', () => {
        setTimeout(() => {
          fetchWifiList()
            .then((fresh) => {
              if (fresh && broadcastFn) broadcastFn('network/wifi-scan-updated', fresh)
              resolve(fresh)
            })
            .catch((error) => {
              logNetworkFailure(error)
              resolve(null)
            })
        }, WIFI_RESCAN_SETTLE_MS)
      })
    })
)

function scanWifiNetworks() {
  runWifiRescanCycle().catch(logNetworkFailure)
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

async function runWifiRadioScript(action) {
  const output = await runScript(radioScriptPath, `-Action "${action}"`)
  return parseJsonOutput(output, { success: false, state: 'unknown' })
}

function readWifiRadio() {
  const state = readWifiRadioState()
  if (state && state !== 'unavailable') return Promise.resolve({ success: true, state })
  return runWifiRadioScript('get')
}

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
    'network/wifi-radio-get': async () => adoptRadioResult(await readWifiRadio()),
    'network/wifi-radio-set': async (_event, enabled) => {
      const result = adoptRadioResult(await runWifiRadioScript(enabled ? 'on' : 'off'))
      setTimeout(() => refreshNetworkStatus().catch(logNetworkFailure), POST_RADIO_SET_REFRESH_MS)
      return result
    },
  },

  start(broadcast) {
    broadcastFn = broadcast
    const { ipcMain } = require('electron')
    ipcMain.on('network/wifi-init', (event) => {
      event.returnValue = { status: cachedStatus, radio: cachedRadio }
    })
    refreshNetworkStatusQuietly()
    const pollTimer = setInterval(refreshNetworkStatusQuietly, NETWORK_REFRESH_INTERVAL_MS)
    app.on('will-quit', () => {
      clearInterval(pollTimer)
      disposeNetworkNative()
    })
  },
}
