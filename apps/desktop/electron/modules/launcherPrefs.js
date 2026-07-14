const { app } = require('electron')
const path = require('path')
const fs = require('fs')

const STORE_FILE = 'launcher-prefs.json'
const RESULTS_MIN = 3
const RESULTS_MAX = 8
const RESULTS_DEFAULT = 8

let storePath = null
let showRecentApps = false
let showBookmarks = true
let showBrowserTabs = true
let maxResults = RESULTS_DEFAULT
let recentEmoji = []
let broadcast = null

const MAX_RECENT_EMOJI = 24

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
      if (typeof data.showBookmarks === 'boolean') showBookmarks = data.showBookmarks
      if (typeof data.showBrowserTabs === 'boolean') showBrowserTabs = data.showBrowserTabs
      if (typeof data.maxResults === 'number') maxResults = clampMaxResults(data.maxResults)
      if (Array.isArray(data.recentEmoji)) recentEmoji = data.recentEmoji.filter((c) => typeof c === 'string').slice(0, MAX_RECENT_EMOJI)
    }
  } catch (e) {
    console.error('[launcherPrefs] load error:', e.message)
  }
}

function save() {
  try {
    fs.writeFileSync(getStorePath(), JSON.stringify({ showRecentApps, showBookmarks, showBrowserTabs, maxResults, recentEmoji }, null, 2))
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
    'launcher/show-bookmarks-get': () => showBookmarks,
    'launcher/show-bookmarks-set': (_event, value) => {
      showBookmarks = !!value
      save()
      if (broadcast) broadcast('launcher/show-bookmarks-changed', showBookmarks)
      return showBookmarks
    },
    'launcher/show-browser-tabs-get': () => showBrowserTabs,
    'launcher/show-browser-tabs-set': (_event, value) => {
      showBrowserTabs = !!value
      save()
      if (broadcast) broadcast('launcher/show-browser-tabs-changed', showBrowserTabs)
      return showBrowserTabs
    },
    'launcher/max-results-get': () => maxResults,
    'launcher/max-results-set': (_event, value) => {
      maxResults = clampMaxResults(value)
      save()
      if (broadcast) broadcast('launcher/max-results-changed', maxResults)
      return maxResults
    },
    'emoji/recents-get': () => recentEmoji,
    'emoji/recents-add': (_event, char) => {
      if (typeof char === 'string' && char) {
        recentEmoji = [char, ...recentEmoji.filter((c) => c !== char)].slice(0, MAX_RECENT_EMOJI)
        save()
      }
      return recentEmoji
    },
  },
  start(b) {
    broadcast = b
    load()
  },
}
