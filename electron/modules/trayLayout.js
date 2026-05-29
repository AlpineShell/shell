const { app, screen } = require('electron')
const fs = require('fs')
const path = require('path')

const STORE_FILE = 'tray-layout.json'

let order = []
let hidden = []
let showOnAllMonitors = false
let storePath = null
let broadcastRef = null

function getStorePath() {
  if (!storePath) storePath = path.join(app.getPath('userData'), STORE_FILE)
  return storePath
}

function load() {
  try {
    const file = getStorePath()
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'))
      if (Array.isArray(data.order)) order = data.order.filter((id) => typeof id === 'string')
      if (Array.isArray(data.hidden)) hidden = data.hidden.filter((id) => typeof id === 'string')
      if (typeof data.showOnAllMonitors === 'boolean') showOnAllMonitors = data.showOnAllMonitors
    }
  } catch (e) {
    console.error('[trayLayout] load error:', e.message)
  }
}

function save() {
  try {
    const dir = path.dirname(getStorePath())
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(getStorePath(), JSON.stringify({ order, hidden, showOnAllMonitors }))
  } catch (e) {
    console.error('[trayLayout] save error:', e.message)
  }
}

function getLayout() {
  return { order, hidden }
}

function getPrimaryDisplayId() {
  try {
    return screen.getPrimaryDisplay().id
  } catch {
    return 0
  }
}

function getDisplaySetting() {
  return { showOnAllMonitors, primaryDisplayId: getPrimaryDisplayId() }
}

module.exports = {
  handlers: {
    'tray/layout-get': () => getLayout(),
    'tray/layout-set': (_event, layout) => {
      if (layout && Array.isArray(layout.order)) order = layout.order.filter((id) => typeof id === 'string')
      if (layout && Array.isArray(layout.hidden)) hidden = layout.hidden.filter((id) => typeof id === 'string')
      save()
      if (broadcastRef) broadcastRef('tray/layout-changed', getLayout())
      return getLayout()
    },
    'tray/display-get': () => getDisplaySetting(),
    'tray/display-set': (_event, value) => {
      showOnAllMonitors = !!value
      save()
      if (broadcastRef) broadcastRef('tray/display-changed', getDisplaySetting())
      return getDisplaySetting()
    },
  },

  start(broadcast) {
    broadcastRef = broadcast
    load()
    const emitDisplay = () => broadcast('tray/display-changed', getDisplaySetting())
    screen.on('display-added', emitDisplay)
    screen.on('display-removed', emitDisplay)
    screen.on('display-metrics-changed', emitDisplay)
  },
}
