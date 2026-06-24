const { app } = require('electron')
const path = require('path')
const fs = require('fs')

const STORE_FILE = 'launcher-prefs.json'
const RESULTS_MIN = 3
const RESULTS_MAX = 8
const RESULTS_DEFAULT = 8

let storePath = null
let showRecentApps = false
let maxResults = RESULTS_DEFAULT
let broadcast = null

function getStorePath() {
  if (!storePath) storePath = path.join(app.getPath('userData'), STORE_FILE)
  return storePath
}

function clampMaxResults(value) {
  const rounded = Math.round(Number(value))
  if (!Number.isFinite(rounded)) return RESULTS_DEFAULT
  return Math.max(RESULTS_MIN, Math.min(RESULTS_MAX, rounded))
}

function load() {
  try {
    const file = getStorePath()
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'))
      if (typeof data.showRecentApps === 'boolean') showRecentApps = data.showRecentApps
      if (typeof data.maxResults === 'number') maxResults = clampMaxResults(data.maxResults)
    }
  } catch (e) {
    console.error('[launcherPrefs] load error:', e.message)
  }
}

function save() {
  try {
    fs.writeFileSync(getStorePath(), JSON.stringify({ showRecentApps, maxResults }, null, 2))
  } catch (e) {
    console.error('[launcherPrefs] save error:', e.message)
  }
}

module.exports = {
  handlers: {
    'launcher/recent-apps-get': () => showRecentApps,
    'launcher/recent-apps-set': (_event, value) => {
      showRecentApps = !!value
      save()
      if (broadcast) broadcast('launcher/recent-apps-changed', showRecentApps)
      return showRecentApps
    },
    'launcher/max-results-get': () => maxResults,
    'launcher/max-results-set': (_event, value) => {
      maxResults = clampMaxResults(value)
      save()
      if (broadcast) broadcast('launcher/max-results-changed', maxResults)
      return maxResults
    },
  },
  start(b) {
    broadcast = b
    load()
  },
}
