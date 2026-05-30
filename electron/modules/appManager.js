const { app, shell } = require('electron')
const { exec, execSync } = require('child_process')
const { promisify } = require('util')
const path = require('path')
const fs = require('fs')
const os = require('os')
const autostart = require('./autostart')

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

async function readApprovedMap(fullKey) {
  const out = await run(`reg query "${fullKey}"`)
  const map = new Map()
  for (const line of out.split('\n')) {
    const match = line.match(/^\s+(.+?)\s+REG_BINARY\s+([0-9A-Fa-f]+)/)
    if (!match) continue
    const firstByte = parseInt(match[2].slice(0, 2), 16)
    map.set(match[1].trim().toLowerCase(), (firstByte & 0x01) === 1)
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

  result.sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.name.localeCompare(b.name))
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
  },
  start(broadcast) {
    broadcastRef = broadcast
    refreshStartup().catch(() => {})
    listRunning().then((list) => { cachedRunning = list }).catch(() => {})
  },
}
