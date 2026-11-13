const fs = require('fs')
const path = require('path')
const { isValidPluginSettingValue } = require('@alpine/plugin-sdk')
const { pluginLogs } = require('../pluginLogStore')

const STORE_FILE = 'plugin-settings.json'
const CHANGED_CHANNEL = 'plugins/settings-changed'

let storePath = null
let storedByPlugin = null
let broadcastRef = null
const changeListeners = new Set()

function getStorePath() {
  if (!storePath) {
    const { app } = require('electron')
    storePath = path.join(app.getPath('userData'), STORE_FILE)
  }
  return storePath
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readStore() {
  try {
    const parsed = JSON.parse(fs.readFileSync(getStorePath(), 'utf8'))
    return isPlainObject(parsed) ? parsed : {}
  } catch (e) {
    if (e.code !== 'ENOENT') console.error('[pluginSettings] read error:', e.message)
    return {}
  }
}

function currentStore() {
  if (!storedByPlugin) storedByPlugin = readStore()
  return storedByPlugin
}

function storedValues(pluginId) {
  const values = currentStore()[pluginId]
  return isPlainObject(values) ? values : {}
}

function writeStore(next) {
  const file = getStorePath()
  const staging = `${file}.tmp`
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(staging, JSON.stringify(next, null, 2))
    fs.renameSync(staging, file)
    return true
  } catch (e) {
    console.error('[pluginSettings] write error:', e.message)
    return false
  }
}

function declaredSettings(pluginId) {
  const record = require('./plugins').listPlugins().find((plugin) => plugin.id === pluginId)
  const settings = record && record.contributes && record.contributes.settings
  return Array.isArray(settings) ? settings : []
}

function resolveValues(settings, stored) {
  return Object.fromEntries(
    settings.map((setting) => {
      const saved = stored[setting.key]
      return [setting.key, isValidPluginSettingValue(setting, saved) ? saved : setting.default]
    }),
  )
}

function getValues(pluginId) {
  if (typeof pluginId !== 'string' || !pluginId) return {}
  return resolveValues(declaredSettings(pluginId), storedValues(pluginId))
}

function notifyChanged(pluginId, values) {
  if (broadcastRef) broadcastRef(CHANGED_CHANNEL, { pluginId, values })
  for (const listener of changeListeners) {
    try {
      listener(pluginId, values)
    } catch (e) {
      console.error('[pluginSettings] change listener error:', e && e.message)
    }
  }
}

function settingValueText(value) {
  return typeof value === 'string' ? value : JSON.stringify(value)
}

function logChangedValue(pluginId, key, previous, value) {
  if (Object.is(previous, value)) return
  pluginLogs.add(pluginId, { source: 'settings', level: 'info', message: `${key} changed to ${settingValueText(value)}` })
}

function setValue(pluginId, key, value) {
  if (typeof pluginId !== 'string' || !pluginId) return { ok: false, error: 'No plugin was named.' }
  const settings = declaredSettings(pluginId)
  const setting = settings.find((candidate) => candidate.key === key)
  if (!setting) return { ok: false, error: 'This plugin has no such setting.' }
  if (!isValidPluginSettingValue(setting, value)) return { ok: false, error: 'That value is not one this setting takes.' }
  const previous = resolveValues(settings, storedValues(pluginId))[key]
  const pluginValues = { ...storedValues(pluginId), [key]: value }
  const next = { ...currentStore(), [pluginId]: pluginValues }
  if (!writeStore(next)) return { ok: false, error: 'Alpine could not save that setting.' }
  storedByPlugin = next
  const values = resolveValues(settings, pluginValues)
  logChangedValue(pluginId, key, previous, value)
  notifyChanged(pluginId, values)
  return { ok: true, values }
}

function onSettingsChanged(listener) {
  if (typeof listener !== 'function') return () => {}
  changeListeners.add(listener)
  return () => {
    changeListeners.delete(listener)
  }
}

module.exports = {
  handlers: {
    'plugins/settings-get': (_event, pluginId) => getValues(pluginId),
    'plugins/settings-set': (_event, payload) =>
      setValue(payload && payload.pluginId, payload && payload.key, payload && payload.value),
  },

  start(broadcast) {
    broadcastRef = broadcast
  },

  getValues,
  onSettingsChanged,
}
