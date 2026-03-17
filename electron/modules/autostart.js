const { execSync, spawn } = require('child_process')
const path = require('path')
const fs = require('fs')

const RUN_KEYS = [
  'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run',
  'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run',
]

const STARTUP_FOLDERS = [
  path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup'),
  path.join(process.env.PROGRAMDATA || 'C:\\ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'StartUp'),
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

function isExplorerRunning() {
  try {
    const result = execSync('tasklist /fi "imagename eq explorer.exe" /fo csv /nh', {
      windowsHide: true,
      encoding: 'utf8',
    })
    return result.toLowerCase().includes('explorer.exe')
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
    }
  }

  return entries
}

function getStartupFolderEntries() {
  const entries = []

  for (const folder of STARTUP_FOLDERS) {
    try {
      if (!fs.existsSync(folder)) continue

      for (const file of fs.readdirSync(folder)) {
        const ext = path.extname(file).toLowerCase()
        if (ext === '.desktop.ini' || file.toLowerCase() === 'desktop.ini') continue

        const fullPath = path.join(folder, file)
        const stat = fs.statSync(fullPath)
        if (!stat.isFile()) continue

        if (ext === '.lnk' || ext === '.exe' || ext === '.bat' || ext === '.cmd' || ext === '.vbs') {
          entries.push({ name: path.basename(file, ext), command: fullPath })
        }
      }
    } catch {
    }
  }

  return entries
}

function launchEntry(entry) {
  try {
    spawn('cmd.exe', ['/c', 'start', '', '/b', entry.command], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      shell: false,
    }).unref()

    console.log(`[autostart] Launched: ${entry.name}`)
  } catch (e) {
    console.error(`[autostart] Failed to launch ${entry.name}:`, e.message)
  }
}

function processAutostart() {
  if (!isShellReplacement()) return

  if (isExplorerRunning()) {
    console.log('[autostart] Explorer is still running, skipping autostart (not a fresh logon)')
    return
  }

  console.log('[autostart] Alpine Shell is the default shell, processing startup entries...')

  const runEntries = getRunEntries()
  const folderEntries = getStartupFolderEntries()
  const allEntries = [...runEntries, ...folderEntries]

  for (const entry of allEntries) {
    launchEntry(entry)
  }

  console.log(`[autostart] Processed ${allEntries.length} autostart entries (${runEntries.length} registry, ${folderEntries.length} startup folder)`)
}

module.exports = { processAutostart }
