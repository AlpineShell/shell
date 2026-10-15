const path = require('path')
const fs = require('fs')
const installer = require('./installer')
const frecency = require('./frecency')
const appIcons = require('./appIcons')
const licence = require('./licence')

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000
const INITIAL_CHECK_DELAY_MS = 10000
const UPDATER_PRECOMPILE_DELAY_MS = 60000
const MAX_LOG_ENTRIES = 50
const RETRY_DELAYS_MS = [30 * 1000, 2 * 60 * 1000, 5 * 60 * 1000]
const DOWNLOAD_STALL_TIMEOUT_MS = 60 * 1000
const SIGN_IN_FOR_UPDATES_MESSAGE = 'Sign in to get updates'
const UPDATES_REFUSED_FOR_LICENCE_MESSAGE = 'Updates are not available for this licence. Alpine Shell keeps working as it is.'
const UPDATE_CHECKS_OFF_MESSAGE = 'Update checks are off. Alpine Shell will not contact alpineshell.com.'
const FEED_STATUS_CODES_REFUSING_LICENCE = new Set([401, 403])
const PREFERENCES_FILE = 'update-prefs.json'

const state = {
  status: 'idle',
  currentVersion: null,
  availableVersion: null,
  progressPercent: 0,
  error: null,
  signInRequired: false,
}

const log = []
let pendingVersion = null
let announceResult = false
let broadcastChanged = null
let downloadedFile = null
let retryTimer = null
let retryAttempt = 0
let allowRetryForCurrentCheck = false
let downloadCancellation = null
let downloadStallTimer = null
let boundAutoUpdater = null
let feedCredentialsPresent = false
let checkForUpdates = true

function electronApp() {
  return require('electron').app
}

function preferencesFilePath() {
  return path.join(electronApp().getPath('userData'), PREFERENCES_FILE)
}

function loadPreferences() {
  try {
    const parsed = JSON.parse(fs.readFileSync(preferencesFilePath(), 'utf8'))
    if (typeof parsed.checkForUpdates === 'boolean') checkForUpdates = parsed.checkForUpdates
  } catch {}
}

function savePreferences() {
  try {
    fs.writeFileSync(preferencesFilePath(), JSON.stringify({ checkForUpdates }, null, 2))
  } catch {}
}

function preferences() {
  return { checkForUpdates }
}

function updaterLibrary() {
  return require('electron-updater')
}

function autoUpdater() {
  if (!boundAutoUpdater) boundAutoUpdater = bindAutoUpdater(updaterLibrary().autoUpdater)
  return boundAutoUpdater
}

function setState(partial) {
  Object.assign(state, partial)
  state.signInRequired = state.status === 'error' && state.error === SIGN_IN_FOR_UPDATES_MESSAGE
  if (broadcastChanged) broadcastChanged('updates/state-changed', state)
}

function logFilePath() {
  return path.join(electronApp().getPath('userData'), 'update-log.json')
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

function feedRefusedLicence(e) {
  return Boolean(e) && FEED_STATUS_CODES_REFUSING_LICENCE.has(e.statusCode)
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

function feedAuthorization() {
  const token = licence.currentToken()
  return token ? `Bearer ${token}` : null
}

function applyFeedCredentials() {
  const authorization = feedAuthorization()
  autoUpdater().requestHeaders = authorization ? { Authorization: authorization } : null
  feedCredentialsPresent = authorization !== null
  return feedCredentialsPresent
}

function reportCheckSkippedForLicence(announce) {
  if (!announce) return
  pushLog('info', 'Checking for updates…')
  pushLog('info', SIGN_IN_FOR_UPDATES_MESSAGE)
  setState({ status: 'error', error: SIGN_IN_FOR_UPDATES_MESSAGE })
}

function reportChecksOff(announce) {
  if (announce) {
    pushLog('info', 'Checking for updates…')
    pushLog('info', UPDATE_CHECKS_OFF_MESSAGE)
  }
  setState({ status: 'not-available' })
}

function runCheck(announce, allowRetry = false) {
  if (state.status === 'downloading' || state.status === 'downloaded') return
  if (!electronApp().isPackaged) {
    if (announce) {
      pushLog('info', 'Checking for updates…')
      pushLog('info', 'Update checks run only in the installed app.')
    }
    setState({ status: 'not-available' })
    return
  }
  if (!checkForUpdates) {
    reportChecksOff(announce)
    return
  }
  if (!applyFeedCredentials()) {
    reportCheckSkippedForLicence(announce)
    return
  }
  announceResult = announce
  allowRetryForCurrentCheck = allowRetry
  autoUpdater().checkForUpdates().catch(() => {})
}

function onLicenceChanged() {
  const hadCredentials = feedCredentialsPresent
  const hasCredentials = applyFeedCredentials()
  if (hasCredentials && !hadCredentials) {
    clearRetry()
    runCheck(false, true)
  }
}

function clearDownloadWatch() {
  if (downloadStallTimer) clearTimeout(downloadStallTimer)
  downloadStallTimer = null
  downloadCancellation = null
}

function armDownloadStallTimer() {
  if (downloadStallTimer) clearTimeout(downloadStallTimer)
  downloadStallTimer = setTimeout(abandonStalledDownload, DOWNLOAD_STALL_TIMEOUT_MS)
}

function abandonStalledDownload() {
  const cancellation = downloadCancellation
  clearDownloadWatch()
  if (cancellation) cancellation.cancel()
  const message = `download stalled — no data for ${DOWNLOAD_STALL_TIMEOUT_MS / 1000}s`
  pushLog('error', `Update error: ${message}`)
  setState({ status: 'error', error: message })
  allowRetryForCurrentCheck = true
  scheduleRetry()
}

function abandonDownloadForPreference() {
  const cancellation = downloadCancellation
  clearDownloadWatch()
  if (cancellation) cancellation.cancel()
}

function setPreferences(partial) {
  const requested = partial && typeof partial.checkForUpdates === 'boolean' ? partial.checkForUpdates : checkForUpdates
  const changed = requested !== checkForUpdates
  checkForUpdates = requested
  savePreferences()
  if (broadcastChanged) broadcastChanged('updates/preferences-changed', preferences())
  if (!changed) return preferences()
  clearRetry()
  if (checkForUpdates) {
    runCheck(false, true)
    return preferences()
  }
  abandonDownloadForPreference()
  pushLog('info', UPDATE_CHECKS_OFF_MESSAGE)
  if (state.status !== 'downloaded') setState({ status: 'not-available', availableVersion: null, progressPercent: 0, error: null })
  return preferences()
}

function startDownload() {
  clearDownloadWatch()
  if (!checkForUpdates) {
    pushLog('error', `Update error: ${UPDATE_CHECKS_OFF_MESSAGE}`)
    setState({ status: 'error', error: UPDATE_CHECKS_OFF_MESSAGE })
    return
  }
  if (!applyFeedCredentials()) {
    pushLog('error', `Update error: ${SIGN_IN_FOR_UPDATES_MESSAGE}`)
    setState({ status: 'error', error: SIGN_IN_FOR_UPDATES_MESSAGE })
    return
  }
  downloadCancellation = new (updaterLibrary().CancellationToken)()
  armDownloadStallTimer()
  autoUpdater().downloadUpdate(downloadCancellation).catch(() => {})
}

function bindAutoUpdater(updater) {
  updater.autoDownload = false
  updater.autoInstallOnAppQuit = false

  updater.on('checking-for-update', () => {
    if (announceResult) pushLog('info', 'Checking for updates…')
    setState({ status: 'checking', error: null })
  })

  updater.on('update-available', (info) => {
    clearRetry()
    pushLog('info', `Update available — version ${info.version}`)
    announceResult = false
    setState({ status: 'available', availableVersion: info.version })
  })

  updater.on('update-not-available', () => {
    clearRetry()
    if (announceResult) pushLog('info', `Up to date — version ${state.currentVersion}`)
    announceResult = false
    setState({ status: 'not-available' })
  })

  updater.on('download-progress', (progress) => {
    if (downloadCancellation) armDownloadStallTimer()
    setState({ status: 'downloading', progressPercent: Math.round(progress.percent) })
  })

  updater.on('update-downloaded', (info) => {
    clearDownloadWatch()
    downloadedFile = info.downloadedFile ?? null
    pushLog('info', `Downloaded version ${info.version} — ready to install`)
    setState({ status: 'downloaded', availableVersion: info.version, progressPercent: 100 })
  })

  updater.on('error', (err) => {
    clearDownloadWatch()
    announceResult = false
    if (feedRefusedLicence(err)) {
      clearRetry()
      pushLog('error', UPDATES_REFUSED_FOR_LICENCE_MESSAGE)
      setState({ status: 'error', error: UPDATES_REFUSED_FOR_LICENCE_MESSAGE })
      return
    }
    pushLog('error', `Update error: ${toMessage(err)}`)
    setState({ status: 'error', error: toMessage(err) })
    if (allowRetryForCurrentCheck) scheduleRetry()
  })

  return updater
}

function isUpdatePending() {
  return state.status === 'downloading' || state.status === 'downloaded'
}

function reportPendingVersionOutcome() {
  if (!pendingVersion) return
  const target = pendingVersion
  pendingVersion = null
  if (target === state.currentVersion) {
    pushLog('info', `Updated to version ${state.currentVersion}`)
  } else {
    pushLog('info', `Update to version ${target} didn't finish — still on version ${state.currentVersion}`)
  }
}

module.exports = {
  isUpdatePending,
  INITIAL_CHECK_DELAY_MS,
  CHECK_INTERVAL_MS,
  SIGN_IN_FOR_UPDATES_MESSAGE,
  UPDATES_REFUSED_FOR_LICENCE_MESSAGE,
  UPDATE_CHECKS_OFF_MESSAGE,
  PREFERENCES_FILE,

  handlers: {
    'updates/get-state': () => state,

    'updates/get-log': () => log,

    'updates/get-preferences': () => preferences(),

    'updates/set-preferences': (_event, partial) => setPreferences(partial),

    'updates/check': () => {
      runCheck(true, false)
      return state
    },

    'updates/download': () => {
      if (electronApp().isPackaged) {
        pushLog('info', `Downloading version ${state.availableVersion ?? ''}…`)
        setState({ status: 'downloading', progressPercent: 0 })
        startDownload()
      }
      return undefined
    },

    'updates/install': () => {
      const app = electronApp()
      if (app.isPackaged) {
        pendingVersion = state.availableVersion
        pushLog('info', `Installing version ${state.availableVersion ?? ''} — Alpine Shell will restart…`)
        if (downloadedFile && installer.startBrandedUpdate(downloadedFile, state.availableVersion)) {
          try { frecency.flush() } catch {}
          try { appIcons.flushDiskCache() } catch {}
          app.exit(0)
        } else {
          autoUpdater().quitAndInstall(true, true)
        }
      }
      return undefined
    },
  },

  start(broadcast) {
    broadcastChanged = broadcast
    state.currentVersion = electronApp().getVersion()
    loadStore()
    loadPreferences()
    reportPendingVersionOutcome()

    if (!electronApp().isPackaged) return

    licence.onStatusChanged(onLicenceChanged)

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
