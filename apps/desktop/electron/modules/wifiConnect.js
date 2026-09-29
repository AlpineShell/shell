const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFile } = require('child_process')

const SSID_MAX_BYTES = 32
const SSID_UNSAFE_CHARACTERS = /["\p{Cc}]/u
const NETSH_TIMEOUT_MS = 15000
const PROFILE_DIRECTORY_PREFIX = 'alpine-wifi-'
const PROFILE_FILE_NAME = 'profile.xml'
const XML_ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }

function netshPath() {
  const windowsDirectory = process.env.SystemRoot || process.env.windir || 'C:\\Windows'
  return path.join(windowsDirectory, 'System32', 'netsh.exe')
}

function isConnectableSsid(ssid) {
  if (typeof ssid !== 'string' || ssid.length === 0) return false
  if (Buffer.byteLength(ssid, 'utf8') > SSID_MAX_BYTES) return false
  return !SSID_UNSAFE_CHARACTERS.test(ssid)
}

function escapeXml(text) {
  return text.replace(/[&<>"']/g, (character) => XML_ENTITIES[character])
}

function ssidHex(ssid) {
  return Buffer.from(ssid, 'utf8').toString('hex').toUpperCase()
}

function buildWifiProfileXml(ssid, password) {
  return `<?xml version="1.0"?>
<WLANProfile xmlns="http://www.microsoft.com/networking/WLAN/profile/v1">
  <name>${escapeXml(ssid)}</name>
  <SSIDConfig><SSID><hex>${ssidHex(ssid)}</hex><name>${escapeXml(ssid)}</name></SSID></SSIDConfig>
  <connectionType>ESS</connectionType>
  <connectionMode>auto</connectionMode>
  <MSM><security>
    <authEncryption><authentication>WPA2PSK</authentication><encryption>AES</encryption><useOneX>false</useOneX></authEncryption>
    <sharedKey><keyType>passPhrase</keyType><protected>false</protected><keyMaterial>${escapeXml(password)}</keyMaterial></sharedKey>
  </security></MSM>
</WLANProfile>`
}

function runNetsh(args) {
  return new Promise((resolve) => {
    execFile(netshPath(), args, { windowsHide: true, timeout: NETSH_TIMEOUT_MS }, (error) => resolve(!error))
  })
}

function connectToProfile(ssid) {
  return runNetsh(['wlan', 'connect', `name=${ssid}`])
}

async function addProfileAndConnect(ssid, password) {
  const profileDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), PROFILE_DIRECTORY_PREFIX))
  try {
    const profilePath = path.join(profileDirectory, PROFILE_FILE_NAME)
    await fs.promises.writeFile(profilePath, buildWifiProfileXml(ssid, password))
    if (!(await runNetsh(['wlan', 'add', 'profile', `filename=${profilePath}`]))) return false
    return await connectToProfile(ssid)
  } finally {
    await fs.promises.rm(profileDirectory, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
  }
}

async function wifiConnect(ssid, password) {
  if (!isConnectableSsid(ssid)) return { success: false }
  if (await connectToProfile(ssid)) return { success: true }
  if (typeof password !== 'string' || password.length === 0) return { success: false, needsPassword: true }
  const success = await addProfileAndConnect(ssid, password).catch(() => false)
  return { success }
}

module.exports = { netshPath, isConnectableSsid, buildWifiProfileXml, wifiConnect, PROFILE_DIRECTORY_PREFIX }
