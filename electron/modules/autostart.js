const { execSync, spawn } = require('child_process')

const RUN_KEYS = [
  'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run',
  'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run',
]

function isShellReplacement() {
  try {
    const result = execSync(
      'reg query "HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon" /v Shell',
      { windowsHide: true, encoding: 'utf8' }
    )
    const match = result.match(/REG_SZ\s+(.+)/)
    if (!match) return false
    const shell = match[1].trim().toLowerCase()
    return !shell.includes('explorer.exe')
  } catch {
    return false
  }
}

function getRunEntries() {
  const entries = []

  for (const key of RUN_KEYS) {
    try {
      const result = execSync(`reg query "${key}"`, { windowsHide: true, encoding: 'utf8' })
      const lines = result.split('\n')

      for (const line of lines) {
        const match = line.match(/^\s+(\S+)\s+REG_SZ\s+(.+)/)
        if (!match) continue

        const name = match[1].trim()
        const value = match[2].trim()

        if (name.toLowerCase() === 'alpineshell') continue

        entries.push({ name, command: value })
      }
    } catch {
      // Key might not exist
    }
  }

  return entries
}

function launchEntry(entry) {
  try {
    const command = entry.command.replace(/^"([^"]+)"(.*)/, '$1$2')
    const match = entry.command.match(/^"([^"]+)"\s*(.*)/)

    if (match) {
      spawn(match[1], match[2] ? match[2].trim().split(/\s+/) : [], {
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
      }).unref()
    } else {
      const parts = entry.command.split(/\s+/)
      spawn(parts[0], parts.slice(1), {
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
      }).unref()
    }

    console.log(`[autostart] Launched: ${entry.name}`)
  } catch (e) {
    console.error(`[autostart] Failed to launch ${entry.name}:`, e.message)
  }
}

function processAutostart() {
  if (!isShellReplacement()) return

  console.log('[autostart] Alpine Shell is the default shell, processing Run entries...')

  const entries = getRunEntries()
  for (const entry of entries) {
    launchEntry(entry)
  }

  console.log(`[autostart] Processed ${entries.length} autostart entries`)
}

module.exports = { processAutostart }
