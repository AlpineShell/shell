const { app, shell: electronShell } = require('electron')
const path = require('path')
const { execSync, execFileSync, spawn } = require('child_process')
const fs = require('fs')
const originalFs = require('original-fs')

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

function regDelete(keyPath, valueName) {
  execFileSync('reg', ['delete', keyPath, '/v', valueName, '/f'], { windowsHide: true })
}

function regDeleteKey(keyPath) {
  execFileSync('reg', ['delete', keyPath, '/f'], { windowsHide: true })
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

function uninstall() {
  try { regAdd('HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon', 'Shell', 'explorer.exe') } catch {}
  try { regDelete('HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run', 'AlpineShell') } catch {}

  try { regAdd('HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon', 'AutoRestartShell', '1', 'REG_DWORD') } catch {}
  try { regDelete('HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon', 'RestartApps') } catch {}
  try { regDelete('HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced', 'EnableXamlStartMenu') } catch {}
  try { execSync('schtasks /change /tn "\\Microsoft\\Windows\\Application Experience\\StartupAppTask" /enable', { windowsHide: true }) } catch {}

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

module.exports = {
  getInstallDir,
  getInstalledExePath,
  isPortableRun,
  isInstalled,
  installFiles,
  createShortcuts,
  registerUninstaller,
  uninstall,
  relaunchFromInstalled,
}
