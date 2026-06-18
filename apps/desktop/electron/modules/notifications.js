const { app, shell } = require('electron')
const fs = require('fs')
const path = require('path')

const STORE_FILE = 'notifications.json'

const POSITIONS = new Set(['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-right'])

const DEFAULT_CONFIG = {
  enabled: true,
  doNotDisturb: false,
  position: 'top-center',
  defaultDuration: 5000,
  maxHistory: 50,
  groupBySource: true,
  captureOsToasts: true,
  bySource: {},
}

let config = { ...DEFAULT_CONFIG }
let items = []
let nextId = 1
let storePath = null
let broadcastRef = null

let osAccessStatus = 'unknown'
let osControl = null
let removeOsNotification = null

const actionHandlers = new Map()

function clamp(value, min, max) {
  const n = Number(value)
  if (!Number.isFinite(n)) return min
  return Math.max(min, Math.min(max, n))
}

function getStorePath() {
  if (!storePath) storePath = path.join(app.getPath('userData'), STORE_FILE)
  return storePath
}

function load() {
  try {
    const file = getStorePath()
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'))
      if (data.config && typeof data.config === 'object') {
        config = { ...DEFAULT_CONFIG, ...data.config, bySource: { ...(data.config.bySource || {}) } }
      }
      if (Array.isArray(data.items)) {
        items = data.items.filter((n) => n && typeof n === 'object')
        nextId = items.reduce((max, n) => Math.max(max, Number(n.id) || 0), 0) + 1
      }
    }
  } catch (e) {
    console.error('[notifications] load error:', e.message)
  }
}

function save() {
  try {
    const dir = path.dirname(getStorePath())
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(getStorePath(), JSON.stringify({ config, items: items.slice(0, config.maxHistory) }))
  } catch (e) {
    console.error('[notifications] save error:', e.message)
  }
}

function getState() {
  return { items, unreadCount: items.filter((n) => !n.read).length, config, osAccessStatus }
}

function emitChanged() {
  if (broadcastRef) broadcastRef('notifications/changed', getState())
}

function sourceKey(notif) {
  if (notif.source === 'os') return `os:${(notif.appName || 'unknown').toLowerCase()}`
  return (notif.appName || notif.source || 'alpine').toLowerCase()
}

function registerSource(notif) {
  const key = sourceKey(notif)
  if (!config.bySource[key]) {
    config.bySource[key] = { enabled: true, label: notif.appName || notif.source || 'Alpine Shell' }
    save()
    if (broadcastRef) broadcastRef('notifications/config-changed', config)
  }
  return key
}

function sourceEnabled(key) {
  const entry = config.bySource[key]
  return !entry || entry.enabled !== false
}

function post(notif) {
  if (!notif) return null
  const key = registerSource(notif)
  if (!config.enabled || !sourceEnabled(key)) return null

  const entry = {
    id: nextId++,
    source: notif.source || 'alpine',
    appName: notif.appName || 'Alpine Shell',
    title: notif.title || '',
    body: notif.body || '',
    icon: notif.icon || null,
    timestamp: Date.now(),
    read: false,
    actions: Array.isArray(notif.actions) ? notif.actions.map((a) => ({ id: a.id, label: a.label, openPath: a.openPath, url: a.url })) : [],
    osId: notif.osId,
  }

  if (typeof notif.onAction === 'function') actionHandlers.set(entry.id, notif.onAction)

  items.unshift(entry)
  if (items.length > config.maxHistory) {
    for (const dropped of items.slice(config.maxHistory)) actionHandlers.delete(dropped.id)
    items = items.slice(0, config.maxHistory)
  }
  save()

  if (!config.doNotDisturb && broadcastRef) broadcastRef('notifications/posted', entry)
  emitChanged()
  return entry
}

function runAction(id, actionId) {
  const entry = items.find((n) => n.id === id)
  const cb = actionHandlers.get(id)
  if (cb) {
    try { cb(actionId) } catch (e) { console.error('[notifications] action error:', e.message) }
    return
  }
  const action = entry && entry.actions ? entry.actions.find((a) => a.id === actionId) : null
  if (!action) return
  try {
    if (action.openPath) shell.openPath(action.openPath)
    else if (action.url) shell.openExternal(action.url)
  } catch (e) {
    console.error('[notifications] action error:', e.message)
  }
}

function dismiss(id) {
  const entry = items.find((n) => n.id === id)
  items = items.filter((n) => n.id !== id)
  actionHandlers.delete(id)
  if (entry && entry.source === 'os' && entry.osId != null && removeOsNotification) {
    try { removeOsNotification(entry.osId) } catch (e) { console.error('[notifications] os dismiss error:', e.message) }
  }
  save()
  emitChanged()
}

function clearAll() {
  for (const n of items) {
    if (n.source === 'os' && n.osId != null && removeOsNotification) {
      try { removeOsNotification(n.osId) } catch (e) { console.error('[notifications] os dismiss error:', e.message) }
    }
  }
  items = []
  actionHandlers.clear()
  save()
  emitChanged()
}

function markAllRead() {
  let changed = false
  for (const n of items) {
    if (!n.read) { n.read = true; changed = true }
  }
  if (changed) { save(); emitChanged() }
}

function setConfig(partial) {
  if (!partial || typeof partial !== 'object') return config
  const merged = { ...config, ...partial }
  if (partial.bySource) merged.bySource = { ...config.bySource, ...partial.bySource }
  if (typeof partial.enabled === 'boolean') merged.enabled = partial.enabled
  if (typeof partial.doNotDisturb === 'boolean') merged.doNotDisturb = partial.doNotDisturb
  if (typeof partial.groupBySource === 'boolean') merged.groupBySource = partial.groupBySource
  if (typeof partial.captureOsToasts === 'boolean') merged.captureOsToasts = partial.captureOsToasts
  if (!POSITIONS.has(merged.position)) merged.position = DEFAULT_CONFIG.position
  merged.defaultDuration = clamp(merged.defaultDuration, 1500, 30000)
  merged.maxHistory = clamp(merged.maxHistory, 10, 200)

  const captureChanged = config.captureOsToasts !== merged.captureOsToasts
  config = merged
  save()
  if (broadcastRef) broadcastRef('notifications/config-changed', config)

  if (items.length > config.maxHistory) {
    items = items.slice(0, config.maxHistory)
    emitChanged()
  }

  if (captureChanged && osControl) {
    try {
      if (config.captureOsToasts) osControl.start()
      else osControl.stop()
    } catch (e) {
      console.error('[notifications] os control error:', e.message)
    }
  }
  return config
}

function getConfig() {
  return config
}

function setOsControl(control) {
  osControl = control
}

function setRemoveOsNotification(fn) {
  removeOsNotification = typeof fn === 'function' ? fn : null
}

function setOsAccessStatus(status) {
  if (osAccessStatus === status) return
  osAccessStatus = status
  emitChanged()
}

module.exports = {
  handlers: {
    'notifications/get-state': () => getState(),
    'notifications/emit': (_event, notif) => post(notif),
    'notifications/dismiss': (_event, id) => { dismiss(id); return getState() },
    'notifications/clear-all': () => { clearAll(); return getState() },
    'notifications/mark-all-read': () => { markAllRead(); return getState() },
    'notifications/run-action': (_event, payload) => {
      if (payload) runAction(payload.id, payload.actionId)
      return getState()
    },
    'notifications/config-get': () => config,
    'notifications/config-set': (_event, partial) => setConfig(partial),
    'notifications/set-dnd': (_event, value) => setConfig({ doNotDisturb: !!value }),
    'notifications/os-access-status': () => osAccessStatus,
    'notifications/open-os-access-settings': () => {
      try { shell.openExternal('ms-settings:privacy-notifications') } catch (e) { console.error('[notifications] open settings error:', e.message) }
    },
  },

  start(broadcast) {
    broadcastRef = broadcast
    load()
  },

  post,
  getConfig,
  setOsControl,
  setRemoveOsNotification,
  setOsAccessStatus,
}
