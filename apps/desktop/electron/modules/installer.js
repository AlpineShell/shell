const electron = () => require('electron')
const electronApp = () => electron().app
const path = require('path')
const { execSync, execFileSync, execFile, spawn } = require('child_process')
const fs = require('fs')
const crypto = require('crypto')
const os = require('os')
const revertScript = require('./revertScript')
const shellExclusivity = require('./shellExclusivity')
const { regQuery } = require('../registryRead')

const PRODUCT_NAME = 'Alpine Shell'
const INSTALL_DIR_NAME = 'alpine-shell'
const WINLOGON_KEY = 'HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon'
const UPDATER_CACHE_DIR_NAME = `${INSTALL_DIR_NAME}-updater`
const SHELL_OPT_OUT_FILE = '.shell-opt-out'
const SHELL_HANDOFF_FILE = '.shell-handoff'
const UPDATE_HANDOFF_FILE = '.update-in-progress'
const UPDATE_HANDOFF_MAX_AGE_MS = 15 * 60 * 1000
const SHELL_HANDOFF_MAX_AGE_MS = 12 * 60 * 60 * 1000
const SHELL_REVERT_FAILED = 'Could not hand the Windows shell back to Explorer.'
const SHELL_HANDOFF_HELPER_FAILED = 'Windows Explorer could not be brought back, so nothing was changed.'
const SHELL_HANDOFF_HELPER_MISSING = 'Windows Explorer is registered as your shell, but Alpine Shell could not close itself. Restart Windows to finish.'

const CURSOR_REGISTRY_NAMES = [
  'Arrow', 'Help', 'AppStarting', 'Wait', 'Crosshair', 'IBeam',
  'NWPen', 'No', 'SizeNS', 'SizeWE', 'SizeNWSE', 'SizeNESW',
  'SizeAll', 'UpArrow', 'Hand', 'Pin', 'Person',
]

function getCanonicalInstallDir() {
  return path.join(process.env.LOCALAPPDATA || '', 'Programs', INSTALL_DIR_NAME)
}

function getInstallDir() {
  if (electronApp().isPackaged && !isPortableRun()) return path.dirname(process.execPath)
  return getCanonicalInstallDir()
}

function getDeletableInstallDir() {
  const installDir = getInstallDir()
  const canonical = getCanonicalInstallDir()
  if (!process.env.LOCALAPPDATA) return null
  return path.resolve(installDir).toLowerCase() === path.resolve(canonical).toLowerCase() ? installDir : null
}

function getNsisUninstallerPath() {
  return path.join(getInstallDir(), `Uninstall ${PRODUCT_NAME}.exe`)
}

function getUpdaterCacheDirs() {
  if (!process.env.LOCALAPPDATA) return []
  return [path.join(process.env.LOCALAPPDATA, UPDATER_CACHE_DIR_NAME)]
}

function getUserDataDirs() {
  const dirs = [electronApp().getPath('userData')]
  const legacyDir = path.join(process.env.APPDATA, PRODUCT_NAME)
  if (!dirs.includes(legacyDir)) dirs.push(legacyDir)
  return dirs
}

function getInstalledExePath() {
  if (electronApp().isPackaged && !isPortableRun()) return process.execPath
  const exeName = electronApp().isPackaged ? path.basename(process.execPath) : `${PRODUCT_NAME}.exe`
  return path.join(getInstallDir(), exeName)
}

function isPortableRun() {
  return !!process.env.PORTABLE_EXECUTABLE_FILE
}

function isInstalled() {
  return fs.existsSync(getInstalledExePath())
}

function regAdd(keyPath, valueName, value, type = 'REG_SZ') {
  execFileSync('reg', ['add', keyPath, '/v', valueName, '/t', type, '/d', value, '/f'], { windowsHide: true })
}

function regDelete(keyPath, valueName) {
  execFileSync('reg', ['delete', keyPath, '/v', valueName, '/f'], { windowsHide: true })
}

function regDeleteKey(keyPath) {
  execFileSync('reg', ['delete', keyPath, '/f'], { windowsHide: true })
}

function getInstalledVersion() {
  return regQuery('HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\AlpineShell', 'DisplayVersion')
}

function revertShell() {
  try { regAdd(WINLOGON_KEY, 'Shell', 'explorer.exe') } catch {}
  try { regDelete('HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run', 'AlpineShell') } catch {}
  try { regAdd('HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon', 'AutoRestartShell', '1', 'REG_DWORD') } catch {}
  try { regDelete(WINLOGON_KEY, 'RestartApps') } catch {}
  try { regDelete('HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced', 'EnableXamlStartMenu') } catch {}
  try { execSync('schtasks /change /tn "\\Microsoft\\Windows\\Application Experience\\StartupAppTask" /enable', { windowsHide: true }) } catch {}
}

function isShellRevertedToExplorer() {
  const currentShell = regQuery(WINLOGON_KEY, 'Shell')
  return currentShell !== null && currentShell.toLowerCase().includes('explorer.exe')
}

function isShellRegisteredToAlpine() {
  const currentShell = regQuery(WINLOGON_KEY, 'Shell')
  return currentShell !== null && !currentShell.toLowerCase().includes('explorer.exe')
}

function explorerExePath() {
  return path.join(process.env.SystemRoot || path.join('C:', 'Windows'), 'explorer.exe')
}

function startExplorer() {
  spawn(explorerExePath(), [], { detached: true, stdio: 'ignore' }).unref()
}

function explorerNeedsStarting(handedBack) {
  const hosted = require('./explorerShell').shellHostedByExplorer()
  if (hosted === false) return true
  return hosted === null && handedBack
}

function handBackForLicence() {
  try {
    const handedBack = isShellRegisteredToAlpine()
    if (handedBack) {
      regAdd(WINLOGON_KEY, 'Shell', 'explorer.exe')
      if (!isShellRevertedToExplorer()) return { success: false, error: SHELL_REVERT_FAILED }
      try { regAdd('HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon', 'AutoRestartShell', '1', 'REG_DWORD') } catch {}
    }
    try { regDelete('HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced', 'EnableXamlStartMenu') } catch {}
    if (explorerNeedsStarting(handedBack)) startExplorer()
    return { success: true, error: null }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

function userDataFile(name) {
  return path.join(electronApp().getPath('userData'), name)
}

function writeMarker(markerPath) {
  try {
    fs.writeFileSync(markerPath, new Date().toISOString())
    return true
  } catch (e) {
    console.error('[installer] Could not write marker:', e.message)
    return false
  }
}

function clearMarker(markerPath) {
  try { fs.rmSync(markerPath, { force: true }) } catch {}
}

function markerAgeMs(markerPath) {
  try {
    return Date.now() - fs.statSync(markerPath).mtimeMs
  } catch {
    return null
  }
}

function isMarkerActive(markerPath, maxAgeMs, systemUptimeMs = null) {
  const plan = shellExclusivity.planMarkerAge({ ageMs: markerAgeMs(markerPath), maxAgeMs, systemUptimeMs })
  if (plan.restamp) writeMarker(markerPath)
  return plan.active
}

function isShellOptedOut() {
  return fs.existsSync(userDataFile(SHELL_OPT_OUT_FILE))
}

function setShellOptOut(optedOut) {
  if (optedOut) writeMarker(userDataFile(SHELL_OPT_OUT_FILE))
  else clearMarker(userDataFile(SHELL_OPT_OUT_FILE))
}

function hasShellHandoff() {
  return isMarkerActive(userDataFile(SHELL_HANDOFF_FILE), SHELL_HANDOFF_MAX_AGE_MS)
}

function beginShellHandoff() {
  return writeMarker(userDataFile(SHELL_HANDOFF_FILE))
}

function clearShellHandoff() {
  clearMarker(userDataFile(SHELL_HANDOFF_FILE))
}

function beginUpdateHandoff() {
  return writeMarker(userDataFile(UPDATE_HANDOFF_FILE))
}

function clearUpdateHandoff() {
  clearMarker(userDataFile(UPDATE_HANDOFF_FILE))
}

function isUpdateHandoffActive() {
  return isMarkerActive(userDataFile(UPDATE_HANDOFF_FILE), UPDATE_HANDOFF_MAX_AGE_MS, os.uptime() * 1000)
}

function writeRevertHelper(scriptName, script) {
  const scriptPath = path.join(process.env.TEMP || os.tmpdir(), scriptName)
  fs.writeFileSync(scriptPath, script)
  return scriptPath
}

const REVERT_HELPER_POWERSHELL_ARGS = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass']

const START_REVERT_HELPER_OUTSIDE_JOB = [
  "Start-Process -FilePath powershell.exe",
  `-ArgumentList @(${REVERT_HELPER_POWERSHELL_ARGS.map(arg => `'${arg}'`).join(', ')}, '-File', ('"' + $env:ALPINE_REVERT_SCRIPT + '"'))`,
  '-WorkingDirectory $env:TEMP -NoNewWindow -Wait',
].join(' ')

function launchRevertHelper(scriptPath, env) {
  const helper = { pid: null, running: false }
  const workingDirectory = process.env.TEMP || os.tmpdir()
  const child = spawn('powershell.exe', [...REVERT_HELPER_POWERSHELL_ARGS, '-Command', START_REVERT_HELPER_OUTSIDE_JOB], {
    stdio: 'ignore',
    windowsHide: true,
    cwd: workingDirectory,
    env: { ...process.env, ...env, ALPINE_REVERT_SCRIPT: scriptPath },
  })
  child.on('error', (e) => {
    helper.running = false
    console.error('[installer] Revert helper failed to start:', e.message)
  })
  child.on('exit', () => { helper.running = false })
  child.unref()
  if (!child.pid) return null
  helper.pid = child.pid
  helper.running = true
  return helper
}

function isRevertHelperRunning(helper) {
  return Boolean(helper && helper.running)
}

function getProcessImageName() {
  return path.basename(process.execPath)
}

function restoreShellRegistration() {
  try { regAdd(WINLOGON_KEY, 'Shell', getInstalledExePath()) } catch {}
}

function undoShellHandoff() {
  restoreShellRegistration()
  clearShellHandoff()
  return { success: false, error: SHELL_HANDOFF_HELPER_FAILED }
}

function reportShellStillOnScreen() {
  return { success: false, error: SHELL_HANDOFF_HELPER_MISSING }
}

function revertShellTemporarily() {
  try {
    const helper = revertScript.buildTemporaryRevertScript({
      processImageName: getProcessImageName(),
      shellKeyPath: WINLOGON_KEY,
      shellExePath: getInstalledExePath(),
    })
    const scriptPath = writeRevertHelper('alpine_revert_temporary.ps1', helper.script)

    if (!beginShellHandoff()) {
      console.error('[installer] Could not mark the shell hand-off — leaving the shell registration alone')
      return { success: false, error: SHELL_REVERT_FAILED }
    }
    regAdd(WINLOGON_KEY, 'Shell', 'explorer.exe')
    if (!isShellRevertedToExplorer()) {
      clearShellHandoff()
      return { success: false, error: SHELL_REVERT_FAILED }
    }
    try { regDelete('HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced', 'EnableXamlStartMenu') } catch {}

    const handoff = launchRevertHelper(scriptPath, helper.env)
    if (!handoff) return undoShellHandoff()
    return { success: true, error: null, handoff, abandonHandoff: undoShellHandoff }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

function revertShellPermanently() {
  try {
    const helper = revertScript.buildPermanentRevertScript({ processImageName: getProcessImageName() })
    const scriptPath = writeRevertHelper('alpine_revert_permanent.ps1', helper.script)

    regAdd(WINLOGON_KEY, 'Shell', 'explorer.exe')
    if (!isShellRevertedToExplorer()) return { success: false, error: SHELL_REVERT_FAILED }

    setShellOptOut(true)
    revertShell()
    restoreDefaultCursors()

    const handoff = launchRevertHelper(scriptPath, helper.env)
    if (!handoff) return reportShellStillOnScreen()
    return { success: true, error: null, handoff, abandonHandoff: reportShellStillOnScreen }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

async function installFiles() {
  const sourceDir = path.dirname(process.execPath)
  const installDir = getInstallDir()
  fs.mkdirSync(installDir, { recursive: true })
  await require('original-fs').promises.cp(sourceDir, installDir, { recursive: true, force: true })
}

function createShortcuts() {
  const exePath = getInstalledExePath()
  const startMenuDir = path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs')
  const shortcutPath = path.join(startMenuDir, `${PRODUCT_NAME}.lnk`)

  electron().shell.writeShortcutLink(shortcutPath, {
    target: exePath,
    description: PRODUCT_NAME,
  })
}

function registerUninstaller() {
  const installDir = getInstallDir()
  const exePath = getInstalledExePath()
  const key = 'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\AlpineShell'

  regAdd(key, 'DisplayName', PRODUCT_NAME)
  regAdd(key, 'DisplayVersion', electronApp().getVersion())
  regAdd(key, 'Publisher', 'Alpine')
  regAdd(key, 'DisplayIcon', exePath)
  regAdd(key, 'UninstallString', `"${exePath}" --uninstall`)
  regAdd(key, 'InstallLocation', installDir)
  regAdd(key, 'NoModify', '1', 'REG_DWORD')
  regAdd(key, 'NoRepair', '1', 'REG_DWORD')

  try {
    const sizeKB = Math.round(getDirSize(installDir) / 1024)
    regAdd(key, 'EstimatedSize', String(sizeKB), 'REG_DWORD')
  } catch {}
}

function getDirSize(dirPath) {
  let total = 0
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const full = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      total += getDirSize(full)
    } else {
      try { total += fs.statSync(full).size } catch {}
    }
  }
  return total
}

function restoreDefaultCursors() {
  const cursorKey = 'HKCU\\Control Panel\\Cursors'
  for (const name of CURSOR_REGISTRY_NAMES) {
    try { regDelete(cursorKey, name) } catch {}
  }
  try { execSync(`reg add "${cursorKey}" /ve /d "" /f`, { windowsHide: true }) } catch {}
  try { execSync('rundll32.exe user32.dll,UpdatePerUserSystemParameters 1, True', { windowsHide: true }) } catch {}

  const cursorDir = path.join(electronApp().getPath('userData'), 'cursors')
  if (fs.existsSync(cursorDir)) fs.rmSync(cursorDir, { recursive: true, force: true })
}

function clearSetupFlag() {
  const flagPath = path.join(electronApp().getPath('userData'), '.setup-complete')
  if (fs.existsSync(flagPath)) fs.unlinkSync(flagPath)
}

function revertSystemChanges() {
  revertShell()
  restoreDefaultCursors()
  clearSetupFlag()
}

function removeStartMenuShortcut() {
  const shortcutPath = path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', `${PRODUCT_NAME}.lnk`)
  if (fs.existsSync(shortcutPath)) fs.unlinkSync(shortcutPath)
}

function uninstall() {
  try {
    const nsisUninstaller = getNsisUninstallerPath()
    const uninstallerPath = fs.existsSync(nsisUninstaller) ? nsisUninstaller : null
    const helper = revertScript.buildUninstallScript({
      processImageName: getProcessImageName(),
      uninstallerPath,
      installDir: getInstallDir(),
      deletableInstallDir: getDeletableInstallDir(),
      userDataDirs: getUserDataDirs(),
      cacheDirs: getUpdaterCacheDirs(),
    })
    const scriptPath = writeRevertHelper('alpine_uninstall.ps1', helper.script)

    regAdd(WINLOGON_KEY, 'Shell', 'explorer.exe')
    if (!isShellRevertedToExplorer()) return { success: false, error: SHELL_REVERT_FAILED, leftBehind: [] }

    setShellOptOut(true)
    revertSystemChanges()
    try { removeStartMenuShortcut() } catch {}
    if (!uninstallerPath) {
      try { regDeleteKey('HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\AlpineShell') } catch {}
    }

    const handoff = launchRevertHelper(scriptPath, helper.env)
    if (!handoff) return { ...reportShellStillOnScreen(), leftBehind: helper.skippedDirs }
    return { success: true, error: null, leftBehind: helper.skippedDirs, handoff, abandonHandoff: reportShellStillOnScreen }
  } catch (e) {
    return { success: false, error: e.message, leftBehind: [] }
  }
}

function relaunchFromInstalled() {
  const env = { ...process.env }
  delete env.PORTABLE_EXECUTABLE_FILE
  delete env.PORTABLE_EXECUTABLE_DIR
  delete env.PORTABLE_EXECUTABLE_APP_FILENAME

  spawn(getInstalledExePath(), [], { detached: true, stdio: 'ignore', env }).unref()
  electronApp().exit()
}

const UPDATER_CSC_PATH = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe'

function getUpdaterDir() {
  return path.join(electronApp().getPath('userData'), 'updater')
}

function getUpdaterSourcePath() {
  if (electronApp().isPackaged) return path.join(process.resourcesPath, 'scripts', 'updaterScreen.cs')
  return path.join(__dirname, '..', 'scripts', 'updaterScreen.cs')
}

function getUpdaterSourceHash(sourcePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(sourcePath)).digest('hex').slice(0, 12)
}

function getUpdaterExePathForHash(hash) {
  return path.join(getUpdaterDir(), `AlpineUpdater-${hash}.exe`)
}

function pruneStaleUpdaterExes(keepExePath) {
  try {
    for (const name of fs.readdirSync(getUpdaterDir())) {
      const full = path.join(getUpdaterDir(), name)
      if (/^AlpineUpdater.*\.exe$/i.test(name) && full !== keepExePath) {
        try { fs.unlinkSync(full) } catch {}
      }
    }
  } catch {}
}

function ensureUpdaterExe() {
  const sourcePath = getUpdaterSourcePath()
  if (!fs.existsSync(sourcePath)) return null

  let exePath
  try {
    exePath = getUpdaterExePathForHash(getUpdaterSourceHash(sourcePath))
  } catch {
    return null
  }

  if (fs.existsSync(exePath)) {
    pruneStaleUpdaterExes(exePath)
    return exePath
  }
  if (!fs.existsSync(UPDATER_CSC_PATH)) return null

  try {
    fs.mkdirSync(getUpdaterDir(), { recursive: true })
    execFileSync(UPDATER_CSC_PATH, [
      '/nologo', '/optimize', '/target:winexe',
      '/r:System.dll', '/r:System.Drawing.dll', '/r:System.Windows.Forms.dll',
      `/out:${exePath}`, sourcePath,
    ], { windowsHide: true })
    pruneStaleUpdaterExes(exePath)
    return exePath
  } catch (e) {
    console.error('[installer] Failed to compile updater screen:', e.message)
    return fs.existsSync(exePath) ? exePath : null
  }
}

function ensureUpdaterExeAsync() {
  return new Promise((resolve) => {
    const sourcePath = getUpdaterSourcePath()
    if (!fs.existsSync(sourcePath)) return resolve(null)

    let exePath
    try {
      exePath = getUpdaterExePathForHash(getUpdaterSourceHash(sourcePath))
    } catch {
      return resolve(null)
    }

    if (fs.existsSync(exePath)) {
      pruneStaleUpdaterExes(exePath)
      return resolve(exePath)
    }
    if (!fs.existsSync(UPDATER_CSC_PATH)) return resolve(null)

    try { fs.mkdirSync(getUpdaterDir(), { recursive: true }) } catch {}
    execFile(UPDATER_CSC_PATH, [
      '/nologo', '/optimize', '/target:winexe',
      '/r:System.dll', '/r:System.Drawing.dll', '/r:System.Windows.Forms.dll',
      `/out:${exePath}`, sourcePath,
    ], { windowsHide: true }, (err) => {
      if (err) {
        console.error('[installer] Failed to compile updater screen:', err.message)
        return resolve(fs.existsSync(exePath) ? exePath : null)
      }
      pruneStaleUpdaterExes(exePath)
      resolve(exePath)
    })
  })
}

function startBrandedUpdate(installerPath, version) {
  if (!electronApp().isPackaged) return false
  if (!installerPath || !fs.existsSync(installerPath)) return false
  const updaterExe = ensureUpdaterExe()
  if (!updaterExe) return false
  const brandingDir = path.dirname(getUpdaterSourcePath())
  const logoPath = path.join(brandingDir, 'alpineWordmark.png')
  const displayFontPath = path.join(brandingDir, 'averiaSerifLibre.ttf')
  if (!beginUpdateHandoff()) {
    console.error('[installer] Could not mark the update in progress — leaving the shell registration alone')
    return false
  }
  try {
    regAdd(WINLOGON_KEY, 'Shell', 'explorer.exe')
    spawn(updaterExe, [
      installerPath,
      getInstalledExePath(),
      version || '',
      fs.existsSync(logoPath) ? logoPath : '',
      fs.existsSync(displayFontPath) ? displayFontPath : '',
    ], { detached: true, stdio: 'ignore', windowsHide: true }).unref()
    return true
  } catch (e) {
    clearUpdateHandoff()
    console.error('[installer] Failed to start branded update:', e.message)
    return false
  }
}

module.exports = {
  getInstallDir,
  getInstalledExePath,
  getNsisUninstallerPath,
  getUserDataDirs,
  isPortableRun,
  isInstalled,
  getInstalledVersion,
  installFiles,
  createShortcuts,
  registerUninstaller,
  uninstall,
  revertSystemChanges,
  revertShell,
  revertShellTemporarily,
  revertShellPermanently,
  handBackForLicence,
  isShellOptedOut,
  setShellOptOut,
  hasShellHandoff,
  clearShellHandoff,
  isUpdateHandoffActive,
  clearUpdateHandoff,
  isRevertHelperRunning,
  relaunchFromInstalled,
  startBrandedUpdate,
  ensureUpdaterExe,
  ensureUpdaterExeAsync,
}
