const fs = require('fs')
const path = require('path')

const STORE_FILE = 'topbar-layout.json'
const SLOTS = ['left', 'center', 'right']

function emptySlots() {
  return { left: [], center: [], right: [] }
}

let slots = emptySlots()
let hidden = []
let storePath = null
let broadcastRef = null

function getStorePath() {
  if (!storePath) {
    const { app } = require('electron')
    storePath = path.join(app.getPath('userData'), STORE_FILE)
  }
  return storePath
}

function sanitizeIds(value) {
  return Array.isArray(value) ? value.filter((id) => typeof id === 'string') : []
}

function mergeSlots(current, value) {
  const next = { ...current }
  for (const slot of SLOTS) {
    if (Array.isArray(value && value[slot])) next[slot] = sanitizeIds(value[slot])
  }
  return next
}

function getLayout() {
  return { slots, hidden }
}

function load() {
  try {
    const file = getStorePath()
    if (!fs.existsSync(file)) return
    const data = JSON.parse(fs.readFileSync(file, 'utf8'))
    slots = mergeSlots(emptySlots(), data.slots)
    hidden = sanitizeIds(data.hidden)
  } catch (e) {
    console.error('[topbarLayout] load error:', e.message)
  }
}

function save() {
  try {
    const dir = path.dirname(getStorePath())
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(getStorePath(), JSON.stringify(getLayout(), null, 2))
  } catch (e) {
    console.error('[topbarLayout] save error:', e.message)
  }
}

function applyPartial(partial) {
  if (!partial || typeof partial !== 'object') return
  slots = mergeSlots(slots, partial.slots)
  if (Array.isArray(partial.hidden)) hidden = sanitizeIds(partial.hidden)
}

module.exports = {
  handlers: {
    'topbar/layout-get': () => getLayout(),
    'topbar/layout-set': (_event, partial) => {
      applyPartial(partial)
      save()
      if (broadcastRef) broadcastRef('topbar/layout-changed', getLayout())
      return getLayout()
    },
  },

  start(broadcast) {
    broadcastRef = broadcast
    load()
    const { ipcMain } = require('electron')
    ipcMain.on('topbar/layout-init', (event) => {
      event.returnValue = getLayout()
    })
  },
}
