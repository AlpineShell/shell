const { app } = require('electron')
const path = require('path')
const fs = require('fs')

const STORE_FILE = 'launcher-prefs.json'

let storePath = null
let showRecentApps = false
let broadcast = null

function getStorePath() {
  if (!storePath) storePath = path.join(app.getPath('userData'), STORE_FILE)
  return storePath
}

function load() {
  try {
    const file = getStorePath()
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'))
      if (typeof data.showRecentApps === 'boolean') showRecentApps = data.showRecentApps
    }
  } catch (e) {
    console.error('[launcherPrefs] load error:', e.message)
  }
}

function save() {
  try {
    fs.writeFileSync(getStorePath(), JSON.stringify({ showRecentApps }, null, 2))
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
  },
  start(b) {
    broadcast = b
    load()
  },
}
