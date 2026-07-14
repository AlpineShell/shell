const fs = require('fs')
const path = require('path')

const CHROMIUM_BROWSERS = [
  { match: 'chrome', base: 'LOCALAPPDATA', dir: ['Google', 'Chrome', 'User Data'] },
  { match: 'msedge', base: 'LOCALAPPDATA', dir: ['Microsoft', 'Edge', 'User Data'] },
  { match: 'brave', base: 'LOCALAPPDATA', dir: ['BraveSoftware', 'Brave-Browser', 'User Data'] },
  { match: 'vivaldi', base: 'LOCALAPPDATA', dir: ['Vivaldi', 'User Data'] },
  { match: 'opera', base: 'APPDATA', dir: ['Opera Software', 'Opera Stable'] },
]

function userDataDirFor(browser) {
  const base = process.env[browser.base]
  return base ? path.join(base, ...browser.dir) : null
}

function userDataDirForProgId(progId) {
  if (!progId) return null
  const lower = progId.toLowerCase()
  for (const browser of CHROMIUM_BROWSERS) {
    if (lower.includes(browser.match)) return userDataDirFor(browser)
  }
  return null
}

function userDataDirForProcess(processName) {
  for (const browser of CHROMIUM_BROWSERS) {
    if (browser.match === processName) return userDataDirFor(browser)
  }
  return null
}

function lastUsedProfileName(userDataDir, requiredFile) {
  try {
    const localState = JSON.parse(fs.readFileSync(path.join(userDataDir, 'Local State'), 'utf8'))
    const lastUsed = localState && localState.profile && localState.profile.last_used
    if (lastUsed && fs.existsSync(path.join(userDataDir, lastUsed, requiredFile))) return lastUsed
  } catch {}
  return 'Default'
}

module.exports = { userDataDirForProgId, userDataDirForProcess, lastUsedProfileName }
