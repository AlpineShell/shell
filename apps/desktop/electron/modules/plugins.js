const { app, shell } = require('electron')
const path = require('path')
const fs = require('fs')

const PLUGINS_DIR_NAME = 'plugins'
const STATE_FILE_NAME = 'pluginState.json'
const MANIFEST_FILE = 'plugin.json'
const DEFAULT_ENTRY = 'index.js'
const SAFE_ID = /^[a-z0-9][a-z0-9._-]*$/

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

const capabilities = new Map()

function registerPluginCapability(channel, getter) {
  capabilities.set(channel, getter)
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
  try {
    const manifestPath = path.join(baseDir, folder, MANIFEST_FILE)
    if (!fs.existsSync(manifestPath)) return null
    const data = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    const name = typeof data.name === 'string' && data.name ? data.name : folder
    const entry = typeof data.entry === 'string' && data.entry ? data.entry : DEFAULT_ENTRY
    return { id: folder, name, entry, preset }
  } catch (e) {
    console.error(`[plugins] manifest parse error in "${folder}":`, e.message)
    return null
  }
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
  for (const manifest of scanDir(getPresetPluginsDir(), true)) byId.set(manifest.id, manifest)
  for (const manifest of scanDir(getPluginsDir(), false)) byId.set(manifest.id, manifest)
  return [...byId.values()].map((manifest) => ({ ...manifest, enabled: !disabled.has(manifest.id) }))
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
  if (broadcast) broadcast('plugins/reload')
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
      if (broadcast) broadcast('plugins/reload')
      return true
    },
    'plugins/set-enabled': (_event, payload) => setEnabled(payload && payload.id, !!(payload && payload.enabled)),
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
  mimeFor,
}
