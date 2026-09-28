const { app, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const { parseManifest } = require('../pluginManifest')
const marketplace = require('../pluginMarketplace')
const { loadLicenceConfig } = require('../licenceConfig')

const PLUGINS_DIR_NAME = 'plugins'
const STATE_FILE_NAME = 'pluginState.json'
const MANIFEST_FILE = 'plugin.json'
const DEFAULT_ENTRY = 'index.js'
const SAFE_ID = /^[a-z0-9][a-z0-9._-]*$/
const MARKETPLACE_SITE_BASE = loadLicenceConfig().websiteBase

const MIME_BY_EXTENSION = {
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.html': 'text/html',
}

let pluginsDir = null
let broadcast = null
let disabledIds = null
let pluginStopper = (_id, work) => work()

const capabilities = new Map()
const changeListeners = new Set()

function registerPluginCapability(channel, getter) {
  capabilities.set(channel, getter)
}

function unregisterPluginCapability(channel) {
  capabilities.delete(channel)
}

function setPluginStopper(stopper) {
  if (typeof stopper === 'function') pluginStopper = stopper
}

function onPluginsChanged(listener) {
  if (typeof listener === 'function') changeListeners.add(listener)
  return () => changeListeners.delete(listener)
}

function notifyPluginsChanged() {
  for (const listener of changeListeners) {
    try {
      listener()
    } catch (e) {
      console.error('[plugins] change listener error:', e && e.message)
    }
  }
}

function triggerReload() {
  if (broadcast) broadcast('plugins/reload')
  notifyPluginsChanged()
}

function getPluginsDir() {
  if (!pluginsDir) pluginsDir = path.join(app.getPath('userData'), PLUGINS_DIR_NAME)
  return pluginsDir
}

function getPresetPluginsDir() {
  return app.isPackaged
    ? path.join(process.resourcesPath, PLUGINS_DIR_NAME)
    : path.join(__dirname, '..', '..', 'presets', 'plugins')
}

function statePath() {
  return path.join(app.getPath('userData'), STATE_FILE_NAME)
}

function loadDisabledIds() {
  if (disabledIds) return disabledIds
  disabledIds = new Set()
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath(), 'utf8'))
    if (Array.isArray(parsed.disabled)) for (const id of parsed.disabled) disabledIds.add(id)
  } catch (e) {
    if (e.code !== 'ENOENT') console.error('[plugins] state read error:', e.message)
  }
  return disabledIds
}

function writeDisabledIds() {
  const tmp = statePath() + '.tmp'
  try {
    fs.writeFileSync(tmp, JSON.stringify({ disabled: [...loadDisabledIds()] }))
    fs.renameSync(tmp, statePath())
  } catch (e) {
    console.error('[plugins] state write error:', e.message)
  }
}

function ensurePluginsDir() {
  try {
    fs.mkdirSync(getPluginsDir(), { recursive: true })
  } catch (e) {
    console.error('[plugins] mkdir error:', e.message)
  }
}

function readManifest(baseDir, folder, preset) {
  const dir = path.join(baseDir, folder)
  if (!fs.existsSync(path.join(dir, MANIFEST_FILE))) return null
  const { record } = parseManifest(dir, folder, { preset, appVersion: app.getVersion() })
  if (record.errors && record.errors.length) {
    console.error(`[plugins] "${folder}" manifest issues:`, record.errors.join('; '))
  }
  return record
}

function scanDir(baseDir, preset) {
  let entries = []
  try {
    entries = fs.readdirSync(baseDir, { withFileTypes: true })
  } catch (e) {
    if (e.code !== 'ENOENT') console.error('[plugins] readdir error:', e.message)
    return []
  }
  const plugins = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (!SAFE_ID.test(entry.name)) continue
    const manifest = readManifest(baseDir, entry.name, preset)
    if (manifest) plugins.push(manifest)
  }
  return plugins
}

function listPlugins() {
  ensurePluginsDir()
  const disabled = loadDisabledIds()
  const byId = new Map()
  for (const record of scanDir(getPresetPluginsDir(), true)) byId.set(record.id, record)
  for (const record of scanDir(getPluginsDir(), false)) byId.set(record.id, record)
  return [...byId.values()].map((record) => ({
    ...record,
    enabled: !disabled.has(record.id),
    loadable: record.valid && record.compat.apiOk && record.compat.engineOk,
  }))
}

function readPluginReadme(id) {
  const record = listPlugins().find((p) => p.id === id)
  if (!record || !record.marketplace || !record.marketplace.readme) return null
  const file = resolvePluginFile(id, record.marketplace.readme)
  if (!file) return null
  try {
    return fs.readFileSync(file, 'utf8')
  } catch {
    return null
  }
}

function resolveInBase(baseDir, id, relativePath) {
  let base
  try {
    base = fs.realpathSync(path.join(baseDir, id))
  } catch {
    return null
  }
  const target = path.resolve(base, relativePath)
  let real
  try {
    real = fs.realpathSync(target)
  } catch {
    return null
  }
  if (real !== base && !real.startsWith(base + path.sep)) return null
  return real
}

function resolvePluginFile(id, relativePath) {
  if (!SAFE_ID.test(id)) return null
  ensurePluginsDir()
  return resolveInBase(getPluginsDir(), id, relativePath) || resolveInBase(getPresetPluginsDir(), id, relativePath)
}

function setEnabled(id, enabled) {
  if (typeof id !== 'string' || !SAFE_ID.test(id)) return false
  const disabled = loadDisabledIds()
  if (enabled) disabled.delete(id)
  else disabled.add(id)
  writeDisabledIds()
  triggerReload()
  return true
}

function mimeFor(extension) {
  return MIME_BY_EXTENSION[extension] || null
}

module.exports = {
  handlers: {
    'plugins/list': () => listPlugins(),
    'plugins/dir': () => getPluginsDir(),
    'plugins/open-folder': () => {
      ensurePluginsDir()
      return shell.openPath(getPluginsDir())
    },
    'plugins/reload': () => {
      triggerReload()
      return true
    },
    'plugins/set-enabled': (_event, payload) => setEnabled(payload && payload.id, !!(payload && payload.enabled)),
    'plugins/manifest': (_event, id) => listPlugins().find((p) => p.id === id) || null,
    'plugins/readme': (_event, id) => readPluginReadme(id),
    'plugins/marketplace-base': () => marketplace.getBase(),
    'plugins/marketplace-list': () => marketplace.list(),
    'plugins/marketplace-detail': (_event, id) => marketplace.detail(id),
    'plugins/marketplace-install': (_event, payload) =>
      marketplace.install(payload, {
        pluginsDir: getPluginsDir(),
        onChange: () => triggerReload(),
        withPluginStopped: (id, work) => pluginStopper(id, work),
      }),
    'plugins/marketplace-uninstall': (_event, id) =>
      marketplace.uninstall(id, {
        pluginsDir: getPluginsDir(),
        onChange: () => triggerReload(),
        withPluginStopped: (pluginId, work) => pluginStopper(pluginId, work),
      }),
    'plugins/marketplace-open-web': (_event, id) => {
      if (typeof id !== 'string' || !SAFE_ID.test(id)) return false
      return shell.openExternal(`${MARKETPLACE_SITE_BASE}/plugins/${encodeURIComponent(id)}`)
    },
    'plugins/data-get': (_event, channel) => {
      const getter = capabilities.get(channel)
      return getter ? getter() : null
    },
  },

  start(b) {
    broadcast = b
    ensurePluginsDir()
  },

  getPluginsDir,
  getPresetPluginsDir,
  resolvePluginFile,
  registerPluginCapability,
  unregisterPluginCapability,
  onPluginsChanged,
  setPluginStopper,
  listPlugins,
  mimeFor,
}
