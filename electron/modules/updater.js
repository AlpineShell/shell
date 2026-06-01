const { app } = require('electron')
const { autoUpdater } = require('electron-updater')

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000
const INITIAL_CHECK_DELAY_MS = 10000

const state = {
  status: 'idle',
  currentVersion: app.getVersion(),
  availableVersion: null,
  progressPercent: 0,
  error: null,
}

let broadcastChanged = null

function setState(partial) {
  Object.assign(state, partial)
  if (broadcastChanged) broadcastChanged('updates/state-changed', state)
}

function toMessage(e) {
  return e == null ? 'unknown' : e.message || String(e)
}

autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = true

autoUpdater.on('checking-for-update', () => {
  setState({ status: 'checking', error: null })
})

autoUpdater.on('update-available', (info) => {
  setState({ status: 'available', availableVersion: info.version })
})

autoUpdater.on('update-not-available', () => {
  setState({ status: 'not-available' })
})

autoUpdater.on('download-progress', (progress) => {
  setState({ status: 'downloading', progressPercent: Math.round(progress.percent) })
})

autoUpdater.on('update-downloaded', (info) => {
  setState({ status: 'downloaded', availableVersion: info.version, progressPercent: 100 })
})

autoUpdater.on('error', (err) => {
  setState({ status: 'error', error: toMessage(err) })
})

module.exports = {
  handlers: {
    'updates/get-state': () => state,

    'updates/check': () => {
      if (app.isPackaged) {
        autoUpdater.checkForUpdates().catch((e) => setState({ status: 'error', error: toMessage(e) }))
      } else {
        setState({ status: 'not-available' })
      }
      return state
    },

    'updates/download': () => {
      if (app.isPackaged) {
        autoUpdater.downloadUpdate().catch((e) => setState({ status: 'error', error: toMessage(e) }))
      }
      return undefined
    },

    'updates/install': () => {
      if (app.isPackaged) autoUpdater.quitAndInstall()
      return undefined
    },
  },

  start(broadcast) {
    broadcastChanged = broadcast

    if (!app.isPackaged) return

    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((e) => setState({ status: 'error', error: toMessage(e) }))
    }, INITIAL_CHECK_DELAY_MS)

    setInterval(() => {
      autoUpdater.checkForUpdates().catch((e) => setState({ status: 'error', error: toMessage(e) }))
    }, CHECK_INTERVAL_MS)
  },
}
