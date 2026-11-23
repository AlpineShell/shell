function loadRawFs(requireModule = require) {
  try {
    return requireModule('original-fs')
  } catch {
    return requireModule('fs')
  }
}

const fs = loadRawFs()
const path = require('path')
const crypto = require('crypto')
const { execFile, execFileSync, spawn } = require('child_process')
const releaseVersions = require('../releaseVersions')
const { regQuery } = require('../registryRead')
const { GPU_PREFERENCES_KEY } = require('./gpuPreference')

const VERSIONS_DIR_NAME = 'versions'
const STAGING_SUFFIX = '.staging'
const PENDING_SWAP_FILE = 'pending-swap.json'
const PENDING_SWAP_MAX_AGE_MS = 5 * 60 * 1000
const STAGE_TIMEOUT_MS = 5 * 60 * 1000
const HARDLINK_MIN_BYTES = 64 * 1024
const HASH_CHUNK_BYTES = 1024 * 1024
const REMOVE_DIR_OPTIONS = { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }
const WAIT_POLL_MS = 25
const DEFAULT_WAIT_PID_TIMEOUT_MS = 8000
const WINLOGON_KEY = 'HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon'
const RUN_KEY = 'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run'
const RUN_VALUE_NAME = 'AlpineShell'
const UNINSTALL_KEY_BASE = 'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall'
const AUTOSTART_LAUNCH_ARG = '--autostart'
const UPDATE_SWAP_FLAG = '--update-swap'
const WAIT_PID_FLAG = '--wait-pid'
const UPDATE_ROLLBACK_FLAG = '--update-rollback'
const REQUIRED_STAGED_FILES = [
  ['resources', 'app.asar'],
]
const WAIT_BUFFER = new Int32Array(new SharedArrayBuffer(4))

function normalizeForComparison(filePath) {
  return path.resolve(String(filePath || '')).toLowerCase()
}

function samePath(a, b) {
  if (!a || !b) return false
  return normalizeForComparison(a) === normalizeForComparison(b)
}

function isSafeVersionName(version) {
  if (typeof version !== 'string' || !releaseVersions.isVersion(version)) return false
  if (version.includes('/') || version.includes('\\') || version.includes('..')) return false
  return path.basename(version) === version
}

function canStageVersion(targetVersion, currentVersion) {
  if (!isSafeVersionName(targetVersion)) return false
  if (!releaseVersions.isVersion(currentVersion)) return true
  return releaseVersions.compareVersions(targetVersion, currentVersion) > 0
}

function resolveInstallRoot(execPath, canonicalInstallDir) {
  if (!execPath) return canonicalInstallDir
  const exeDir = path.dirname(path.resolve(execPath))
  const parentDir = path.dirname(exeDir)
  if (path.basename(parentDir).toLowerCase() === VERSIONS_DIR_NAME) {
    return path.dirname(parentDir)
  }
  return exeDir
}

function versionsDirFor(installRoot) {
  return path.join(installRoot, VERSIONS_DIR_NAME)
}

function versionDirFor(installRoot, version) {
  if (!isSafeVersionName(version)) throw new Error(`Invalid update version: ${version}`)
  return path.join(versionsDirFor(installRoot), version)
}

function stagingDirFor(installRoot, version) {
  if (!isSafeVersionName(version)) throw new Error(`Invalid update version: ${version}`)
  return path.join(versionsDirFor(installRoot), `${version}${STAGING_SUFFIX}`)
}

function stagedExePathFor(installRoot, version, exeName) {
  return path.join(versionDirFor(installRoot, version), exeName)
}

function isCompleteVersionDir(dirPath, exeName, fileSystem = fs) {
  if (!dirPath || !exeName) return false
  if (!fileSystem.existsSync(path.join(dirPath, exeName))) return false
  return REQUIRED_STAGED_FILES.every((segments) => fileSystem.existsSync(path.join(dirPath, ...segments)))
}

function hashFileSha256(filePath, fileSystem = fs) {
  const hash = crypto.createHash('sha256')
  if (typeof fileSystem.openSync !== 'function' || typeof fileSystem.readSync !== 'function' || typeof fileSystem.closeSync !== 'function') {
    return hash.update(fileSystem.readFileSync(filePath)).digest('hex')
  }
  const fd = fileSystem.openSync(filePath, 'r')
  const buffer = Buffer.allocUnsafe(HASH_CHUNK_BYTES)
  try {
    for (;;) {
      const bytesRead = fileSystem.readSync(fd, buffer, 0, buffer.length, null)
      if (bytesRead <= 0) break
      hash.update(bytesRead === buffer.length ? buffer : buffer.subarray(0, bytesRead))
    }
  } finally {
    fileSystem.closeSync(fd)
  }
  return hash.digest('hex')
}

function collectRelativeFiles(rootDir, currentRelative = '', fileSystem = fs) {
  const results = []
  const dirPath = currentRelative ? path.join(rootDir, currentRelative) : rootDir
  let entries
  try {
    entries = fileSystem.readdirSync(dirPath, { withFileTypes: true })
  } catch {
    return results
  }
  for (const entry of entries) {
    const relative = currentRelative ? path.join(currentRelative, entry.name) : entry.name
    if (entry.isDirectory()) {
      results.push(...collectRelativeFiles(rootDir, relative, fileSystem))
    } else if (entry.isFile()) {
      results.push(relative)
    }
  }
  return results
}

function deduplicateWithHardlinks(referenceDir, targetDir, { fileSystem = fs, minBytes = HARDLINK_MIN_BYTES } = {}) {
  if (!referenceDir || !targetDir || samePath(referenceDir, targetDir)) return 0
  if (!fileSystem.existsSync(referenceDir) || !fileSystem.existsSync(targetDir)) return 0
  let linked = 0
  for (const relativePath of collectRelativeFiles(targetDir, '', fileSystem)) {
    const targetFile = path.join(targetDir, relativePath)
    const referenceFile = path.join(referenceDir, relativePath)
    try {
      const targetStat = fileSystem.statSync(targetFile)
      if (targetStat.size < minBytes) continue
      const referenceStat = fileSystem.statSync(referenceFile)
      if (!referenceStat.isFile() || referenceStat.size !== targetStat.size) continue
      if (targetStat.ino && referenceStat.ino && targetStat.ino === referenceStat.ino && targetStat.dev === referenceStat.dev) continue
      if (hashFileSha256(targetFile, fileSystem) !== hashFileSha256(referenceFile, fileSystem)) continue
      const backupFile = `${targetFile}.relink`
      fileSystem.renameSync(targetFile, backupFile)
      try {
        fileSystem.linkSync(referenceFile, targetFile)
        fileSystem.unlinkSync(backupFile)
        linked += 1
      } catch {
        try { fileSystem.renameSync(backupFile, targetFile) } catch {}
      }
    } catch {}
  }
  return linked
}

function runNsisStagingExtractor(installerPath, stagingDir) {
  return new Promise((resolve, reject) => {
    execFile(
      installerPath,
      ['/S', `--stage-to=${stagingDir}`],
      { windowsHide: true, timeout: STAGE_TIMEOUT_MS },
      (error) => {
        if (error) reject(error)
        else resolve()
      }
    )
  })
}

const RENAME_RETRY_CODES = new Set(['EPERM', 'EACCES', 'EBUSY'])
const RENAME_MAX_ATTEMPTS = 10
const RENAME_RETRY_DELAY_MS = 250

async function renameDirWithRetry(fromPath, toPath, fileSystem = fs, delayMs = RENAME_RETRY_DELAY_MS) {
  for (let attempt = 0; attempt < RENAME_MAX_ATTEMPTS; attempt++) {
    try {
      fileSystem.renameSync(fromPath, toPath)
      return
    } catch (error) {
      if (!error || !RENAME_RETRY_CODES.has(error.code) || attempt === RENAME_MAX_ATTEMPTS - 1) {
        throw error
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
}

async function stageInstaller({
  installerPath,
  version,
  currentVersion,
  installRoot,
  currentDir,
  exeName,
  fileSystem = fs,
  runExtractor = runNsisStagingExtractor,
  renameRetryDelayMs = RENAME_RETRY_DELAY_MS,
}) {
  if (!installerPath || !fileSystem.existsSync(installerPath)) {
    return { ok: false, reason: 'missing-installer' }
  }
  if (!canStageVersion(version, currentVersion)) {
    return { ok: false, reason: 'version-not-stageable' }
  }

  const targetDir = versionDirFor(installRoot, version)
  const exePath = path.join(targetDir, exeName)
  if (isCompleteVersionDir(targetDir, exeName, fileSystem)) {
    return { ok: true, exePath, versionDir: targetDir, reused: true }
  }

  const stagingDir = stagingDirFor(installRoot, version)
  try {
    fileSystem.mkdirSync(versionsDirFor(installRoot), { recursive: true })
    fileSystem.rmSync(stagingDir, REMOVE_DIR_OPTIONS)
    fileSystem.mkdirSync(stagingDir, { recursive: true })
    await runExtractor(installerPath, stagingDir)
    if (!isCompleteVersionDir(stagingDir, exeName, fileSystem)) {
      fileSystem.rmSync(stagingDir, REMOVE_DIR_OPTIONS)
      return { ok: false, reason: 'incomplete-staging' }
    }
    deduplicateWithHardlinks(currentDir, stagingDir, { fileSystem })
    fileSystem.rmSync(targetDir, REMOVE_DIR_OPTIONS)
    await renameDirWithRetry(stagingDir, targetDir, fileSystem, renameRetryDelayMs)
    return { ok: true, exePath, versionDir: targetDir, reused: false }
  } catch (error) {
    try { fileSystem.rmSync(stagingDir, REMOVE_DIR_OPTIONS) } catch {}
    return { ok: false, reason: error && error.message ? error.message : 'stage-failed' }
  }
}

function pendingSwapPath(userDataDir) {
  return path.join(userDataDir, PENDING_SWAP_FILE)
}

function writePendingSwap(userDataDir, record, fileSystem = fs) {
  const filePath = pendingSwapPath(userDataDir)
  const tempPath = `${filePath}.tmp`
  try {
    fileSystem.mkdirSync(userDataDir, { recursive: true })
    fileSystem.writeFileSync(tempPath, JSON.stringify({ ...record, startedAt: record.startedAt ?? Date.now() }, null, 2))
    fileSystem.renameSync(tempPath, filePath)
    return true
  } catch {
    try { fileSystem.rmSync(tempPath, { force: true }) } catch {}
    return false
  }
}

function readPendingSwap(userDataDir, { fileSystem = fs, now = Date.now, maxAgeMs = PENDING_SWAP_MAX_AGE_MS } = {}) {
  try {
    const parsed = JSON.parse(fileSystem.readFileSync(pendingSwapPath(userDataDir), 'utf8'))
    if (!parsed || typeof parsed !== 'object') return null
    if (typeof parsed.startedAt !== 'number' || now() - parsed.startedAt > maxAgeMs) return null
    return parsed
  } catch {
    return null
  }
}

function clearPendingSwap(userDataDir, fileSystem = fs) {
  try { fileSystem.rmSync(pendingSwapPath(userDataDir), { force: true }) } catch {}
}

function takePendingVirtualDesktops(userDataDir, options = {}) {
  const pending = readPendingSwap(userDataDir, options)
  if (!pending || !pending.virtualDesktops || typeof pending.virtualDesktops !== 'object') return null
  return pending.virtualDesktops
}

function parseWaitPidArg(argv) {
  if (!Array.isArray(argv)) return null
  const index = argv.indexOf(WAIT_PID_FLAG)
  if (index === -1 || index + 1 >= argv.length) return null
  const parsed = Number(argv[index + 1])
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function isUpdateSwapLaunch(argv) {
  return Array.isArray(argv) && argv.includes(UPDATE_SWAP_FLAG)
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return Boolean(error && error.code === 'EPERM')
  }
}

function sleepSync(ms) {
  Atomics.wait(WAIT_BUFFER, 0, 0, ms)
}

function waitForProcessExitSync(pid, timeoutMs = DEFAULT_WAIT_PID_TIMEOUT_MS, { isAlive = isProcessAlive, sleep = sleepSync, now = Date.now } = {}) {
  if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) return true
  const deadline = now() + timeoutMs
  while (isAlive(pid)) {
    if (now() >= deadline) return false
    sleep(WAIT_POLL_MS)
  }
  return true
}

function regAdd(keyPath, valueName, value, type = 'REG_SZ', exec = execFileSync) {
  exec('reg', ['add', keyPath, '/v', valueName, '/t', type, '/d', value, '/f'], { windowsHide: true })
}

function regDelete(keyPath, valueName, exec = execFileSync) {
  exec('reg', ['delete', keyPath, '/v', valueName, '/f'], { windowsHide: true })
}

function planVersionPruning({ entries, currentVersion, previousVersion }) {
  const keep = new Set([currentVersion, previousVersion].filter(Boolean))
  const remove = []
  for (const name of entries) {
    if (name.endsWith(STAGING_SUFFIX)) {
      remove.push(name)
      continue
    }
    if (keep.has(name)) continue
    if (isSafeVersionName(name)) remove.push(name)
  }
  return remove
}

function pruneOldVersions(installRoot, { currentVersion, previousVersion, fileSystem = fs, exeName = 'Alpine Shell.exe', exec = execFileSync } = {}) {
  const versionsRoot = versionsDirFor(installRoot)
  let entries
  try {
    entries = fileSystem.readdirSync(versionsRoot)
  } catch {
    return []
  }
  const stale = planVersionPruning({ entries, currentVersion, previousVersion })
  const removed = []
  for (const name of stale) {
    const dirPath = path.join(versionsRoot, name)
    try {
      fileSystem.rmSync(dirPath, REMOVE_DIR_OPTIONS)
      if (!fileSystem.existsSync(dirPath)) {
        removed.push(name)
        if (!name.endsWith(STAGING_SUFFIX)) {
          try { regDelete(GPU_PREFERENCES_KEY, path.join(dirPath, exeName), exec) } catch {}
        }
      }
    } catch {}
  }
  return removed
}

function pruneOldV8Caches(userDataDir, currentVersion, fileSystem = fs) {
  const cacheRoot = path.join(userDataDir, 'v8-cache')
  let entries
  try {
    entries = fileSystem.readdirSync(cacheRoot, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (entry.name === currentVersion) continue
    if (!isSafeVersionName(entry.name)) continue
    try { fileSystem.rmSync(path.join(cacheRoot, entry.name), { recursive: true, force: true }) } catch {}
  }
}

function updateStartMenuShortcut(exePath, productName = 'Alpine Shell') {
  if (!process.env.APPDATA || !exePath) return
  try {
    const startMenuDir = path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs')
    const shortcutPath = path.join(startMenuDir, `${productName}.lnk`)
    if (!fs.existsSync(shortcutPath)) return
    require('electron').shell.writeShortcutLink(shortcutPath, 'update', {
      target: exePath,
      icon: exePath,
      iconIndex: 0,
    })
  } catch {}
}

function updateUninstallDisplayMetadata(version, exePath, exec = execFileSync, query = regQuery) {
  if (!version || !exePath) return
  try {
    const output = exec('reg', ['query', UNINSTALL_KEY_BASE], { windowsHide: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    const keys = String(output).split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    for (const keyPath of keys) {
      const displayName = query(keyPath, 'DisplayName')
      if (displayName !== 'Alpine Shell') continue
      try { regAdd(keyPath, 'DisplayVersion', version, 'REG_SZ', exec) } catch {}
      try { regAdd(keyPath, 'DisplayIcon', `${exePath},0`, 'REG_SZ', exec) } catch {}
    }
  } catch {}
}

function finalizeSwap({
  userDataDir,
  installRoot,
  currentVersion,
  currentExePath,
  fileSystem = fs,
  exec = execFileSync,
  query = regQuery,
  refreshShortcut = updateStartMenuShortcut,
}) {
  const pending = readPendingSwap(userDataDir, { fileSystem })
  const completedSwap = Boolean(pending && samePath(pending.toExe, currentExePath))
  const previousVersion = completedSwap ? pending.fromVersion : null
  if (completedSwap) {
    clearPendingSwap(userDataDir, fileSystem)
    refreshShortcut(currentExePath)
    updateUninstallDisplayMetadata(currentVersion, currentExePath, exec, query)
  }
  pruneOldVersions(installRoot, { currentVersion, previousVersion, fileSystem, exeName: path.basename(currentExePath), exec })
  pruneOldV8Caches(userDataDir, currentVersion, fileSystem)
  return {
    completedSwap,
    fromVersion: previousVersion,
    toVersion: completedSwap ? pending.toVersion : null,
    reopenSettingsPage: completedSwap ? (pending.reopenSettingsPage || null) : null,
  }
}

function rollbackPendingSwap({
  userDataDir,
  currentExePath,
  fileSystem = fs,
  exec = execFileSync,
  spawnProcess = spawn,
}) {
  const pending = readPendingSwap(userDataDir, { fileSystem })
  if (!pending || !samePath(pending.toExe, currentExePath)) return false
  if (!pending.fromExe || !fileSystem.existsSync(pending.fromExe)) return false

  clearPendingSwap(userDataDir, fileSystem)

  if (pending.handShellBack) {
    try { regAdd(WINLOGON_KEY, 'Shell', pending.fromExe, 'REG_SZ', exec) } catch {}
    try { regAdd(RUN_KEY, RUN_VALUE_NAME, `"${pending.fromExe}" ${AUTOSTART_LAUNCH_ARG}`, 'REG_SZ', exec) } catch {}
  } else if (typeof pending.previousShell === 'string' && pending.previousShell.trim()) {
    try { regAdd(WINLOGON_KEY, 'Shell', pending.previousShell, 'REG_SZ', exec) } catch {}
  }

  try {
    const child = spawnProcess(pending.fromExe, [UPDATE_ROLLBACK_FLAG], {
      detached: true,
      stdio: 'ignore',
      cwd: path.dirname(pending.fromExe),
    })
    if (child && typeof child.unref === 'function') child.unref()
    return Boolean(child && child.pid)
  } catch {
    return false
  }
}

module.exports = {
  VERSIONS_DIR_NAME,
  STAGING_SUFFIX,
  PENDING_SWAP_FILE,
  UPDATE_SWAP_FLAG,
  WAIT_PID_FLAG,
  UPDATE_ROLLBACK_FLAG,
  loadRawFs,
  isSafeVersionName,
  canStageVersion,
  resolveInstallRoot,
  versionsDirFor,
  versionDirFor,
  stagingDirFor,
  stagedExePathFor,
  isCompleteVersionDir,
  deduplicateWithHardlinks,
  stageInstaller,
  pendingSwapPath,
  writePendingSwap,
  readPendingSwap,
  clearPendingSwap,
  takePendingVirtualDesktops,
  parseWaitPidArg,
  isUpdateSwapLaunch,
  waitForProcessExitSync,
  planVersionPruning,
  pruneOldVersions,
  pruneOldV8Caches,
  finalizeSwap,
  rollbackPendingSwap,
}
