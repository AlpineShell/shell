const { app } = require('electron')
const path = require('path')
const { execSync, execFileSync, spawn } = require('child_process')
const fs = require('fs')
const installer = require('./installer')
const updater = require('./updater')

const CURSOR_VARIANT = 'Bibata-Original-Ice'
const REVERT_QUIT_DELAY_MS = 1200
const XAML_START_MENU_KEY = 'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced'

const CURSOR_REGISTRY_MAP = {
  'Arrow': 'Pointer.cur',
  'Help': 'Help.cur',
  'AppStarting': 'Work.ani',
  'Wait': 'Busy.ani',
  'Crosshair': 'Cross.cur',
  'IBeam': 'Text.cur',
  'NWPen': 'Handwriting.cur',
  'No': 'Unavailable.cur',
  'SizeNS': 'Vert.cur',
  'SizeWE': 'Horz.cur',
  'SizeNWSE': 'Dgn1.cur',
  'SizeNESW': 'Dgn2.cur',
  'SizeAll': 'Move.cur',
  'UpArrow': 'Alternate.cur',
  'Hand': 'Link.cur',
  'Pin': 'Pin.cur',
  'Person': 'Person.cur',
}

function getCursorSourceDir() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'cursor', CURSOR_VARIANT)
  }
  return path.join(__dirname, '..', '..', 'public', 'cursor', CURSOR_VARIANT)
}

function getCursorInstallDir() {
  return path.join(app.getPath('userData'), 'cursors')
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

function installCursors() {
  const sourceDir = getCursorSourceDir()
  const installDir = getCursorInstallDir()

  if (!fs.existsSync(installDir)) {
    fs.mkdirSync(installDir, { recursive: true })
  }

  for (const file of fs.readdirSync(sourceDir)) {
    fs.copyFileSync(path.join(sourceDir, file), path.join(installDir, file))
  }

  const cursorKey = 'HKCU\\Control Panel\\Cursors'

  for (const [regName, fileName] of Object.entries(CURSOR_REGISTRY_MAP)) {
    const cursorPath = path.join(installDir, fileName)
    if (fs.existsSync(cursorPath)) {
      regAdd(cursorKey, regName, cursorPath)
    }
  }

  regAdd(cursorKey, '', 'Alpine Shell')

  execSync('rundll32.exe user32.dll,UpdatePerUserSystemParameters 1, True', { windowsHide: true })
}

function getShellExePath() {
  if (app.isPackaged) {
    return installer.getInstalledExePath()
  }
  const electronExe = path.join(__dirname, '..', '..', 'node_modules', 'electron', 'dist', 'electron.exe')
  return `"${electronExe}" "${path.join(__dirname, '..', '..')}"`
}

function setAsShell() {
  installer.setShellOptOut(false)
  const shellValue = getShellExePath()
  regAdd('HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon', 'Shell', shellValue)

  try {
    regAdd('HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon', 'AutoRestartShell', '0', 'REG_DWORD')
  } catch (e) {
    console.error('[setup] Could not set AutoRestartShell (may need admin):', e.message)
  }

  regAdd(XAML_START_MENU_KEY, 'EnableXamlStartMenu', '0', 'REG_DWORD')
  regAdd('HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon', 'RestartApps', '0', 'REG_DWORD')

  try {
    execSync('schtasks /change /tn "\\Microsoft\\Windows\\Application Experience\\StartupAppTask" /disable', { windowsHide: true })
  } catch (e) {
    console.error('[setup] Could not disable StartupAppTask:', e.message)
  }
}

function setStartup() {
  if (app.isPackaged) {
    const exePath = installer.getInstalledExePath()
    regAdd('HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run', 'AlpineShell', `"${exePath}"`)
  } else {
    const exePath = process.execPath
    regAdd('HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run', 'AlpineShell', `"${exePath}" "${path.join(__dirname, '..', '..')}"`)
  }
}

function ensureShellRegistration() {
  if (!app.isPackaged) return null
  if (installer.isShellOptedOut()) return null
  if (hasGpoShellOverride()) return null

  const desiredShell = getShellExePath()
  let currentShell = regQuery('HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon', 'Shell')
  if (currentShell !== desiredShell) {
    try {
      regAdd('HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon', 'Shell', desiredShell)
      currentShell = desiredShell
    } catch {}
  }

  const desiredRun = `"${installer.getInstalledExePath()}"`
  const currentRun = regQuery('HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run', 'AlpineShell')
  if (currentRun !== desiredRun) {
    try { regAdd('HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run', 'AlpineShell', desiredRun) } catch {}
  }

  if (regQuery(XAML_START_MENU_KEY, 'EnableXamlStartMenu') === null) {
    try { regAdd(XAML_START_MENU_KEY, 'EnableXamlStartMenu', '0', 'REG_DWORD') } catch {}
  }

  return currentShell !== null && !currentShell.toLowerCase().includes('explorer.exe')
}

function hasGpoShellOverride() {
  const policyShell = regQuery('HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System', 'Shell')
  return policyShell !== null
}

function verifyShellWrite() {
  const currentShell = regQuery('HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon', 'Shell')
  return currentShell !== null && !currentShell.toLowerCase().includes('explorer.exe')
}

function isDefaultShell() {
  const currentShell = regQuery('HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon', 'Shell')
  return currentShell !== null && !currentShell.toLowerCase().includes('explorer.exe')
}

function killExplorer() {
  try {
    execSync('taskkill /f /im explorer.exe', { windowsHide: true })
    return true
  } catch {
    return false
  }
}

function restartExplorer() {
  try {
    spawn('explorer.exe', [], { detached: true, stdio: 'ignore', windowsHide: true }).unref()
  } catch (e) {}
}

function getSetupStatus() {
  const currentShell = regQuery('HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon', 'Shell')
  const startupEntry = regQuery('HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run', 'AlpineShell')
  const currentCursor = regQuery('HKCU\\Control Panel\\Cursors', '')

  return {
    isShell: currentShell !== null && !currentShell.toLowerCase().includes('explorer.exe'),
    hasStartup: startupEntry !== null,
    hasCursor: currentCursor === 'Alpine Shell',
    gpoBlocked: hasGpoShellOverride(),
    isInstalled: installer.isInstalled(),
    installedVersion: installer.getInstalledVersion(),
    currentVersion: app.getVersion(),
    isFirstRun: isFirstRun(),
  }
}

function isFirstRun() {
  const flagPath = path.join(app.getPath('userData'), '.setup-complete')
  return !fs.existsSync(flagPath)
}

function markSetupComplete() {
  const dir = path.dirname(path.join(app.getPath('userData'), '.setup-complete'))
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(app.getPath('userData'), '.setup-complete'), new Date().toISOString())
}

let broadcast = null
const yield_ = () => new Promise(r => setTimeout(r, 50))

function progress(step) {
  if (broadcast) broadcast('setup/progress', step)
}

function runRevert(action) {
  if (!app.isPackaged) return { success: false, gpoBlocked: false, error: 'Unavailable in development.', leftBehind: [] }
  if (updater.isUpdatePending()) return { success: false, gpoBlocked: false, error: 'An update is in progress. Try again once it has finished.', leftBehind: [] }

  const result = action()
  if (result.success) setTimeout(() => app.quit(), REVERT_QUIT_DELAY_MS)
  return {
    success: result.success,
    gpoBlocked: hasGpoShellOverride(),
    error: result.error,
    leftBehind: result.leftBehind ?? [],
  }
}

module.exports = {
  handlers: {
    'setup/status': () => getSetupStatus(),
    'setup/install': async (_event, options) => {
      const results = { shell: false, startup: false, cursor: false, gpoBlocked: false, error: null }

      if (installer.isPortableRun()) {
        try {
          progress('Copying files...')
          await yield_()
          await installer.installFiles()

          progress('Creating shortcut...')
          await yield_()
          installer.createShortcuts()

          progress('Registering with Windows...')
          await yield_()
          installer.registerUninstaller()
        } catch (e) {
          console.error('[setup] File install error:', e.message)
          results.error = e.message
          return results
        }
      }

      if (options.shell) {
        try {
          progress('Configuring desktop environment...')
          await yield_()
          if (hasGpoShellOverride()) {
            console.error('[setup] Group Policy override detected — shell replacement may not take effect')
            results.gpoBlocked = true
          }
          setAsShell()
          setStartup()
          results.shell = verifyShellWrite()
          results.startup = true
          if (!results.shell) {
            console.error('[setup] Shell registry write did not persist — possible policy or permission issue')
          }
        } catch (e) {
          console.error('[setup] Shell/startup error:', e.message)
        }
      }

      if (options.cursor) {
        try {
          progress('Installing cursor...')
          await yield_()
          installCursors()
          results.cursor = true
        } catch (e) {
          console.error('[setup] Cursor error:', e.message)
        }
      }

      markSetupComplete()
      return results
    },
    'setup/skip': async () => {
      if (installer.isPortableRun()) {
        try {
          progress('Copying files...')
          await yield_()
          await installer.installFiles()
          installer.createShortcuts()
          installer.registerUninstaller()
        } catch (e) {
          console.error('[setup] File install error:', e.message)
        }
      }
      markSetupComplete()
    },
    'setup/relaunch': () => {
      if (installer.isPortableRun()) {
        installer.relaunchFromInstalled()
      } else {
        app.relaunch()
        app.exit()
      }
    },
    'setup/restart-windows': () => {
      execSync('shutdown /r /t 5 /c "Restarting to apply Alpine Shell"', { windowsHide: true })
      app.exit()
    },
    'setup/revert-temporary': () => runRevert(() => installer.revertShellTemporarily()),
    'setup/revert-permanent': () => runRevert(() => installer.revertShellPermanently()),
    'setup/uninstall': () => runRevert(() => installer.uninstall()),
    'setup/set-shell': () => {
      setAsShell()
      setStartup()
      return { success: verifyShellWrite() }
    },
  },

  isFirstRun,
  isDefaultShell,
  ensureShellRegistration,
  killExplorer,
  restartExplorer,

  start(b) {
    broadcast = b
  },
}
