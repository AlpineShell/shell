const { shell } = require('electron')
const { exec, execSync } = require('child_process')
const { promisify } = require('util')
const path = require('path')
const fs = require('fs')
const os = require('os')
const autostart = require('./autostart')
const knownApps = require('../knownApps')
const appIcons = require('./appIcons')
const appActivator = require('../appActivator')
const { APPROVED_BASE, APPROVED_ENABLED, APPROVED_DISABLED, parseApprovedMap } = require('./startupState')

const CPU_CORES = os.cpus().length || 1

const execAsync = promisify(exec)
const STARTUP_EXTS = new Set(['.lnk', '.exe', '.bat', '.cmd', '.vbs'])

let broadcastRef = null
let cachedStartup = []
const toggleInfoById = new Map()
const pendingChanges = new Map()
let history = []
let historySeq = 0
let cachedRunning = []
let startupRefreshing = false
let runningRefreshing = false

function run(command, opts = {}) {
  return execAsync(command, { windowsHide: true, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, ...opts })
    .then(({ stdout }) => stdout || '')
    .catch(() => '')
}

function exeFromCommand(command) {
  if (!command) return null
  const s = command.trim()
  if (s.startsWith('"')) {
    const end = s.indexOf('"', 1)
    return end > 0 ? s.slice(1, end) : s.slice(1)
  }
  const exeMatch = s.match(/^(.*?\.exe)\b/i)
  if (exeMatch) return exeMatch[1]
  const space = s.indexOf(' ')
  return space > 0 ? s.slice(0, space) : s
}

function resolveShortcutTarget(lnkPath) {
  try {
    const link = shell.readShortcutLink(lnkPath)
    return link.target || null
  } catch {
    return null
  }
}

const metaCache = new Map()
let metaSeq = 0

function basenameLower(p) {
  return p ? path.basename(p).toLowerCase() : null
}

async function enrichPaths(paths) {
  const need = [...new Set(paths.filter((p) => p && !metaCache.has(p.toLowerCase())))]
  if (need.length === 0) return
  const id = ++metaSeq
  const listFile = path.join(os.tmpdir(), `alpine-meta-${id}.json`)
  const scriptFile = path.join(os.tmpdir(), `alpine-meta-${id}.ps1`)
  const script = `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8\n$paths = Get-Content -Raw -LiteralPath '${listFile}' | ConvertFrom-Json\n$paths | ForEach-Object { $vi=$null; try { $vi = (Get-Item -LiteralPath $_ -ErrorAction Stop).VersionInfo } catch {}; [PSCustomObject]@{ p=$_; d=$vi.FileDescription; n=$vi.ProductName } } | ConvertTo-Json -Compress`
  try {
    fs.writeFileSync(listFile, JSON.stringify(need), 'utf8')
    fs.writeFileSync(scriptFile, script, 'utf8')
    const out = await run(`powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptFile}"`)
    let arr = []
    try { arr = JSON.parse(out || '[]') } catch {}
    if (!Array.isArray(arr)) arr = [arr]
    for (const m of arr) {
      if (!m || !m.p) continue
      const label = (m.d || m.n || '').trim()
      metaCache.set(m.p.toLowerCase(), label || null)
    }
  } catch {
  } finally {
    try { fs.unlinkSync(listFile) } catch {}
    try { fs.unlinkSync(scriptFile) } catch {}
  }
  for (const p of need) if (!metaCache.has(p.toLowerCase())) metaCache.set(p.toLowerCase(), null)
}

function friendlyName(target, fallback) {
  const base = basenameLower(target)
  if (base && knownApps[base]) return knownApps[base].name
  const meta = target ? metaCache.get(target.toLowerCase()) : null
  if (meta) return meta
  if (fallback && fallback.trim()) return fallback
  return base ? base.replace(/\.exe$/i, '') : 'Unknown app'
}

function blurbForTarget(target) {
  const base = basenameLower(target)
  return base && knownApps[base] ? (knownApps[base].blurb || null) : null
}

function classifyTarget(target) {
  const base = basenameLower(target)
  if (base && knownApps[base] && knownApps[base].category) return knownApps[base].category
  if (!target) return 'unknown'
  const p = target.toLowerCase()
  if (p.includes('\\windows\\')) return 'system'
  if (p.includes('\\program files')) return 'app'
  if (p.includes('\\users\\') || p.includes('\\appdata\\') || p.includes('\\programdata\\')) return 'app'
  return 'unknown'
}

function memoryBand(bytes) {
  const mb = bytes / (1024 * 1024)
  if (mb >= 250) return 'heavy'
  if (mb >= 60) return 'moderate'
  return 'light'
}

async function readApprovedMap(fullKey) {
  const out = await run(`reg query "${fullKey}"`)
  return parseApprovedMap(out)
}

async function readRegistryRunEntries() {
  const entries = []
  for (const key of [...autostart.RUN_KEYS, ...autostart.RUN_ONCE_KEYS]) {
    const out = await run(`reg query "${key}"`)
    for (const line of out.split('\n')) {
      const match = line.match(/^\s+(\S.*?)\s+REG_(?:SZ|EXPAND_SZ)\s+(.+)/)
      if (!match) continue
      const name = match[1].trim()
      if (name.toLowerCase() === 'alpineshell') continue
      const command = autostart.expandEnvVars(match[2].trim())
      const isMachine = key.startsWith('HKLM')
      const sub = /WOW6432Node/i.test(key) ? 'Run32' : 'Run'
      entries.push({
        source: 'registry',
        sourceLabel: 'Registry',
        name,
        command,
        scope: isMachine ? 'system' : 'user',
        location: key,
        approvedKey: `${isMachine ? 'HKLM' : 'HKCU'}\\${APPROVED_BASE}\\${sub}`,
        approvedSub: sub,
        approvedValue: name,
        hive: isMachine ? 'HKLM' : 'HKCU',
      })
    }
  }
  return entries
}

function readFolderEntries() {
  const entries = []
  autostart.STARTUP_FOLDERS.forEach((folder, index) => {
    const isMachine = index === 1
    try {
      if (!fs.existsSync(folder)) return
      for (const file of fs.readdirSync(folder)) {
        if (file.toLowerCase() === 'desktop.ini') continue
        const ext = path.extname(file).toLowerCase()
        if (!STARTUP_EXTS.has(ext)) continue
        const fullPath = path.join(folder, file)
        if (!fs.statSync(fullPath).isFile()) continue
        entries.push({
          source: 'folder',
          sourceLabel: 'Startup folder',
          name: path.basename(file, ext),
          command: fullPath,
          scope: isMachine ? 'system' : 'user',
          location: folder,
          approvedKey: `${isMachine ? 'HKLM' : 'HKCU'}\\${APPROVED_BASE}\\StartupFolder`,
          approvedSub: 'StartupFolder',
          approvedValue: file,
          hive: isMachine ? 'HKLM' : 'HKCU',
          isShortcut: ext === '.lnk',
        })
      }
    } catch {
    }
  })
  return entries
}

async function readScheduledLogonTasks() {
  const xml = await run('schtasks /query /xml ONE')
  const entries = []
  for (const block of xml.split('<?xml')) {
    if (!/<LogonTrigger>/.test(block)) continue
    const commandMatch = block.match(/<Command>([^<]+)<\/Command>/)
    if (!commandMatch) continue
    const uriMatch = block.match(/<URI>([^<]+)<\/URI>/)
    if (!uriMatch) continue
    const taskPath = uriMatch[1].trim()
    if (taskPath.toLowerCase().includes('alpineshell')) continue
    const settings = block.split('</Settings>')[0] || ''
    const enabled = !/<Enabled>false<\/Enabled>/i.test(settings)
    const command = autostart.expandEnvVars(commandMatch[1].trim())
    const argsMatch = block.match(/<Arguments>([^<]+)<\/Arguments>/)
    const args = argsMatch ? autostart.expandEnvVars(argsMatch[1].trim()) : ''
    entries.push({
      source: 'task',
      sourceLabel: 'Scheduled task',
      name: taskPath.replace(/^\\/, ''),
      command: args ? `"${command}" ${args}` : command,
      scope: 'system',
      location: taskPath,
      taskPath,
      enabledByTask: enabled,
    })
  }
  return entries
}

const MSIX_STARTUP_SCRIPT = `$OutputEncoding = [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
Get-AppxPackage | ForEach-Object {
  $pkg = $_
  try {
    $m = $pkg | Get-AppxPackageManifest
    $tasks = $m | Select-Xml -XPath '//*[local-name()="Extension"][@Category="windows.startupTask"]'
    if (-not $tasks) { return }
    $apps = $m | Select-Xml -XPath '//*[local-name()="Application"]'
    $appId = $null
    if ($apps) { $appId = $apps[0].Node.Id }
    $pkgDisplay = $m.Package.Properties.DisplayName
    foreach ($t in $tasks) {
      $st = $t.Node.StartupTask
      if (-not $st) { continue }
      $taskId = $st.TaskId
      $display = $st.DisplayName
      $enabled = "$($st.Enabled)".ToLower()
      $statePath = "HKCU:\\Software\\Classes\\Local Settings\\Software\\Microsoft\\Windows\\CurrentVersion\\AppModel\\SystemAppData\\$($pkg.PackageFamilyName)\\$taskId"
      try {
        $s = (Get-ItemProperty -LiteralPath $statePath -Name State -ErrorAction Stop).State
        if ($s -eq 2 -or $s -eq 4) { $enabled = 'true' } else { $enabled = 'false' }
      } catch {}
      Write-Output "$($pkg.PackageFamilyName)!$appId|$taskId|$display|$enabled|$($pkg.Name)|$pkgDisplay"
    }
  } catch {}
}`

async function readStartAppsMap() {
  const out = await run('powershell -NoProfile -Command "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Get-StartApps | ConvertTo-Json -Compress"')
  const byAumid = new Map()
  const byFamily = new Map()
  let arr = []
  try { arr = JSON.parse(out || '[]') } catch {}
  if (!Array.isArray(arr)) arr = [arr]
  for (const a of arr) {
    if (!a || !a.AppID || !a.Name) continue
    const aumid = String(a.AppID).toLowerCase()
    byAumid.set(aumid, a.Name)
    const family = aumid.split('!')[0]
    if (!byFamily.has(family)) byFamily.set(family, a.Name)
  }
  return { byAumid, byFamily }
}

function resolveMsixName({ usableDisplay, aumid, pkgDisplay, pkgName }, startApps) {
  const family = aumid.split('!')[0]
  const resolved = startApps.byAumid.get(aumid.toLowerCase()) || startApps.byFamily.get(family.toLowerCase())
  const display = (pkgDisplay || '').trim()
  const usablePkgDisplay = display && !/^ms-resource:/i.test(display) ? display : null
  return usableDisplay || resolved || usablePkgDisplay || prettyPackageName(pkgName) || family
}

async function readMsixStartupEntries(startApps) {
  const out = await runPsScript(MSIX_STARTUP_SCRIPT)
  const entries = []
  for (const line of out.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const [aumid, taskId, display, enabled, pkgName, pkgDisplay] = trimmed.split('|')
    if (!aumid || !taskId) continue
    const displayName = (display || '').trim()
    const usableDisplay = displayName && !/^ms-resource:/i.test(displayName) ? displayName : null
    entries.push({
      source: 'msix',
      sourceLabel: 'Microsoft Store app',
      name: resolveMsixName({ usableDisplay, aumid, pkgDisplay, pkgName }, startApps),
      command: aumid,
      scope: 'user',
      location: 'Packaged app',
      aumid,
      packageFamilyName: aumid.split('!')[0],
      taskId,
      enabledMsix: enabled === 'true',
    })
  }
  return entries
}

async function runningExeNames() {
  const out = await run('tasklist /fo csv /nh')
  const set = new Set()
  for (const line of out.split('\n')) {
    const match = line.match(/^"([^"]+)"/)
    if (match) set.add(match[1].toLowerCase())
  }
  return set
}

async function refreshStartup() {
  const startApps = await readStartAppsMap()
  const [regEntries, folderEntries, taskEntries, msixEntries, runningNames] = await Promise.all([
    readRegistryRunEntries(),
    Promise.resolve(readFolderEntries()),
    readScheduledLogonTasks(),
    readMsixStartupEntries(startApps),
    runningExeNames(),
  ])

  const approvedKeys = [...new Set([...regEntries, ...folderEntries].map((e) => e.approvedKey))]
  const approvedMaps = {}
  await Promise.all(approvedKeys.map(async (key) => { approvedMaps[key] = await readApprovedMap(key) }))

  toggleInfoById.clear()
  const result = []

  for (const e of [...regEntries, ...folderEntries]) {
    if (autostart.isBlockedEntry(e)) continue
    const id = `${e.source}|${e.approvedKey}|${e.approvedValue}`
    const disabled = approvedMaps[e.approvedKey]?.get(e.approvedValue.toLowerCase()) ?? false
    const target = e.isShortcut ? resolveShortcutTarget(e.command) : exeFromCommand(e.command)
    const exeName = target ? path.basename(target) : null
    toggleInfoById.set(id, { kind: 'approved', approvedKey: e.approvedKey, approvedValue: e.approvedValue })
    result.push({
      id,
      name: e.name,
      command: e.command,
      target,
      icon: null,
      source: e.source,
      sourceLabel: e.sourceLabel,
      scope: e.scope,
      enabled: !disabled,
      pending: pendingPendingState(id),
      running: exeName ? runningNames.has(exeName.toLowerCase()) : false,
      location: e.location,
    })
  }

  for (const e of taskEntries) {
    if (autostart.isBlockedEntry(e)) continue
    const id = `task|${e.taskPath}`
    const target = exeFromCommand(e.command)
    const exeName = target ? path.basename(target) : null
    toggleInfoById.set(id, { kind: 'task', taskPath: e.taskPath })
    result.push({
      id,
      name: e.name,
      command: e.command,
      target,
      icon: null,
      source: e.source,
      sourceLabel: e.sourceLabel,
      scope: e.scope,
      enabled: e.enabledByTask,
      pending: pendingPendingState(id),
      running: exeName ? runningNames.has(exeName.toLowerCase()) : false,
      location: e.location,
    })
  }

  for (const e of msixEntries) {
    const id = `msix|${e.aumid}|${e.taskId}`
    toggleInfoById.set(id, { kind: 'msix', packageFamilyName: e.packageFamilyName, taskId: e.taskId })
    result.push({
      id,
      name: e.name,
      command: e.command,
      target: null,
      icon: null,
      source: e.source,
      sourceLabel: e.sourceLabel,
      scope: e.scope,
      enabled: e.enabledMsix,
      pending: pendingPendingState(id),
      running: false,
      location: e.location,
    })
  }

  await enrichPaths(result.map((e) => e.target).filter(Boolean))
  const iconMap = await appIcons.resolveExeIcons(result.map((e) => e.target))
  for (const e of result) {
    e.icon = iconMap.get(e.target) || null
    e.friendlyName = friendlyName(e.target, e.name)
    e.category = e.source === 'msix' ? 'app' : classifyTarget(e.target)
    e.blurb = blurbForTarget(e.target)
    e.locked = e.category === 'system'
    e.missing = !!e.target && !e.target.toLowerCase().startsWith('shell:') && !fs.existsSync(e.target)
  }

  result.sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.friendlyName.localeCompare(b.friendlyName))
  cachedStartup = result
  return result
}

function pendingPendingState(id) {
  const change = pendingChanges.get(id)
  if (!change) return null
  return change.enabled ? 'enable' : 'disable'
}

function broadcastStartup() {
  if (broadcastRef) broadcastRef('apps/startup-changed', cachedStartup)
}

function broadcastHistory() {
  if (broadcastRef) broadcastRef('apps/startup-history-changed', history)
}

function addHistory(entry) {
  history = [{ seq: ++historySeq, ...entry }, ...history].slice(0, 8)
  broadcastHistory()
}

function setStartup({ id, enabled }, record = true) {
  const entry = cachedStartup.find((e) => e.id === id)
  const info = toggleInfoById.get(id)
  if (!entry || !info) return cachedStartup

  if (info.kind === 'msix') {
    const from = entry.enabled
    const statePath = `HKCU\\Software\\Classes\\Local Settings\\Software\\Microsoft\\Windows\\CurrentVersion\\AppModel\\SystemAppData\\${info.packageFamilyName}\\${info.taskId}`
    try {
      execSync(`reg add "${statePath}" /v State /t REG_DWORD /d ${enabled ? 2 : 1} /f`, { windowsHide: true })
      entry.enabled = enabled
      entry.pending = null
      if (record && from !== enabled) addHistory({ id, name: entry.name, from, to: enabled, scope: 'user' })
    } catch {
    }
    broadcastStartup()
    return cachedStartup
  }

  if (entry.scope === 'user' && info.kind === 'approved') {
    const from = entry.enabled
    try {
      execSync(`reg add "${info.approvedKey}" /v "${info.approvedValue}" /t REG_BINARY /d ${enabled ? APPROVED_ENABLED : APPROVED_DISABLED} /f`, { windowsHide: true })
      entry.enabled = enabled
      entry.pending = null
      if (record && from !== enabled) addHistory({ id, name: entry.name, from, to: enabled, scope: 'user' })
    } catch {
    }
  } else if (entry.enabled === enabled) {
    pendingChanges.delete(id)
    entry.pending = null
  } else {
    pendingChanges.set(id, { id, enabled, info, from: entry.enabled, name: entry.name, record })
    entry.pending = enabled ? 'enable' : 'disable'
  }

  broadcastStartup()
  return cachedStartup
}

function undo({ seq }) {
  const item = history.find((h) => h.seq === seq)
  if (!item) return cachedStartup
  history = history.filter((h) => h.seq !== seq)
  broadcastHistory()
  return setStartup({ id: item.id, enabled: item.from }, false)
}

function clearPending({ id }) {
  pendingChanges.delete(id)
  const entry = cachedStartup.find((e) => e.id === id)
  if (entry) entry.pending = null
  broadcastStartup()
  return cachedStartup
}

function removeStartup({ id }) {
  const entry = cachedStartup.find((e) => e.id === id)
  const info = toggleInfoById.get(id)
  if (!entry) return { ok: false, error: 'Item not found.' }
  if (entry.locked) return { ok: false, error: 'This item is protected.' }
  if (entry.scope !== 'user') return { ok: false, error: 'This item needs administrator approval to remove.' }
  try {
    if (entry.source === 'registry') {
      execSync(`reg delete "${entry.location}" /v "${entry.name}" /f`, { windowsHide: true })
      if (info && info.kind === 'approved') {
        try { execSync(`reg delete "${info.approvedKey}" /v "${info.approvedValue}" /f`, { windowsHide: true }) } catch {}
      }
    } else if (entry.source === 'folder') {
      fs.unlinkSync(entry.command)
    } else if (entry.source === 'task' && info && info.taskPath) {
      execSync(`schtasks /delete /tn "${info.taskPath}" /f`, { windowsHide: true })
    } else {
      return { ok: false, error: 'Could not remove this startup item.' }
    }
  } catch {
    return { ok: false, error: 'Could not remove this startup item.' }
  }
  cachedStartup = cachedStartup.filter((e) => e.id !== id)
  pendingChanges.delete(id)
  toggleInfoById.delete(id)
  broadcastStartup()
  refreshStartup().then(() => broadcastStartup()).catch(() => {})
  return { ok: true }
}

function buildElevatedLine({ info, enabled }) {
  if (info.kind === 'task') {
    return `schtasks /change /tn "${info.taskPath}" /${enabled ? 'enable' : 'disable'}`
  }
  return `reg add "${info.approvedKey}" /v "${info.approvedValue}" /t REG_BINARY /d ${enabled ? APPROVED_ENABLED : APPROVED_DISABLED} /f`
}

async function applySystemChanges() {
  const changes = [...pendingChanges.values()]
  if (changes.length === 0) return { ok: true }

  const payload = changes.map(buildElevatedLine).join('\r\n')
  const encoded = Buffer.from(payload, 'utf16le').toString('base64')
  const command = `powershell -NoProfile -Command "Start-Process powershell -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-EncodedCommand','${encoded}'"`

  try {
    await execAsync(command, { windowsHide: true })
  } catch {
    return { ok: false, error: 'Changes were not applied (elevation was cancelled).' }
  }

  for (const change of changes) {
    const entry = cachedStartup.find((e) => e.id === change.id)
    if (entry) {
      entry.enabled = change.enabled
      entry.pending = null
    }
    if (change.record !== false && change.from !== change.enabled) {
      addHistory({ id: change.id, name: change.name, from: change.from, to: change.enabled, scope: 'system' })
    }
  }
  pendingChanges.clear()
  broadcastStartup()
  return { ok: true }
}

async function listRunning() {
  const script = '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; $c=@{}; Get-CimInstance Win32_PerfFormattedData_PerfProc_Process | ForEach-Object { $c[[int]$_.IDProcess]=[int]$_.PercentProcessorTime }; Get-Process | ForEach-Object { $p=$null; try { $p=$_.Path } catch {}; [PSCustomObject]@{ id=$_.Id; name=$_.ProcessName; path=$p; mem=$_.WorkingSet64; cpu=$c[$_.Id]; win=([int64]$_.MainWindowHandle) } } | ConvertTo-Json -Compress'
  const out = await run(`powershell -NoProfile -Command "${script}"`)
  let raw = []
  try { raw = JSON.parse(out || '[]') } catch { raw = [] }
  if (!Array.isArray(raw)) raw = [raw]

  const groups = new Map()
  for (const proc of raw) {
    if (!proc || proc.id === 0 || proc.id === process.pid) continue
    if (proc.name === 'Idle' || proc.name === 'System') continue
    const key = (proc.name || 'Unknown').toLowerCase()
    let group = groups.get(key)
    if (!group) {
      group = { name: proc.name || 'Unknown', path: proc.path || null, memory: 0, cpuRaw: 0, count: 0, pids: [], hasWindow: false }
      groups.set(key, group)
    }
    group.memory += proc.mem || 0
    group.cpuRaw += proc.cpu || 0
    group.count++
    group.pids.push(proc.id)
    if (proc.win) group.hasWindow = true
    if (!group.path && proc.path) group.path = proc.path
  }

  const list = [...groups.values()]
  for (const group of list) {
    group.cpu = Math.min(100, Math.round(group.cpuRaw / CPU_CORES))
    delete group.cpuRaw
  }
  await enrichPaths(list.map((g) => g.path).filter(Boolean))
  const iconMap = await appIcons.resolveExeIcons(list.map((g) => g.path))
  for (const group of list) {
    group.icon = iconMap.get(group.path) || null
    group.friendlyName = friendlyName(group.path, group.name)
    group.category = classifyTarget(group.path)
    group.band = memoryBand(group.memory)
  }
  list.sort((a, b) => b.memory - a.memory)
  return list
}

async function getStartup() {
  if (cachedStartup.length === 0) return refreshStartup()
  if (!startupRefreshing) {
    startupRefreshing = true
    refreshStartup().then(() => broadcastStartup()).catch(() => {}).finally(() => { startupRefreshing = false })
  }
  return cachedStartup
}

async function getRunning() {
  if (cachedRunning.length === 0) {
    cachedRunning = await listRunning()
    return cachedRunning
  }
  if (!runningRefreshing) {
    runningRefreshing = true
    listRunning().then((list) => { cachedRunning = list }).catch(() => {}).finally(() => { runningRefreshing = false })
  }
  return cachedRunning
}

function endTask(pids) {
  for (const pid of pids || []) {
    try { execSync(`taskkill /F /PID ${pid}`, { windowsHide: true }) } catch {}
  }
  return { ok: true }
}

function openLocation(target) {
  if (!target) return { ok: false }
  try {
    if (fs.existsSync(target)) shell.showItemInFolder(target)
    else return { ok: false }
  } catch {
    return { ok: false }
  }
  return { ok: true }
}

let cachedInstalled = []
let installedById = new Map()
let installedInFlight = null
let installedListPromise = null
let installedListResolve = null
let installedRetries = 0

const DESKTOP_SCRIPT = `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$paths=@('HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall','HKLM:\\SOFTWARE\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall','HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall')
$out=foreach($p in $paths){ if(Test-Path $p){ Get-ChildItem $p -ErrorAction SilentlyContinue | ForEach-Object { $i=Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue; if($i.DisplayName -and -not $i.SystemComponent -and -not $i.ParentKeyName){ [PSCustomObject]@{ key=$_.PSChildName; name=$i.DisplayName; publisher=$i.Publisher; version=$i.DisplayVersion; icon=$i.DisplayIcon; loc=$i.InstallLocation; uninstall=$i.UninstallString; quiet=$i.QuietUninstallString } } } } }
$out | ConvertTo-Json -Compress`

const STORE_SCRIPT = `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Get-AppxPackage | Where-Object { $_.InstallLocation -and $_.SignatureKind -ne 'System' -and -not $_.IsFramework -and -not $_.NonRemovable } | ForEach-Object {
  $pkg=$_; $aumid=$null; $logo=$null; $dn=$null
  try {
    $m=Get-AppxPackageManifest $pkg
    $app=$m.Package.Applications.Application; if($app -is [array]){ $app=$app[0] }
    if($app.Id){ $aumid="$($pkg.PackageFamilyName)!$($app.Id)" }
    $logoRel=$null
    try{ $logoRel=$app.VisualElements.Square44x44Logo }catch{}
    if(-not $logoRel){ try{ $logoRel=$m.Package.Properties.Logo }catch{} }
    if($logoRel){ $logo=Join-Path $pkg.InstallLocation $logoRel }
    $dn=$m.Package.Properties.DisplayName
  } catch {}
  [PSCustomObject]@{ name=$pkg.Name; display=$dn; publisher=$pkg.Publisher; full=$pkg.PackageFullName; loc=$pkg.InstallLocation; aumid=$aumid; logo=$logo }
} | ConvertTo-Json -Compress`

async function runPsScript(script) {
  const id = ++metaSeq
  const file = path.join(os.tmpdir(), `alpine-ps-${id}.ps1`)
  try {
    fs.writeFileSync(file, script, 'utf8')
    return await run(`powershell -NoProfile -ExecutionPolicy Bypass -File "${file}"`)
  } catch {
    return ''
  } finally {
    try { fs.unlinkSync(file) } catch {}
  }
}

function parseIconSpec(displayIcon) {
  if (!displayIcon) return null
  let s = String(displayIcon).trim()
  let index = 0
  if (s.startsWith('"')) {
    const end = s.indexOf('"', 1)
    const rest = end > 0 ? s.slice(end + 1) : ''
    s = end > 0 ? s.slice(1, end) : s.slice(1)
    const m = rest.match(/,\s*(-?\d+)/)
    if (m) index = parseInt(m[1], 10)
  } else {
    const comma = s.lastIndexOf(',')
    if (comma > 2) {
      const tail = s.slice(comma + 1).trim()
      if (/^-?\d+$/.test(tail)) { index = parseInt(tail, 10); s = s.slice(0, comma) }
    }
  }
  s = s.trim()
  return s ? { path: s, index } : null
}

function cleanPublisher(pub) {
  if (!pub) return null
  const m = String(pub).match(/CN=([^,]+)/)
  return (m ? m[1] : String(pub)).trim() || null
}

function prettyPackageName(pkgName) {
  const last = String(pkgName || '').split('.').pop() || String(pkgName || '')
  return last.replace(/([a-z])([A-Z])/g, '$1 $2')
}

const SKIP_EXE = /^(unins|setup|install|update|crash|vcredist|vc_redist|helper|notif|repair|cleanup|report|dotnet)/i

function findInstallExe(dir, appName) {
  if (!dir) return null
  try {
    if (!fs.existsSync(dir)) return null
    const exes = fs.readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.exe') && !SKIP_EXE.test(e.name))
      .map((e) => e.name)
    if (!exes.length) return null
    const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
    const target = norm(appName || '')
    const named = exes.find((name) => {
      const b = norm(path.basename(name, '.exe'))
      return target && b && (target.includes(b) || b.includes(target))
    })
    if (named) return path.join(dir, named)
    let best = null
    let bestSize = -1
    for (const name of exes) {
      try { const size = fs.statSync(path.join(dir, name)).size; if (size > bestSize) { bestSize = size; best = name } } catch {}
    }
    return best ? path.join(dir, best) : null
  } catch {
    return null
  }
}

function isLaunchable(a, shortcuts) {
  if (a.source === 'store') return !!a.launchTarget
  const nameKey = appIcons.normName(a.name)
  if (nameKey && shortcuts.byName.has(nameKey)) return true
  if (a.launchTarget && shortcuts.byTarget.has(a.launchTarget.toLowerCase())) return true
  if (a.installLocation) {
    const loc = a.installLocation.toLowerCase().replace(/[\\/]+$/, '')
    if (shortcuts.list.some((s) => s.targetLower.startsWith(loc + '\\'))) return true
  }
  return false
}

const GAME_MARKERS = /(steamapps|steam:\/\/uninstall|[\\/]epic games[\\/]|gog galaxy|[\\/]riot games[\\/]|origin games|[\\/]ea games[\\/])/i
const COMPONENT_STRONG = /(redistributable|\bredist\b|vc_redist|\bruntime\b|\.net\b|visual c\+\+|\bsdk\b|targeting pack|directx|\bframework\b|web deploy|localdb|\bodbc\b|bonjour|webview2?|tools for office|update health|common components|control panels|hosting bundle|application support|mobile device support)/i
const COMPONENT_DRIVER = /((realtek|nvidia|intel|\bamd\b|audio|graphics|chipset|\busb\b|printer|\bprint\b|network|ethernet|wireless|wi-?fi|bluetooth|display|video|sound|disk|storage|touchpad|webcam|camera|miniport|chipset)\b.{0,20}driver|\bdriver\b.{0,20}(package|update|installer|software))/i
const COMPONENT_SOFT = /(\bservice\b|\bagent\b|\bhelper\b|\bhost\b|online services|\biis\b)/i

function isGameApp(a) {
  return GAME_MARKERS.test(a.installLocation || '') || GAME_MARKERS.test(a.uninstallCmd || '')
}

function isComponentApp(a) {
  if (a.source === 'store') return false
  if (isGameApp(a)) return false
  const name = a.name || ''
  if (COMPONENT_STRONG.test(name) || COMPONENT_DRIVER.test(name)) return true
  if (!a.launchable && COMPONENT_SOFT.test(name)) return true
  return false
}

function desktopIconSource(a, shortcuts) {
  if (a.iconPath) {
    const expanded = appIcons.expandEnv(a.iconPath)
    if (fs.existsSync(expanded)) return { path: expanded, index: a.iconIndex || 0 }
  }
  const nameKey = appIcons.normName(a.name)
  if (nameKey && shortcuts.byName.has(nameKey)) return shortcuts.byName.get(nameKey)
  if (a.launchTarget && shortcuts.byTarget.has(a.launchTarget.toLowerCase())) return shortcuts.byTarget.get(a.launchTarget.toLowerCase())
  if (a.installLocation) {
    const loc = a.installLocation.toLowerCase().replace(/[\\/]+$/, '')
    const under = shortcuts.list.find((s) => s.targetLower.startsWith(loc + '\\'))
    if (under) return under
  }
  if (a.launchTarget && fs.existsSync(a.launchTarget)) return { path: a.launchTarget, index: 0 }
  const exe = findInstallExe(a.installLocation, a.name)
  return exe ? { path: exe, index: 0 } : null
}

function matchStartupId(installLocation, launchTarget) {
  const loc = (installLocation || '').toLowerCase().replace(/[\\/]+$/, '')
  const launch = (launchTarget || '').toLowerCase()
  for (const e of cachedStartup) {
    if (!e.target) continue
    const t = e.target.toLowerCase()
    if (launch && t === launch) return e.id
    if (loc && t.startsWith(loc + '\\')) return e.id
  }
  return null
}

async function refreshInstalled() {
  if (cachedStartup.length === 0) { try { await refreshStartup() } catch {} }
  const [desktopOut, storeOut] = await Promise.all([runPsScript(DESKTOP_SCRIPT), runPsScript(STORE_SCRIPT)])

  const internal = []
  const seen = new Set()

  let desktop = []
  try { desktop = JSON.parse(desktopOut || '[]') } catch {}
  if (!Array.isArray(desktop)) desktop = [desktop]
  for (const d of desktop) {
    if (!d || !d.name) continue
    const id = `desktop:${d.key || d.name}`
    if (seen.has(id)) continue
    seen.add(id)
    const iconSpec = parseIconSpec(d.icon)
    const iconPath = iconSpec ? iconSpec.path : null
    const launchTarget = iconPath && /\.exe$/i.test(iconPath) ? iconPath : null
    const installLocation = d.loc || (launchTarget ? path.dirname(launchTarget) : null)
    internal.push({
      id, source: 'desktop', name: String(d.name).trim(), publisher: cleanPublisher(d.publisher), version: d.version || null,
      iconPath, iconIndex: iconSpec ? iconSpec.index : 0, installLocation, launchTarget, launchKind: launchTarget ? 'exe' : null,
      uninstallCmd: d.quiet || d.uninstall || null, uninstallPackage: null,
    })
  }

  let store = []
  try { store = JSON.parse(storeOut || '[]') } catch {}
  if (!Array.isArray(store)) store = [store]
  for (const s of store) {
    if (!s || !s.name) continue
    const id = `store:${s.full || s.name}`
    if (seen.has(id)) continue
    seen.add(id)
    const name = s.display && !String(s.display).startsWith('ms-resource') ? String(s.display) : prettyPackageName(s.name)
    internal.push({
      id, source: 'store', name, publisher: cleanPublisher(s.publisher), version: null,
      iconPath: appIcons.resolveStoreLogo(s.logo) || null, installLocation: s.loc || null, launchTarget: s.aumid || null, launchKind: s.aumid ? 'aumid' : null,
      uninstallCmd: null, uninstallPackage: s.full || null,
    })
  }

  for (const a of internal) a.startupId = matchStartupId(a.installLocation, a.launchTarget)
  const shortcuts = appIcons.buildShortcutIndex()
  for (const a of internal) a.launchable = isLaunchable(a, shortcuts)
  internal.sort((a, b) => a.name.localeCompare(b.name))
  installedById = new Map(internal.map((a) => [a.id, a]))

  const toPublic = (a) => ({
    id: a.id, name: a.name, publisher: a.publisher, version: a.version, icon: a.icon || null, source: a.source,
    isComponent: isComponentApp(a),
    startupId: a.startupId, canUninstall: !!(a.uninstallCmd || a.uninstallPackage),
    canOpen: !!(a.launchTarget || a.installLocation), canOpenLocation: !!(a.launchTarget || a.installLocation),
  })

  cachedInstalled = internal.map(toPublic)
  markInstalledListReady()
  broadcastInstalled()

  const genericIcon = await appIcons.ensureGenericIcon()

  const storeApps = internal.filter((a) => a.source === 'store')
  for (let i = 0; i < storeApps.length; i += 16) {
    await Promise.all(storeApps.slice(i, i + 16).map(async (a) => { a.icon = await appIcons.iconForFile(a.iconPath) }))
  }

  const desktopApps = internal.filter((a) => a.source === 'desktop')
  for (const a of desktopApps) a.iconSource = desktopIconSource(a, shortcuts)
  const withSource = desktopApps.filter((a) => a.iconSource)
  const extracted = await appIcons.resolveIcons(withSource.map((a) => a.iconSource))
  withSource.forEach((a, i) => { a.icon = extracted[i] })
  for (const a of internal) if (!a.icon) a.icon = genericIcon

  cachedInstalled = internal.map(toPublic)
  broadcastInstalled()
  return cachedInstalled
}

function broadcastInstalled() {
  if (broadcastRef) broadcastRef('apps/installed-changed', cachedInstalled)
}

function markInstalledListReady() {
  if (installedListResolve) {
    const resolve = installedListResolve
    installedListResolve = null
    resolve()
  }
}

function refreshInstalledShared() {
  if (!installedInFlight) {
    installedListPromise = new Promise((resolve) => { installedListResolve = resolve })
    installedInFlight = refreshInstalled()
      .catch(() => {})
      .finally(() => {
        installedInFlight = null
        markInstalledListReady()
        if (cachedInstalled.length > 0) {
          installedRetries = 0
        } else if (installedRetries < 3) {
          installedRetries++
          setTimeout(() => { refreshInstalledShared().then(broadcastInstalled).catch(() => {}) }, 2000)
        }
      })
  }
  return installedInFlight
}

async function getInstalled() {
  if (cachedInstalled.length === 0) {
    refreshInstalledShared()
    if (installedListPromise) await installedListPromise
    return cachedInstalled
  }
  refreshInstalledShared().then(broadcastInstalled).catch(() => {})
  return cachedInstalled
}

function afterUninstall() {
  refreshInstalledShared().then(broadcastInstalled).catch(() => {})
}

async function uninstallApp({ id }) {
  const app = installedById.get(id)
  if (!app) return { ok: false, error: 'App not found.' }
  if (app.source === 'store' && app.uninstallPackage) {
    try {
      await runPsScript(`Get-AppxPackage -ErrorAction SilentlyContinue | Where-Object { $_.PackageFullName -eq '${app.uninstallPackage}' } | Remove-AppxPackage -ErrorAction SilentlyContinue`)
    } catch {
      return { ok: false, error: 'Could not remove the app.' }
    }
    afterUninstall()
    return { ok: true }
  }
  if (app.uninstallCmd) {
    try { exec(app.uninstallCmd, { windowsHide: false }, () => afterUninstall()) } catch { return { ok: false, error: 'Could not start the uninstaller.' } }
    return { ok: true }
  }
  return { ok: false, error: 'No uninstaller available.' }
}

function cleanMatchName(text) {
  return appIcons.normName(String(text || '').replace(/\([^)]*\)/g, ' ').replace(/\b(v|version)?\d[\d.]*\b/gi, ' '))
}

async function uninstallByLaunch({ appId, target, name }) {
  if (cachedInstalled.length === 0) { try { await refreshInstalledShared() } catch {} }
  const apps = [...installedById.values()]

  if (appId && String(appId).includes('!')) {
    const aumid = String(appId).toLowerCase()
    const family = String(appId).split('!')[0]
    let match = apps.find((a) => a.source === 'store' && a.launchTarget && a.launchTarget.toLowerCase() === aumid)
    if (!match) match = apps.find((a) => a.source === 'store' && a.uninstallPackage && a.uninstallPackage.toLowerCase().startsWith(family.toLowerCase() + '_'))
    try {
      if (match && match.uninstallPackage) {
        await runPsScript(`Get-AppxPackage -ErrorAction SilentlyContinue | Where-Object { $_.PackageFullName -eq '${match.uninstallPackage}' } | Remove-AppxPackage -ErrorAction SilentlyContinue`)
      } else {
        await runPsScript(`Get-AppxPackage '${family}' -ErrorAction SilentlyContinue | Remove-AppxPackage -ErrorAction SilentlyContinue`)
      }
    } catch {
      return { ok: false, mode: 'store' }
    }
    afterUninstall()
    return { ok: true, mode: 'store' }
  }

  const targetLower = (target || '').toLowerCase()
  let match = apps.find((a) => a.source === 'desktop' && a.launchTarget && a.launchTarget.toLowerCase() === targetLower)
  if (!match && targetLower) {
    match = apps.find((a) => {
      if (a.source !== 'desktop' || !a.installLocation) return false
      const loc = a.installLocation.toLowerCase().replace(/[\\/]+$/, '')
      return targetLower.startsWith(loc + '\\')
    })
  }
  if (!match && name) {
    const nameKey = cleanMatchName(name)
    if (nameKey) match = apps.find((a) => a.source === 'desktop' && cleanMatchName(a.name) === nameKey)
  }
  if (match && match.uninstallCmd) {
    try { exec(match.uninstallCmd, { windowsHide: false }, () => afterUninstall()) } catch { return { ok: false, mode: 'desktop' } }
    return { ok: true, mode: 'desktop' }
  }

  try { shell.openExternal('ms-settings:appsfeatures') } catch {}
  return { ok: true, mode: 'settings' }
}

function openApp({ id }) {
  const app = installedById.get(id)
  if (!app) return { ok: false }
  try {
    if (app.launchKind === 'exe' && app.launchTarget) { shell.openPath(app.launchTarget); return { ok: true } }
    if (app.launchKind === 'aumid' && app.launchTarget) { appActivator.activate(app.launchTarget); return { ok: true } }
    if (app.installLocation) { shell.openPath(app.installLocation); return { ok: true } }
  } catch {}
  return { ok: false }
}

function openInstalledLocation({ id }) {
  const app = installedById.get(id)
  if (!app) return { ok: false }
  try {
    if (app.launchTarget && app.launchKind === 'exe' && fs.existsSync(app.launchTarget)) { shell.showItemInFolder(app.launchTarget); return { ok: true } }
    if (app.installLocation && fs.existsSync(app.installLocation)) { shell.openPath(app.installLocation); return { ok: true } }
  } catch {}
  return { ok: false }
}

const BOOT_DEFER_MS = 15000

module.exports = {
  handlers: {
    'apps/startup-list': () => getStartup(),
    'apps/startup-set': (_event, payload) => setStartup(payload),
    'apps/startup-clear-pending': (_event, payload) => clearPending(payload),
    'apps/startup-remove': (_event, payload) => removeStartup(payload),
    'apps/startup-apply-system': () => applySystemChanges(),
    'apps/startup-history': () => history,
    'apps/startup-undo': (_event, payload) => undo(payload),
    'apps/running-list': () => getRunning(),
    'apps/end-task': (_event, pids) => endTask(pids),
    'apps/open-location': (_event, target) => openLocation(target),
    'apps/installed-list': () => getInstalled(),
    'apps/installed-uninstall': (_event, payload) => uninstallApp(payload),
    'apps/installed-open': (_event, payload) => openApp(payload),
    'apps/installed-open-location': (_event, payload) => openInstalledLocation(payload),
  },
  uninstallByLaunch,
  start(broadcast) {
    broadcastRef = broadcast
    setTimeout(() => {
      refreshStartup()
        .catch(() => {})
        .then(() => refreshInstalledShared())
        .then(broadcastInstalled)
        .catch(() => {})
      listRunning().then((list) => { cachedRunning = list }).catch(() => {})
    }, BOOT_DEFER_MS)
  },
}
