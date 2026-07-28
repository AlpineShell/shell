const { app } = require('electron')
const { autoUpdater } = require('electron-updater')
const path = require('path')
const fs = require('fs')
const installer = require('./installer')
const frecency = require('./frecency')
const appIcons = require('./appIcons')

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000
const INITIAL_CHECK_DELAY_MS = 10000
const UPDATER_PRECOMPILE_DELAY_MS = 60000
const MAX_LOG_ENTRIES = 50
const RETRY_DELAYS_MS = [30 * 1000, 2 * 60 * 1000, 5 * 60 * 1000]

const state = {
  status: 'idle',
  currentVersion: app.getVersion(),
  availableVersion: null,
  progressPercent: 0,
  error: null,
}

const log = []
let pendingVersion = null
let announceResult = false
let broadcastChanged = null
let downloadedFile = null
let retryTimer = null
let retryAttempt = 0
let allowRetryForCurrentCheck = false

function setState(partial) {
  Object.assign(state, partial)
  if (broadcastChanged) broadcastChanged('updates/state-changed', state)
}

function logFilePath() {
  return path.join(app.getPath('userData'), 'update-log.json')
}

function persistStore() {
  try {
    fs.writeFileSync(logFilePath(), JSON.stringify({ entries: log, pendingVersion }))
  } catch {}
}

function loadStore() {
  try {
    const parsed = JSON.parse(fs.readFileSync(logFilePath(), 'utf8'))
    if (Array.isArray(parsed.entries)) {
      log.push(...parsed.entries.slice(-MAX_LOG_ENTRIES))
    }
    pendingVersion = parsed.pendingVersion ?? null
  } catch {}
}

function pushLog(level, message) {
  log.push({ time: Date.now(), level, message })
  if (log.length > MAX_LOG_ENTRIES) log.splice(0, log.length - MAX_LOG_ENTRIES)
  persistStore()
  if (broadcastChanged) broadcastChanged('updates/log-changed', log)
}

function toMessage(e) {
  return e == null ? 'unknown' : e.message || String(e)
}

function clearRetry() {
  if (retryTimer) clearTimeout(retryTimer)
  retryTimer = null
  retryAttempt = 0
  allowRetryForCurrentCheck = false
}

function scheduleRetry() {
  if (retryAttempt >= RETRY_DELAYS_MS.length) return
  if (retryTimer) clearTimeout(retryTimer)
  const delay = RETRY_DELAYS_MS[retryAttempt]
  retryAttempt += 1
  retryTimer = setTimeout(() => {
    retryTimer = null
    runCheck(false, true)
  }, delay)
}

function runCheck(announce, allowRetry = false) {
  if (state.status === 'downloading' || state.status === 'downloaded') return
  if (!app.isPackaged) {
    if (announce) {
      pushLog('info', 'Checking for updates…')
      pushLog('info', 'Update checks run only in the installed app.')
    }
    setState({ status: 'not-available' })
    return
  }
  announceResult = announce
  allowRetryForCurrentCheck = allowRetry
  autoUpdater.checkForUpdates().catch(() => {})
}

autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = false

autoUpdater.on('checking-for-update', () => {
  if (announceResult) pushLog('info', 'Checking for updates…')
  setState({ status: 'checking', error: null })
})

autoUpdater.on('update-available', (info) => {
  clearRetry()
  pushLog('info', `Update available — version ${info.version}`)
  announceResult = false
  setState({ status: 'available', availableVersion: info.version })
})

autoUpdater.on('update-not-available', () => {
  clearRetry()
  if (announceResult) pushLog('info', `Up to date — version ${state.currentVersion}`)
  announceResult = false
  setState({ status: 'not-available' })
})

autoUpdater.on('download-progress', (progress) => {
  setState({ status: 'downloading', progressPercent: Math.round(progress.percent) })
})

autoUpdater.on('update-downloaded', (info) => {
  downloadedFile = info.downloadedFile ?? null
  pushLog('info', `Downloaded version ${info.version} — ready to install`)
  setState({ status: 'downloaded', availableVersion: info.version, progressPercent: 100 })
})

autoUpdater.on('error', (err) => {
  pushLog('error', `Update error: ${toMessage(err)}`)
  announceResult = false
  setState({ status: 'error', error: toMessage(err) })
  if (allowRetryForCurrentCheck) scheduleRetry()
})

module.exports = {
  handlers: {
    'updates/get-state': () => state,

    'updates/get-log': () => log,

    'updates/check': () => {
      runCheck(true, false)
      return state
    },

    'updates/download': () => {
      if (app.isPackaged) {
        pushLog('info', `Downloading version ${state.availableVersion ?? ''}…`)
        setState({ status: 'downloading', progressPercent: 0 })
        autoUpdater.downloadUpdate().catch(() => {})
      }
      return undefined
    },

    'updates/install': () => {
      if (app.isPackaged) {
        pendingVersion = state.availableVersion
        pushLog('info', `Installing version ${state.availableVersion ?? ''} — Alpine Shell will restart…`)
        if (downloadedFile && installer.startBrandedUpdate(downloadedFile, state.availableVersion)) {
          try { frecency.flush() } catch {}
          try { appIcons.flushDiskCache() } catch {}
          app.exit(0)
        } else {
          autoUpdater.quitAndInstall(true, true)
        }
      }
      return undefined
    },
  },

  start(broadcast) {
    broadcastChanged = broadcast
    loadStore()

    if (pendingVersion) {
      const target = pendingVersion
      pendingVersion = null
      if (target === state.currentVersion) {
        pushLog('info', `Updated to version ${state.currentVersion}`)
      } else {
        pushLog('info', `Update to version ${target} didn't finish — still on version ${state.currentVersion}`)
      }
    }

    if (!app.isPackaged) return

    setTimeout(() => {
      clearRetry()
      runCheck(true, true)
    }, INITIAL_CHECK_DELAY_MS)

    setTimeout(() => { installer.ensureUpdaterExeAsync().catch(() => {}) }, UPDATER_PRECOMPILE_DELAY_MS)

    setInterval(() => {
      clearRetry()
      runCheck(false, true)
    }, CHECK_INTERVAL_MS)
  },
}
