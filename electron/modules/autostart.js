const { execSync, exec } = require('child_process')
const { shell } = require('electron')
const path = require('path')
const fs = require('fs')

const BLOCKED_EXECUTABLES = [
  'explorer.exe',
  'explorer',
]

const RUN_KEYS = [
  'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run',
  'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run',
  'HKCU\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Run',
  'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Run',
]

const RUN_ONCE_KEYS = [
  'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\RunOnce',
  'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\RunOnce',
]

const STARTUP_FOLDERS = [
  path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup'),
  path.join(process.env.PROGRAMDATA || 'C:\\ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'StartUp'),
]

const ALPINE_DATA = path.join(process.env.APPDATA, 'Alpine Shell')
const MSIX_CACHE_FILE = path.join(ALPINE_DATA, 'msix-startup-cache.json')
const MSIX_EXE_CACHE = path.join(ALPINE_DATA, 'msix-launcher.exe')
const scriptsDir = process.resourcesPath
  ? path.join(process.resourcesPath, 'scripts')
  : path.join(__dirname, '..', 'scripts')
const MSIX_LAUNCHER_SRC = path.join(scriptsDir, 'msixLauncher.cs')
const MSIX_QUERY = path.join(scriptsDir, 'msixQuery.ps1')
const CSC_PATH = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe'

function isBlockedEntry(entry) {
  const cmd = entry.command.replace(/"/g, '').toLowerCase()
  const basename = path.basename(cmd.split(/\s+/)[0])
  return BLOCKED_EXECUTABLES.some(blocked => basename === blocked || basename === blocked + '.exe')
}

function disableExplorerRestart() {
  try {
    execSync('reg add "HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon" /v RestartApps /t REG_DWORD /d 0 /f', { windowsHide: true, encoding: 'utf8' })
  } catch {
  }
  console.log('[autostart] Explorer restart prevention applied')
}

function isShellReplacement() {
  const hives = [
    'HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon',
    'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon',
  ]

  for (const hive of hives) {
    try {
      const result = execSync(`reg query "${hive}" /v Shell`, { windowsHide: true, encoding: 'utf8' })
      const match = result.match(/REG_SZ\s+(.+)/)
      if (!match) continue
      const shellValue = match[1].trim().toLowerCase()
      if (!shellValue.includes('explorer.exe')) return true
    } catch {
    }
  }

  return false
}

function expandEnvVars(str) {
  return str.replace(/%([^%]+)%/g, (_, key) => process.env[key] || `%${key}%`)
}

function getRunEntries(keys) {
  const entries = []

  for (const key of keys) {
    try {
      const result = execSync(`reg query "${key}"`, { windowsHide: true, encoding: 'utf8' })
      const lines = result.split('\n')

      for (const line of lines) {
        const match = line.match(/^\s+(\S+)\s+REG_(?:SZ|EXPAND_SZ)\s+(.+)/)
        if (!match) continue

        const name = match[1].trim()
        const value = expandEnvVars(match[2].trim())

        if (name.toLowerCase() === 'alpineshell') continue

        entries.push({ name, command: value, registryKey: key })
      }
    } catch {
    }
  }

  return entries
}

function deleteRunOnceEntry(registryKey, name) {
  try {
    execSync(`reg delete "${registryKey}" /v "${name}" /f`, { windowsHide: true, encoding: 'utf8' })
  } catch {
  }
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
          entries.push({ name: path.basename(file, ext), command: fullPath, isShortcut: ext === '.lnk' })
        }
      }
    } catch {
    }
  }

  return entries
}

function launchEntry(entry) {
  try {
    if (entry.isShortcut) {
      shell.openPath(entry.command)
    } else {
      exec(entry.command, { windowsHide: false })
    }

    console.log(`[autostart] Launched: ${entry.name}`)
  } catch (e) {
    console.error(`[autostart] Failed to launch ${entry.name}:`, e.message)
  }
}

function getMsixCached() {
  try {
    if (!fs.existsSync(MSIX_CACHE_FILE)) return null
    return JSON.parse(fs.readFileSync(MSIX_CACHE_FILE, 'utf8'))
  } catch {
    return null
  }
}

function refreshMsixCache() {
  exec(
    `powershell -NoProfile -ExecutionPolicy Bypass -File "${MSIX_QUERY}"`,
    { windowsHide: true, encoding: 'utf8', timeout: 30000 },
    (err, stdout) => {
      if (err) {
        console.error('[autostart] Failed to refresh MSIX cache:', err.message)
        return
      }

      const entries = []
      for (const line of stdout.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed) continue
        const [aumid, displayName] = trimmed.split('|')
        if (!aumid) continue
        entries.push({ name: displayName || aumid.split('!')[0], aumid })
      }

      try {
        fs.writeFileSync(MSIX_CACHE_FILE, JSON.stringify(entries, null, 2), 'utf8')
        console.log(`[autostart] MSIX cache updated: ${entries.length} entries`)
      } catch (e) {
        console.error('[autostart] Failed to write MSIX cache:', e.message)
      }
    }
  )
}

function getMsixStartupEntries() {
  try {
    const script = `Get-AppxPackage | ForEach-Object {
  $pkg = $_
  try {
    $manifest = $pkg | Get-AppxPackageManifest
    $startupTasks = $manifest | Select-Xml -XPath '//*[local-name()="Extension"][@Category="windows.startupTask"]'
    foreach($task in $startupTasks) {
      if($task.Node.StartupTask.Enabled -eq 'true') {
        $apps = $manifest | Select-Xml -XPath '//*[local-name()="Application"]'
        $appId = $apps[0].Node.Id
        Write-Output "$($pkg.PackageFamilyName)!$appId|$($task.Node.StartupTask.DisplayName)"
      }
    }
  } catch {}
}
`

    const tmpFile = path.join(process.env.TEMP || 'C:\\Windows\\Temp', 'alpine-msix-query.ps1')
    fs.writeFileSync(tmpFile, script, 'utf8')

    const result = execSync(
      `powershell -NoProfile -ExecutionPolicy Bypass -File "${tmpFile}"`,
      { windowsHide: true, encoding: 'utf8', timeout: 30000 }
    )

    try { fs.unlinkSync(tmpFile) } catch {}

    const entries = []
    for (const line of result.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue
      const [aumid, displayName] = trimmed.split('|')
      if (!aumid) continue
      entries.push({ name: displayName || aumid.split('!')[0], aumid })
    }

    return entries
  } catch (e) {
    console.error('[autostart] Failed to query MSIX startup tasks:', e.message)
    return []
  }
}

function ensureMsixLauncher() {
  if (fs.existsSync(MSIX_EXE_CACHE)) return MSIX_EXE_CACHE
  if (!fs.existsSync(CSC_PATH)) {
    console.error('[autostart] csc.exe not found, cannot compile MSIX launcher')
    return null
  }
  try {
    fs.mkdirSync(path.dirname(MSIX_EXE_CACHE), { recursive: true })
    execSync(`"${CSC_PATH}" /nologo /optimize /target:exe /out:"${MSIX_EXE_CACHE}" "${MSIX_LAUNCHER_SRC}"`, {
      windowsHide: true,
      encoding: 'utf8',
    })
    console.log('[autostart] Compiled MSIX launcher exe')
    return MSIX_EXE_CACHE
  } catch (e) {
    console.error('[autostart] Failed to compile MSIX launcher:', e.message)
    return null
  }
}

function launchMsixApps(entries) {
  if (entries.length === 0) return

  const exePath = ensureMsixLauncher()
  if (!exePath) return

  const aumids = entries.map(e => `"${e.aumid}"`).join(' ')

  exec(
    `"${exePath}" ${aumids}`,
    { windowsHide: true },
    (err, stdout, stderr) => {
      if (err) console.error('[autostart] MSIX launch error:', err.message, stderr)
      else console.log('[autostart] MSIX launch complete:', stdout.trim())
    }
  )
}

function getScheduledLogonTasks() {
  const entries = []

  try {
    const xml = execSync(
      'schtasks /query /xml ONE',
      { windowsHide: true, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
    )

    const taskBlocks = xml.split('<?xml')
    for (const block of taskBlocks) {
      if (!block.trim()) continue

      const hasLogonTrigger = /<LogonTrigger>/.test(block)
      if (!hasLogonTrigger) continue

      const isEnabled = !/<Enabled>false<\/Enabled>/i.test(block.split('</Settings>')[0] || '')

      if (!isEnabled) continue

      const commandMatch = block.match(/<Command>([^<]+)<\/Command>/)
      if (!commandMatch) continue

      const command = expandEnvVars(commandMatch[1].trim())
      const argsMatch = block.match(/<Arguments>([^<]+)<\/Arguments>/)
      const args = argsMatch ? expandEnvVars(argsMatch[1].trim()) : ''

      const uriMatch = block.match(/<URI>([^<]+)<\/URI>/)
      const name = uriMatch ? uriMatch[1].replace(/^\\/, '') : path.basename(command, '.exe')

      if (name.toLowerCase().includes('alpineshell')) continue

      const fullCommand = args ? `"${command}" ${args}` : `"${command}"`
      entries.push({ name, command: fullCommand })
    }
  } catch (e) {
    console.error('[autostart] Failed to query scheduled tasks:', e.message)
  }

  return entries
}

function processAutostart() {
  if (!isShellReplacement()) {
    console.log('[autostart] Not the registered shell, skipping autostart')
    return
  }

  console.log('[autostart] Processing startup entries...')

  const runEntries = getRunEntries(RUN_KEYS)
  const runOnceEntries = getRunEntries(RUN_ONCE_KEYS)
  const folderEntries = getStartupFolderEntries()
  const scheduledEntries = getScheduledLogonTasks()

  for (const entry of runOnceEntries) {
    deleteRunOnceEntry(entry.registryKey, entry.name)
  }

  const allEntries = [...runEntries, ...runOnceEntries, ...folderEntries, ...scheduledEntries]
  const launchableEntries = allEntries.filter(entry => {
    if (isBlockedEntry(entry)) {
      console.log(`[autostart] Blocked: ${entry.name} (${entry.command})`)
      return false
    }
    return true
  })

  disableExplorerRestart()

  for (const entry of launchableEntries) {
    launchEntry(entry)
  }

  const cached = getMsixCached()

  if (cached && cached.length > 0) {
    console.log(`[autostart] Launching ${cached.length} MSIX apps from cache...`)
    launchMsixApps(cached)
    refreshMsixCache()
  } else {
    console.log('[autostart] No MSIX cache, querying packages (first boot)...')
    const msixEntries = getMsixStartupEntries()
    try {
      fs.mkdirSync(path.dirname(MSIX_CACHE_FILE), { recursive: true })
      fs.writeFileSync(MSIX_CACHE_FILE, JSON.stringify(msixEntries, null, 2), 'utf8')
    } catch {}
    launchMsixApps(msixEntries)
  }

  console.log(`[autostart] Launched ${launchableEntries.length} classic entries (${runEntries.length} registry, ${runOnceEntries.length} run-once, ${folderEntries.length} startup folder, ${scheduledEntries.length} scheduled tasks)`)

}

module.exports = { processAutostart }
