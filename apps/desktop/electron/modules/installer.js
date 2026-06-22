const { app, shell: electronShell } = require('electron')
const path = require('path')
const { execSync, execFileSync, spawn } = require('child_process')
const fs = require('fs')
const originalFs = require('original-fs')
const crypto = require('crypto')

const PRODUCT_NAME = 'Alpine Shell'

const CURSOR_REGISTRY_NAMES = [
  'Arrow', 'Help', 'AppStarting', 'Wait', 'Crosshair', 'IBeam',
  'NWPen', 'No', 'SizeNS', 'SizeWE', 'SizeNWSE', 'SizeNESW',
  'SizeAll', 'UpArrow', 'Hand', 'Pin', 'Person',
]

function getInstallDir() {
  return path.join(process.env.LOCALAPPDATA, 'Programs', PRODUCT_NAME)
}

function getInstalledExePath() {
  if (app.isPackaged && !isPortableRun()) return process.execPath
  const exeName = app.isPackaged ? path.basename(process.execPath) : `${PRODUCT_NAME}.exe`
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

function regQuery(keyPath, valueName) {
  try {
    const result = execSync(`reg query "${keyPath}" /v "${valueName}"`, { windowsHide: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    const match = result.match(/REG_\w+\s+(.+)/)
    return match ? match[1].trim() : null
  } catch {
    return null
  }
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
  try { regAdd('HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon', 'Shell', 'explorer.exe') } catch {}
  try { regDelete('HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run', 'AlpineShell') } catch {}
  try { regAdd('HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon', 'AutoRestartShell', '1', 'REG_DWORD') } catch {}
  try { regDelete('HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon', 'RestartApps') } catch {}
  try { regDelete('HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced', 'EnableXamlStartMenu') } catch {}
  try { execSync('schtasks /change /tn "\\Microsoft\\Windows\\Application Experience\\StartupAppTask" /enable', { windowsHide: true }) } catch {}
}

async function installFiles() {
  const sourceDir = path.dirname(process.execPath)
  const installDir = getInstallDir()
  fs.mkdirSync(installDir, { recursive: true })
  await originalFs.promises.cp(sourceDir, installDir, { recursive: true, force: true })
}

function createShortcuts() {
  const exePath = getInstalledExePath()
  const startMenuDir = path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs')
  const shortcutPath = path.join(startMenuDir, `${PRODUCT_NAME}.lnk`)

  electronShell.writeShortcutLink(shortcutPath, {
    target: exePath,
    description: PRODUCT_NAME,
  })
}

function registerUninstaller() {
  const installDir = getInstallDir()
  const exePath = getInstalledExePath()
  const key = 'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\AlpineShell'

  regAdd(key, 'DisplayName', PRODUCT_NAME)
  regAdd(key, 'DisplayVersion', app.getVersion())
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

function revertSystemChanges() {
  revertShell()

  const cursorKey = 'HKCU\\Control Panel\\Cursors'
  for (const name of CURSOR_REGISTRY_NAMES) {
    try { regDelete(cursorKey, name) } catch {}
  }
  try { execSync(`reg add "${cursorKey}" /ve /d "" /f`, { windowsHide: true }) } catch {}
  try { execSync('rundll32.exe user32.dll,UpdatePerUserSystemParameters 1, True', { windowsHide: true }) } catch {}

  const cursorDir = path.join(app.getPath('userData'), 'cursors')
  if (fs.existsSync(cursorDir)) fs.rmSync(cursorDir, { recursive: true, force: true })

  const flagPath = path.join(app.getPath('userData'), '.setup-complete')
  if (fs.existsSync(flagPath)) fs.unlinkSync(flagPath)
}

function uninstall() {
  revertSystemChanges()

  try { fs.rmdirSync(app.getPath('userData')) } catch {}

  const shortcutPath = path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', `${PRODUCT_NAME}.lnk`)
  if (fs.existsSync(shortcutPath)) fs.unlinkSync(shortcutPath)

  try { regDeleteKey('HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\AlpineShell') } catch {}

  const installDir = getInstallDir()
  const batchPath = path.join(process.env.TEMP, 'alpine_uninstall.bat')
  const batch = `@echo off\r\n:retry\r\ntimeout /t 2 /nobreak >nul\r\nrd /s /q "${installDir}"\r\nif exist "${installDir}" goto retry\r\ndel "%~f0"\r\n`
  fs.writeFileSync(batchPath, batch)
  spawn('cmd', ['/c', batchPath], { detached: true, stdio: 'ignore', windowsHide: true }).unref()
}

function relaunchFromInstalled() {
  const env = { ...process.env }
  delete env.PORTABLE_EXECUTABLE_FILE
  delete env.PORTABLE_EXECUTABLE_DIR
  delete env.PORTABLE_EXECUTABLE_APP_FILENAME

  spawn(getInstalledExePath(), [], { detached: true, stdio: 'ignore', env }).unref()
  app.exit()
}

const UPDATER_CSC_PATH = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe'

function getUpdaterDir() {
  return path.join(app.getPath('userData'), 'updater')
}

function getUpdaterSourcePath() {
  if (app.isPackaged) return path.join(process.resourcesPath, 'scripts', 'updaterScreen.cs')
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

function startBrandedUpdate(installerPath, version) {
  if (!app.isPackaged) return false
  if (!installerPath || !fs.existsSync(installerPath)) return false
  const updaterExe = ensureUpdaterExe()
  if (!updaterExe) return false
  try {
    regAdd('HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon', 'Shell', 'explorer.exe')
    spawn(updaterExe, [installerPath, getInstalledExePath(), version || ''], { detached: true, stdio: 'ignore', windowsHide: true }).unref()
    return true
  } catch (e) {
    console.error('[installer] Failed to start branded update:', e.message)
    return false
  }
}

module.exports = {
  getInstallDir,
  getInstalledExePath,
  isPortableRun,
  isInstalled,
  getInstalledVersion,
  installFiles,
  createShortcuts,
  registerUninstaller,
  uninstall,
  revertSystemChanges,
  revertShell,
  relaunchFromInstalled,
  startBrandedUpdate,
}
