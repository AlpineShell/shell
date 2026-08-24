const { app } = require('electron')
const path = require('path')
const { execSync, execFileSync } = require('child_process')
const fs = require('fs')
const installer = require('./installer')
const updater = require('./updater')
const explorerShell = require('./explorerShell')
const shellExclusivity = require('./shellExclusivity')

const CURSOR_VARIANT = 'Bibata-Original-Ice'
const REVERT_QUIT_DELAY_MS = 1200
const REVERT_BLOCKED_MESSAGES = {
  [shellExclusivity.REVERT_BLOCKED_IN_DEVELOPMENT]: 'Unavailable in development.',
  [shellExclusivity.REVERT_BLOCKED_BY_UPDATE]: 'An update is in progress. Try again once it has finished.',
}
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
  installer.clearShellHandoff()
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

function ensureShellRegistration(gpoBlocked) {
  if (!app.isPackaged) return
  if (installer.isShellOptedOut()) return
  if (gpoBlocked) return

  const desiredShell = getShellExePath()
  if (regQuery('HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon', 'Shell') !== desiredShell) {
    regAdd('HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon', 'Shell', desiredShell)
  }

  const desiredRun = `"${installer.getInstalledExePath()}"`
  const currentRun = regQuery('HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run', 'AlpineShell')
  if (currentRun !== desiredRun) {
    try { regAdd('HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run', 'AlpineShell', desiredRun) } catch {}
  }

  if (regQuery(XAML_START_MENU_KEY, 'EnableXamlStartMenu') === null) {
    try { regAdd(XAML_START_MENU_KEY, 'EnableXamlStartMenu', '0', 'REG_DWORD') } catch {}
  }
}

function hasGpoShellOverride() {
  const policyShell = regQuery('HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System', 'Shell')
  return policyShell !== null
}

function isShellRegisteredToAlpine() {
  const currentShell = regQuery('HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon', 'Shell')
  return currentShell !== null && !currentShell.toLowerCase().includes('explorer.exe')
}

function lazyContext(sources) {
  const context = {}
  for (const [key, compute] of Object.entries(sources)) {
    let cached = null
    let evaluated = false
    Object.defineProperty(context, key, {
      enumerable: true,
      get() {
        if (!evaluated) {
          cached = compute()
          evaluated = true
        }
        return cached
      },
    })
  }
  return context
}

function isShellHandoffInEffect() {
  if (!installer.hasShellHandoff()) return false
  if (explorerShell.shellHostedByExplorer() === false) {
    installer.clearShellHandoff()
    return false
  }
  return true
}

function shellActivationContext() {
  return lazyContext({
    packaged: () => app.isPackaged,
    forceTakeover: () => process.env.ALPINE_PREVIEW_SHELL === '1',
    firstRun: isFirstRun,
    optedOut: () => installer.isShellOptedOut(),
    updateInProgress: () => installer.isUpdateHandoffActive(),
    handedToExplorer: isShellHandoffInEffect,
    gpoBlocked: hasGpoShellOverride,
    shellRegisteredToAlpine: isShellRegisteredToAlpine,
  })
}

function applyShellRegistration(context) {
  try {
    ensureShellRegistration(context.gpoBlocked)
  } catch (e) {
    console.error('[setup] Could not register Alpine Shell as the Windows shell:', e.message)
    return false
  }
  return context.shellRegisteredToAlpine || isShellRegisteredToAlpine()
}

function takeOverFromExplorer() {
  const context = shellActivationContext()
  const plan = shellExclusivity.planShellActivation(context)
  const registrationVerified = shellExclusivity.requiresShellRegistration(plan) && applyShellRegistration(context)

  return { actingAsShell: plan.actingAsShell && shellExclusivity.isRegistrationSatisfied(plan, registrationVerified) }
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
let shellShutdown = null
const yield_ = () => new Promise(r => setTimeout(r, 50))

function setShellShutdown(shutdown) {
  shellShutdown = shutdown
}

function exitShell() {
  if (shellShutdown) shellShutdown()
  else app.exit(0)
}

function progress(step) {
  if (broadcast) broadcast('setup/progress', step)
}

function exitShellOnceHandoffIsRunning(handoff) {
  setTimeout(() => {
    if (!installer.isRevertHelperRunning(handoff)) {
      console.error('[setup] The hand-back helper is no longer running — keeping Alpine Shell on screen')
      return
    }
    exitShell()
  }, REVERT_QUIT_DELAY_MS)
}

function runRevert(action) {
  const blockedReason = shellExclusivity.revertBlockedReason({
    packaged: app.isPackaged,
    updatePending: updater.isUpdatePending() || installer.isUpdateHandoffActive(),
  })
  if (blockedReason) return { success: false, gpoBlocked: false, error: REVERT_BLOCKED_MESSAGES[blockedReason], leftBehind: [] }

  const result = action()
  const plan = shellExclusivity.planShellRevert({
    shellHandedToExplorer: result.success,
    replacementConfirmed: installer.isRevertHelperRunning(result.handoff),
  })
  if (plan.steps.includes(shellExclusivity.EXIT_ALPINE)) exitShellOnceHandoffIsRunning(result.handoff)
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
          results.shell = isShellRegisteredToAlpine()
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
      return { success: isShellRegisteredToAlpine() }
    },
  },

  isFirstRun,
  takeOverFromExplorer,
  setShellShutdown,

  start(b) {
    broadcast = b
  },
}
