const fs = require('fs')
const path = require('path')
const { execFileSync, spawn } = require('child_process')
const { regQuery } = require('./registryRead')

const BOOT_ATTEMPTS_FILE = '.shell-boot-attempts'
const MAX_UNFINISHED_BOOTS = 2
const START_SHELL = 'start-shell'
const CHECK_FOR_EXPLORER_DESKTOP = 'check-for-explorer-desktop'
const FALL_BACK_TO_EXPLORER = 'fall-back-to-explorer'
const EXIT_ALPINE = 'exit-alpine'
const HAND_SIGN_IN_TO_EXPLORER = 'hand-sign-in-to-explorer'
const AUTOSTART_LAUNCH_ARG = '--autostart'
const UNGUARDED_LAUNCH_ARGS = ['--setup', '--uninstall', '--uninstall-cleanup']
const WINLOGON_KEY = 'HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon'
const EXPLORER_SHELL = 'explorer.exe'

function guardsLaunch({ packaged, portable, argv }) {
  return Boolean(packaged) && !portable && !argv.some((arg) => UNGUARDED_LAUNCH_ARGS.includes(arg))
}

function parseUnfinishedBoots(text) {
  const count = Number(String(text ?? '').trim())
  return Number.isInteger(count) && count > 0 ? count : 0
}

function startShellPlan(unfinishedBoots) {
  return { action: START_SHELL, unfinishedBoots: unfinishedBoots + 1 }
}

function planShellBoot({ unfinishedBoots, argv }) {
  if (unfinishedBoots < MAX_UNFINISHED_BOOTS) return startShellPlan(unfinishedBoots)
  if (argv.includes(AUTOSTART_LAUNCH_ARG)) {
    return { action: FALL_BACK_TO_EXPLORER, unfinishedBoots, startExplorer: false }
  }
  return { action: CHECK_FOR_EXPLORER_DESKTOP, unfinishedBoots }
}

function planExplorerDesktopCheck({ unfinishedBoots, explorerHostsShell }) {
  if (explorerHostsShell === true) return startShellPlan(unfinishedBoots)
  return { action: FALL_BACK_TO_EXPLORER, unfinishedBoots, startExplorer: true }
}

function probeExplorerDesktop(shellHostedByExplorer) {
  try {
    return shellHostedByExplorer()
  } catch (e) {
    console.error('[bootRecovery] Could not tell whether Explorer runs the desktop:', e.message)
    return null
  }
}

function decideShellBoot({ unfinishedBoots, argv, shellHostedByExplorer }) {
  const plan = planShellBoot({ unfinishedBoots, argv })
  if (plan.action !== CHECK_FOR_EXPLORER_DESKTOP) return plan
  const previousShell = regQuery(WINLOGON_KEY, 'Shell')
  registerExplorerAsShell()
  const checked = planExplorerDesktopCheck({ unfinishedBoots, explorerHostsShell: probeExplorerDesktop(shellHostedByExplorer) })
  if (checked.action === START_SHELL) restoreShellValue(previousShell)
  return checked
}

function planFailedStart(context) {
  if (!context.guarded || context.updaterAwaitsReady) return { action: EXIT_ALPINE }
  if (context.explorerHostsShell === true) return { action: EXIT_ALPINE }
  if (context.optedOut) return { action: FALL_BACK_TO_EXPLORER, startExplorer: true }
  return { action: HAND_SIGN_IN_TO_EXPLORER }
}

function bootAttemptsPath(userDataDirectory) {
  return path.join(userDataDirectory, BOOT_ATTEMPTS_FILE)
}

function readUnfinishedBoots(filePath) {
  try {
    return parseUnfinishedBoots(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return 0
  }
}

function recordUnfinishedBoots(filePath, count) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, String(count))
  } catch (e) {
    console.error('[bootRecovery] Could not record the start attempt:', e.message)
  }
}

function forgetUnfinishedBoots(filePath) {
  try { fs.rmSync(filePath, { force: true }) } catch {}
}

function restoreUnfinishedBoots(filePath, count) {
  if (count > 0) recordUnfinishedBoots(filePath, count)
  else forgetUnfinishedBoots(filePath)
}

function writeShellValue(value) {
  execFileSync('reg', ['add', WINLOGON_KEY, '/v', 'Shell', '/t', 'REG_SZ', '/d', value, '/f'], { windowsHide: true })
}

function registerExplorerAsShell() {
  try {
    writeShellValue(EXPLORER_SHELL)
    return true
  } catch (e) {
    console.error('[bootRecovery] Could not register Explorer as the shell:', e.message)
    return false
  }
}

function restoreShellValue(previousShell) {
  const shell = typeof previousShell === 'string' ? previousShell.trim() : ''
  if (shell === '' || shell.toLowerCase() === EXPLORER_SHELL) return
  try {
    writeShellValue(shell)
  } catch (e) {
    console.error('[bootRecovery] Could not put the shell registration back:', e.message)
  }
}

function windowsDirectory() {
  return process.env.SystemRoot || process.env.windir || 'C:\\Windows'
}

function startExplorer() {
  try {
    const child = spawn(path.join(windowsDirectory(), 'explorer.exe'), [], {
      detached: true,
      stdio: 'ignore',
      cwd: windowsDirectory(),
    })
    child.on('error', (e) => console.error('[bootRecovery] Explorer failed to start:', e.message))
    child.unref()
    return Boolean(child.pid)
  } catch (e) {
    console.error('[bootRecovery] Explorer failed to start:', e.message)
    return false
  }
}

function fallBackToExplorer(plan) {
  registerExplorerAsShell()
  if (plan.startExplorer) startExplorer()
}

module.exports = {
  MAX_UNFINISHED_BOOTS,
  START_SHELL,
  CHECK_FOR_EXPLORER_DESKTOP,
  FALL_BACK_TO_EXPLORER,
  EXIT_ALPINE,
  HAND_SIGN_IN_TO_EXPLORER,
  guardsLaunch,
  parseUnfinishedBoots,
  planShellBoot,
  planExplorerDesktopCheck,
  decideShellBoot,
  planFailedStart,
  bootAttemptsPath,
  readUnfinishedBoots,
  recordUnfinishedBoots,
  forgetUnfinishedBoots,
  restoreUnfinishedBoots,
  fallBackToExplorer,
}
