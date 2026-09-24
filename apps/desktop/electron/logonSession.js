const path = require('path')
const { execFileSync } = require('child_process')

const LOGON_SID_PATTERN = /S-1-5-5-\d+-\d+/
const WHOAMI_TIMEOUT_MS = 2000

function whoamiPath() {
  const windowsDirectory = process.env.SystemRoot || process.env.windir || 'C:\\Windows'
  return path.join(windowsDirectory, 'System32', 'whoami.exe')
}

function parseLogonId(text) {
  const match = LOGON_SID_PATTERN.exec(String(text ?? ''))
  return match ? match[0] : null
}

function currentLogonId() {
  try {
    return parseLogonId(execFileSync(whoamiPath(), ['/logonid'], {
      windowsHide: true,
      encoding: 'utf8',
      timeout: WHOAMI_TIMEOUT_MS,
      stdio: ['ignore', 'pipe', 'ignore'],
    }))
  } catch {
    return null
  }
}

module.exports = { whoamiPath, parseLogonId, currentLogonId }
