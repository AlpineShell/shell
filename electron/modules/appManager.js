const { app, shell } = require('electron')
const { exec, execSync } = require('child_process')
const { promisify } = require('util')
const path = require('path')
const fs = require('fs')
const os = require('os')
const autostart = require('./autostart')
const knownApps = require('../knownApps')

const CPU_CORES = os.cpus().length || 1

const execAsync = promisify(exec)

const APPROVED_BASE = 'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved'
const APPROVED_ENABLED = '020000000000000000000000'
const APPROVED_DISABLED = '030000000000000000000000'
const STARTUP_EXTS = new Set(['.lnk', '.exe', '.bat', '.cmd', '.vbs'])

let broadcastRef = null
let cachedStartup = []
const toggleInfoById = new Map()
const pendingChanges = new Map()
const iconCache = new Map()
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

async function iconFor(filePath) {
  if (!filePath) return null
  const key = filePath.toLowerCase()
  if (iconCache.has(key)) return iconCache.get(key)
  try {
    const image = await app.getFileIcon(filePath, { size: 'normal' })
    const url = image.isEmpty() ? null : image.toDataURL()
    iconCache.set(key, url)
    return url
  } catch {
    iconCache.set(key, null)
    return null
  }
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
  const script = `$paths = Get-Content -Raw -LiteralPath '${listFile}' | ConvertFrom-Json\n$paths | ForEach-Object { $vi=$null; try { $vi = (Get-Item -LiteralPath $_ -ErrorAction Stop).VersionInfo } catch {}; [PSCustomObject]@{ p=$_; d=$vi.FileDescription; n=$vi.ProductName } } | ConvertTo-Json -Compress`
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
  const map = new Map()
  for (const line of out.split('\n')) {
    const match = line.match(/^\s+(.+?)\s+REG_BINARY\s+([0-9A-Fa-f]+)/)
    if (!match) continue
    const firstByte = parseInt(match[2].slice(0, 2), 16)
    map.set(match[1].trim().toLowerCase(), (firstByte & 0x03) === 0x03)
  }
  return map
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
  const [regEntries, folderEntries, taskEntries, runningNames] = await Promise.all([
    readRegistryRunEntries(),
    Promise.resolve(readFolderEntries()),
    readScheduledLogonTasks(),
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
      icon: await iconFor(target),
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
      icon: await iconFor(target),
      source: e.source,
      sourceLabel: e.sourceLabel,
      scope: e.scope,
      enabled: e.enabledByTask,
      pending: pendingPendingState(id),
      running: exeName ? runningNames.has(exeName.toLowerCase()) : false,
      location: e.location,
    })
  }

  await enrichPaths(result.map((e) => e.target).filter(Boolean))
  for (const e of result) {
    e.friendlyName = friendlyName(e.target, e.name)
    e.category = classifyTarget(e.target)
    e.blurb = blurbForTarget(e.target)
    e.locked = e.category === 'system'
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
  const script = '$c=@{}; Get-CimInstance Win32_PerfFormattedData_PerfProc_Process | ForEach-Object { $c[[int]$_.IDProcess]=[int]$_.PercentProcessorTime }; Get-Process | ForEach-Object { $p=$null; try { $p=$_.Path } catch {}; [PSCustomObject]@{ id=$_.Id; name=$_.ProcessName; path=$p; mem=$_.WorkingSet64; cpu=$c[$_.Id] } } | ConvertTo-Json -Compress'
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
      group = { name: proc.name || 'Unknown', path: proc.path || null, memory: 0, cpuRaw: 0, count: 0, pids: [] }
      groups.set(key, group)
    }
    group.memory += proc.mem || 0
    group.cpuRaw += proc.cpu || 0
    group.count++
    group.pids.push(proc.id)
    if (!group.path && proc.path) group.path = proc.path
  }

  const list = [...groups.values()]
  for (const group of list) {
    group.icon = await iconFor(group.path)
    group.cpu = Math.min(100, Math.round(group.cpuRaw / CPU_CORES))
    delete group.cpuRaw
  }
  await enrichPaths(list.map((g) => g.path).filter(Boolean))
  for (const group of list) {
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
let installedRefreshing = false

const DESKTOP_SCRIPT = `$paths=@('HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall','HKLM:\\SOFTWARE\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall','HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall')
$out=foreach($p in $paths){ if(Test-Path $p){ Get-ChildItem $p -ErrorAction SilentlyContinue | ForEach-Object { $i=Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue; if($i.DisplayName -and -not $i.SystemComponent -and -not $i.ParentKeyName){ [PSCustomObject]@{ key=$_.PSChildName; name=$i.DisplayName; publisher=$i.Publisher; version=$i.DisplayVersion; icon=$i.DisplayIcon; loc=$i.InstallLocation; uninstall=$i.UninstallString; quiet=$i.QuietUninstallString } } } } }
$out | ConvertTo-Json -Compress`

const STORE_SCRIPT = `Get-AppxPackage | Where-Object { $_.InstallLocation -and $_.SignatureKind -ne 'System' -and -not $_.IsFramework -and -not $_.NonRemovable } | ForEach-Object {
  $pkg=$_; $aumid=$null; $logo=$null; $dn=$null
  try {
    $m=Get-AppxPackageManifest $pkg
    $app=$m.Package.Applications.Application; if($app -is [array]){ $app=$app[0] }
    if($app.Id){ $aumid="$($pkg.PackageFamilyName)!$($app.Id)" }
    $logoRel=$m.Package.Properties.Logo; if($logoRel){ $logo=Join-Path $pkg.InstallLocation $logoRel }
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
  } finally {
    try { fs.unlinkSync(file) } catch {}
  }
}

function parseIconPath(displayIcon) {
  if (!displayIcon) return null
  let s = String(displayIcon).trim()
  if (s.startsWith('"')) { const end = s.indexOf('"', 1); s = end > 0 ? s.slice(1, end) : s.slice(1) }
  else { const comma = s.lastIndexOf(','); if (comma > 2) s = s.slice(0, comma) }
  return s.trim() || null
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
    const iconPath = parseIconPath(d.icon)
    const launchTarget = iconPath && /\.exe$/i.test(iconPath) ? iconPath : null
    const installLocation = d.loc || (launchTarget ? path.dirname(launchTarget) : null)
    internal.push({
      id, source: 'desktop', name: String(d.name).trim(), publisher: cleanPublisher(d.publisher), version: d.version || null,
      iconPath, installLocation, launchTarget, launchKind: launchTarget ? 'exe' : null,
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
      iconPath: s.logo || null, installLocation: s.loc || null, launchTarget: s.aumid || null, launchKind: s.aumid ? 'aumid' : null,
      uninstallCmd: null, uninstallPackage: s.full || null,
    })
  }

  for (let i = 0; i < internal.length; i += 16) {
    await Promise.all(internal.slice(i, i + 16).map(async (a) => { a.icon = await iconFor(a.iconPath) }))
  }
  for (const a of internal) a.startupId = matchStartupId(a.installLocation, a.launchTarget)

  internal.sort((a, b) => a.name.localeCompare(b.name))
  installedById = new Map(internal.map((a) => [a.id, a]))
  cachedInstalled = internal.map((a) => ({
    id: a.id, name: a.name, publisher: a.publisher, version: a.version, icon: a.icon || null, source: a.source,
    startupId: a.startupId, canUninstall: !!(a.uninstallCmd || a.uninstallPackage),
    canOpen: !!(a.launchTarget || a.installLocation), canOpenLocation: !!(a.launchTarget || a.installLocation),
  }))
  return cachedInstalled
}

function broadcastInstalled() {
  if (broadcastRef) broadcastRef('apps/installed-changed', cachedInstalled)
}

async function getInstalled() {
  if (cachedInstalled.length === 0) return refreshInstalled()
  if (!installedRefreshing) {
    installedRefreshing = true
    refreshInstalled().then(broadcastInstalled).catch(() => {}).finally(() => { installedRefreshing = false })
  }
  return cachedInstalled
}

function afterUninstall() {
  refreshInstalled().then(broadcastInstalled).catch(() => {})
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

function openApp({ id }) {
  const app = installedById.get(id)
  if (!app) return { ok: false }
  try {
    if (app.launchKind === 'exe' && app.launchTarget) { shell.openPath(app.launchTarget); return { ok: true } }
    if (app.launchKind === 'aumid' && app.launchTarget) { exec(`explorer.exe shell:AppsFolder\\${app.launchTarget}`, { windowsHide: true }); return { ok: true } }
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

module.exports = {
  handlers: {
    'apps/startup-list': () => getStartup(),
    'apps/startup-set': (_event, payload) => setStartup(payload),
    'apps/startup-clear-pending': (_event, payload) => clearPending(payload),
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
  start(broadcast) {
    broadcastRef = broadcast
    refreshStartup().catch(() => {})
    listRunning().then((list) => { cachedRunning = list }).catch(() => {})
  },
}
