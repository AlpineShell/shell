const { app } = require('electron')
const path = require('path')
const { execSync } = require('child_process')
const fs = require('fs')

const CURSOR_REGISTRY_MAP = {
  'Arrow': 'Normal Select.cur',
  'Help': 'Help Select.cur',
  'AppStarting': 'Working In Background.ani',
  'Wait': 'Busy.ani',
  'Crosshair': 'Precision Select.cur',
  'IBeam': 'Text Select.cur',
  'NWPen': 'HandWriting.cur',
  'No': 'Unavailable.cur',
  'SizeNS': 'Vertical Resize.cur',
  'SizeWE': 'Horizontal Resize.cur',
  'SizeNWSE': 'Diagonal Resize 1.cur',
  'SizeNESW': 'Diagonal Resize 2.cur',
  'SizeAll': 'Move.cur',
  'UpArrow': 'Alternate Select.cur',
  'Hand': 'Link Select.cur',
  'Pin': 'Location Select.cur',
  'Person': 'Person Select.cur',
}

function getCursorSourceDir() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'cursor', 'Moga White')
  }
  return path.join(__dirname, '..', '..', 'public', 'cursor', 'Moga White')
}

function getCursorInstallDir() {
  return path.join(app.getPath('userData'), 'cursors')
}

function regAdd(keyPath, valueName, value, type = 'REG_SZ') {
  const cmd = `reg add "${keyPath}" /v "${valueName}" /t ${type} /d "${value}" /f`
  execSync(cmd, { windowsHide: true })
}

function regQuery(keyPath, valueName) {
  try {
    const result = execSync(`reg query "${keyPath}" /v "${valueName}"`, { windowsHide: true, encoding: 'utf8' })
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

function setAsShell() {
  const exePath = app.isPackaged ? process.execPath : path.join(__dirname, '..', '..', 'node_modules', 'electron', 'dist', 'electron.exe')
  const shellValue = app.isPackaged ? exePath : `"${exePath}" "${path.join(__dirname, '..', '..')}"`
  regAdd('HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon', 'Shell', shellValue)
}

function setStartup() {
  const exePath = process.execPath
  const appPath = app.isPackaged ? `"${exePath}"` : `"${exePath}" "${path.join(__dirname, '..', '..')}"`
  regAdd('HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run', 'AlpineShell', appPath)
}

function hasGpoShellOverride() {
  const policyShell = regQuery('HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System', 'Shell')
  return policyShell !== null
}

function verifyShellWrite() {
  const currentShell = regQuery('HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon', 'Shell')
  return currentShell !== null && !currentShell.toLowerCase().includes('explorer.exe')
}

function getSetupStatus() {
  const currentShell = regQuery('HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon', 'Shell')
  const startupEntry = regQuery('HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run', 'AlpineShell')
  const currentCursor = regQuery('HKCU\\Control Panel\\Cursors', '')

  return {
    isShell: currentShell !== null && currentShell !== 'explorer.exe',
    hasStartup: startupEntry !== null,
    hasCursor: currentCursor === 'Alpine Shell',
    gpoBlocked: hasGpoShellOverride(),
  }
}

function isFirstRun() {
  const flagPath = path.join(app.getPath('userData'), '.setup-complete')
  return !fs.existsSync(flagPath)
}

function markSetupComplete() {
  const flagPath = path.join(app.getPath('userData'), '.setup-complete')
  fs.writeFileSync(flagPath, new Date().toISOString())
}

module.exports = {
  handlers: {
    'setup/status': () => getSetupStatus(),
    'setup/install': (_event, options) => {
      const results = { shell: false, startup: false, cursor: false, gpoBlocked: false }
      try {
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
      if (options.cursor) {
        try {
          installCursors()
          results.cursor = true
        } catch (e) {
          console.error('[setup] Cursor error:', e.message)
        }
      }
      markSetupComplete()
      return results
    },
    'setup/skip': () => {
      markSetupComplete()
    },
  },

  isFirstRun,

  start() {},
}
