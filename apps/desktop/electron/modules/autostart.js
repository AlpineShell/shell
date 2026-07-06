const { exec, execFile } = require('child_process')
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

function execText(cmd, opts = {}) {
  return new Promise((resolve) => {
    exec(cmd, { windowsHide: true, encoding: 'utf8', ...opts }, (err, stdout) => {
      resolve(err ? '' : (stdout || ''))
    })
  })
}

const LAUNCH_STAGGER_MS = 400
const MSIX_CACHE_REFRESH_DELAY_MS = 60000

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isBlockedEntry(entry) {
  const cmd = entry.command.replace(/"/g, '').toLowerCase()
  const basename = path.basename(cmd.split(/\s+/)[0])
  return BLOCKED_EXECUTABLES.some(blocked => basename === blocked || basename === blocked + '.exe')
}

async function disableExplorerRestart() {
  await execText('reg add "HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon" /v RestartApps /t REG_DWORD /d 0 /f')
  console.log('[autostart] Explorer restart prevention applied')
}

async function isShellReplacement() {
  const hives = [
    'HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon',
    'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon',
  ]

  for (const hive of hives) {
    const result = await execText(`reg query "${hive}" /v Shell`)
    const match = result.match(/REG_SZ\s+(.+)/)
    if (!match) continue
    const shellValue = match[1].trim().toLowerCase()
    if (!shellValue.includes('explorer.exe')) return true
  }

  return false
}

function expandEnvVars(str) {
  return str.replace(/%([^%]+)%/g, (_, key) => process.env[key] || `%${key}%`)
}

async function getRunEntries(keys) {
  const entries = []

  for (const key of keys) {
    const result = await execText(`reg query "${key}"`)
    const lines = result.split('\n')

    for (const line of lines) {
      const match = line.match(/^\s+(\S.*?)\s+REG_(?:SZ|EXPAND_SZ)\s+(.+)/)
      if (!match) continue

      const name = match[1].trim()
      const value = expandEnvVars(match[2].trim())

      if (name.toLowerCase() === 'alpineshell') continue

      entries.push({ name, command: value, registryKey: key })
    }
  }

  return entries
}

async function deleteRunOnceEntry(registryKey, name) {
  await execText(`reg delete "${registryKey}" /v "${name}" /f`)
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

async function readApprovedMap(fullKey) {
  const out = await execText(`reg query "${fullKey}"`)
  if (!out) return new Map()
  try {
    return parseApprovedMap(out)
  } catch {
    return new Map()
  }
}

async function readMsixStateEnabled(aumid, taskId) {
  const packageFamilyName = (aumid || '').split('!')[0]
  if (!packageFamilyName || !taskId) return null
  const out = await execText(
    `reg query "HKCU\\Software\\Classes\\Local Settings\\Software\\Microsoft\\Windows\\CurrentVersion\\AppModel\\SystemAppData\\${packageFamilyName}\\${taskId}" /v State`
  )
  if (!out) return null
  const match = out.match(/State\s+REG_DWORD\s+0x([0-9a-fA-F]+)/)
  if (!match) return null
  return isMsixStateEnabled(parseInt(match[1], 16))
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

async function getMsixStartupEntries() {
  try {
    const tmpFile = path.join(process.env.TEMP || 'C:\\Windows\\Temp', 'alpine-msix-query.ps1')
    fs.writeFileSync(tmpFile, MSIX_STARTUP_PS, 'utf8')

    const result = await execText(
      `powershell -NoProfile -ExecutionPolicy Bypass -File "${tmpFile}"`,
      { timeout: 30000 }
    )

    try { fs.unlinkSync(tmpFile) } catch {}

    return parseMsixStartupOutput(result)
  } catch (e) {
    console.error('[autostart] Failed to query MSIX startup tasks:', e.message)
    return []
  }
}

function ensureMsixLauncher() {
  return new Promise((resolve) => {
    if (fs.existsSync(MSIX_EXE_CACHE)) return resolve(MSIX_EXE_CACHE)
    if (!fs.existsSync(CSC_PATH)) {
      console.error('[autostart] csc.exe not found, cannot compile MSIX launcher')
      return resolve(null)
    }
    try { fs.mkdirSync(path.dirname(MSIX_EXE_CACHE), { recursive: true }) } catch {}
    execFile(CSC_PATH, ['/nologo', '/optimize', '/target:exe', `/out:${MSIX_EXE_CACHE}`, MSIX_LAUNCHER_SRC], { windowsHide: true }, (err) => {
      if (err) {
        console.error('[autostart] Failed to compile MSIX launcher:', err.message)
        return resolve(null)
      }
      console.log('[autostart] Compiled MSIX launcher exe')
      resolve(MSIX_EXE_CACHE)
    })
  })
}

async function launchMsixApps(entries) {
  if (entries.length === 0) return

  const exePath = await ensureMsixLauncher()
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

async function readApprovedState() {
  const [run, run32, folderUser, folderCommon] = await Promise.all([
    Promise.all([readApprovedMap(`HKCU\\${APPROVED_BASE}\\Run`), readApprovedMap(`HKLM\\${APPROVED_BASE}\\Run`)]),
    Promise.all([readApprovedMap(`HKCU\\${APPROVED_BASE}\\Run32`), readApprovedMap(`HKLM\\${APPROVED_BASE}\\Run32`)]),
    readApprovedMap(`HKCU\\${APPROVED_BASE}\\StartupFolder`),
    readApprovedMap(`HKLM\\${APPROVED_BASE}\\StartupFolder`),
  ])
  return {
    run: { HKCU: run[0], HKLM: run[1] },
    run32: { HKCU: run32[0], HKLM: run32[1] },
    folder: { user: folderUser, common: folderCommon },
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

async function getEnabledMsixEntries() {
  const cached = getMsixCached()
  let entries
  if (cached && cached.length > 0 && cached.every(e => e && e.aumid && e.taskId)) {
    entries = cached
    setTimeout(() => refreshMsixCache(), MSIX_CACHE_REFRESH_DELAY_MS)
  } else {
    entries = await getMsixStartupEntries()
    try {
      fs.mkdirSync(path.dirname(MSIX_CACHE_FILE), { recursive: true })
      fs.writeFileSync(MSIX_CACHE_FILE, JSON.stringify(entries, null, 2), 'utf8')
    } catch {}
  }

  const fresh = await Promise.all(entries.map(entry => readMsixStateEnabled(entry.aumid, entry.taskId)))
  return entries.filter((entry, i) => (fresh[i] === null ? entry.enabled === true : fresh[i]))
}

async function processAutostart() {
  if (!(await isShellReplacement())) {
    console.log('[autostart] Not the registered shell, skipping autostart')
    return
  }

  console.log('[autostart] Processing startup entries...')

  const [runEntries, runOnceEntries, approved] = await Promise.all([
    getRunEntries(RUN_KEYS),
    getRunEntries(RUN_ONCE_KEYS),
    readApprovedState(),
  ])
  const folderEntries = getStartupFolderEntries()

  for (const entry of runOnceEntries) {
    await deleteRunOnceEntry(entry.registryKey, entry.name)
  }

  const launchableEntries = [
    ...runEntries.filter(entry => !isBlockedEntry(entry) && !isRunEntryDisabled(entry, approved)),
    ...runOnceEntries.filter(entry => !isBlockedEntry(entry)),
    ...folderEntries.filter(entry => !isBlockedEntry(entry) && !isFolderEntryDisabled(entry, approved)),
  ]

  await disableExplorerRestart()

  for (const entry of launchableEntries) {
    launchEntry(entry)
    await delay(LAUNCH_STAGGER_MS)
  }

  const enabledMsix = await getEnabledMsixEntries()
  if (enabledMsix.length > 0) {
    console.log(`[autostart] Launching ${enabledMsix.length} enabled MSIX startup apps...`)
    await launchMsixApps(enabledMsix)
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
