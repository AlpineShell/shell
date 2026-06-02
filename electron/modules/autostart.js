const { execSync, exec } = require('child_process')
const { shell } = require('electron')
const path = require('path')
const fs = require('fs')
const { APPROVED_BASE, parseApprovedMap, isMsixStateEnabled } = require('./startupState')

const BLOCKED_EXECUTABLES = [
  'explorer.exe',
  'explorer',
]

const RUN_KEYS = [
  'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run',
  'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run',
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
      const result = execSync(`reg query "${hive}" /v Shell`, { windowsHide: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
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
      const result = execSync(`reg query "${key}"`, { windowsHide: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      const lines = result.split('\n')

      for (const line of lines) {
        const match = line.match(/^\s+(\S.*?)\s+REG_(?:SZ|EXPAND_SZ)\s+(.+)/)
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

  STARTUP_FOLDERS.forEach((folder, index) => {
    const scope = index === 0 ? 'user' : 'common'
    try {
      if (!fs.existsSync(folder)) return

      for (const file of fs.readdirSync(folder)) {
        const ext = path.extname(file).toLowerCase()
        if (file.toLowerCase() === 'desktop.ini') continue

        const fullPath = path.join(folder, file)
        const stat = fs.statSync(fullPath)
        if (!stat.isFile()) continue

        if (ext === '.lnk' || ext === '.exe' || ext === '.bat' || ext === '.cmd' || ext === '.vbs') {
          entries.push({ name: path.basename(file, ext), command: fullPath, isShortcut: ext === '.lnk', file, scope })
        }
      }
    } catch {
    }
  })

  return entries
}

function readApprovedMapSync(fullKey) {
  try {
    const out = execSync(`reg query "${fullKey}"`, { windowsHide: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    return parseApprovedMap(out)
  } catch {
    return new Map()
  }
}

function readMsixStateEnabled(aumid, taskId) {
  const packageFamilyName = (aumid || '').split('!')[0]
  if (!packageFamilyName || !taskId) return null
  try {
    const out = execSync(
      `reg query "HKCU\\Software\\Classes\\Local Settings\\Software\\Microsoft\\Windows\\CurrentVersion\\AppModel\\SystemAppData\\${packageFamilyName}\\${taskId}" /v State`,
      { windowsHide: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    )
    const match = out.match(/State\s+REG_DWORD\s+0x([0-9a-fA-F]+)/)
    if (!match) return null
    return isMsixStateEnabled(parseInt(match[1], 16))
  } catch {
    return null
  }
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

const MSIX_STARTUP_PS = `$OutputEncoding = [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
Get-AppxPackage | ForEach-Object {
  $pkg = $_
  try {
    $manifest = $pkg | Get-AppxPackageManifest
    $startupTasks = $manifest | Select-Xml -XPath '//*[local-name()="Extension"][@Category="windows.startupTask"]'
    if (-not $startupTasks) { return }
    $apps = $manifest | Select-Xml -XPath '//*[local-name()="Application"]'
    $appId = $null
    if ($apps) { $appId = $apps[0].Node.Id }
    foreach ($task in $startupTasks) {
      $st = $task.Node.StartupTask
      if (-not $st) { continue }
      $taskId = $st.TaskId
      $enabled = "$($st.Enabled)".ToLower() -eq 'true'
      $statePath = "HKCU:\\Software\\Classes\\Local Settings\\Software\\Microsoft\\Windows\\CurrentVersion\\AppModel\\SystemAppData\\$($pkg.PackageFamilyName)\\$taskId"
      try {
        $state = (Get-ItemProperty -LiteralPath $statePath -Name State -ErrorAction Stop).State
        $enabled = ($state -eq 2 -or $state -eq 4)
      } catch {}
      Write-Output "$($pkg.PackageFamilyName)!$appId|$taskId|$($st.DisplayName)|$($enabled.ToString().ToLower())"
    }
  } catch {}
}
`

function parseMsixStartupOutput(output) {
  const entries = []
  for (const line of (output || '').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const [aumid, taskId, displayName, enabled] = trimmed.split('|')
    if (!aumid || !taskId) continue
    const name = displayName && !/^ms-resource:/i.test(displayName) ? displayName : aumid.split('!')[0]
    entries.push({ name, aumid, taskId, enabled: enabled === 'true' })
  }
  return entries
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

      const entries = parseMsixStartupOutput(stdout)

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
    const tmpFile = path.join(process.env.TEMP || 'C:\\Windows\\Temp', 'alpine-msix-query.ps1')
    fs.writeFileSync(tmpFile, MSIX_STARTUP_PS, 'utf8')

    const result = execSync(
      `powershell -NoProfile -ExecutionPolicy Bypass -File "${tmpFile}"`,
      { windowsHide: true, encoding: 'utf8', timeout: 30000 }
    )

    try { fs.unlinkSync(tmpFile) } catch {}

    return parseMsixStartupOutput(result)
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

function readApprovedState() {
  return {
    run: { HKCU: readApprovedMapSync(`HKCU\\${APPROVED_BASE}\\Run`), HKLM: readApprovedMapSync(`HKLM\\${APPROVED_BASE}\\Run`) },
    run32: { HKCU: readApprovedMapSync(`HKCU\\${APPROVED_BASE}\\Run32`), HKLM: readApprovedMapSync(`HKLM\\${APPROVED_BASE}\\Run32`) },
    folder: { user: readApprovedMapSync(`HKCU\\${APPROVED_BASE}\\StartupFolder`), common: readApprovedMapSync(`HKLM\\${APPROVED_BASE}\\StartupFolder`) },
  }
}

function isRunEntryDisabled(entry, approved) {
  const hive = entry.registryKey.startsWith('HKLM') ? 'HKLM' : 'HKCU'
  const map = /WOW6432Node/i.test(entry.registryKey) ? approved.run32 : approved.run
  return map[hive].get(entry.name.toLowerCase()) === true
}

function isFolderEntryDisabled(entry, approved) {
  return approved.folder[entry.scope]?.get(entry.file.toLowerCase()) === true
}

function getEnabledMsixEntries() {
  const cached = getMsixCached()
  let entries
  if (cached && cached.length > 0 && cached.every(e => e && e.aumid && e.taskId)) {
    entries = cached
    refreshMsixCache()
  } else {
    entries = getMsixStartupEntries()
    try {
      fs.mkdirSync(path.dirname(MSIX_CACHE_FILE), { recursive: true })
      fs.writeFileSync(MSIX_CACHE_FILE, JSON.stringify(entries, null, 2), 'utf8')
    } catch {}
  }

  return entries.filter(entry => {
    const fresh = readMsixStateEnabled(entry.aumid, entry.taskId)
    return fresh === null ? entry.enabled === true : fresh
  })
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
  const approved = readApprovedState()

  for (const entry of runOnceEntries) {
    deleteRunOnceEntry(entry.registryKey, entry.name)
  }

  const launchableEntries = [
    ...runEntries.filter(entry => !isBlockedEntry(entry) && !isRunEntryDisabled(entry, approved)),
    ...runOnceEntries.filter(entry => !isBlockedEntry(entry)),
    ...folderEntries.filter(entry => !isBlockedEntry(entry) && !isFolderEntryDisabled(entry, approved)),
  ]

  disableExplorerRestart()

  for (const entry of launchableEntries) {
    launchEntry(entry)
  }

  const enabledMsix = getEnabledMsixEntries()
  if (enabledMsix.length > 0) {
    console.log(`[autostart] Launching ${enabledMsix.length} enabled MSIX startup apps...`)
    launchMsixApps(enabledMsix)
  }

  console.log(`[autostart] Launched ${launchableEntries.length} classic entries (${runEntries.length} registry, ${runOnceEntries.length} run-once, ${folderEntries.length} startup folder) and ${enabledMsix.length} MSIX apps`)
}

module.exports = {
  processAutostart,
  RUN_KEYS,
  RUN_ONCE_KEYS,
  STARTUP_FOLDERS,
  isBlockedEntry,
  expandEnvVars,
}
