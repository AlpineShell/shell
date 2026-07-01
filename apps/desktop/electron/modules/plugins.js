const { app, shell } = require('electron')
const path = require('path')
const fs = require('fs')

const PLUGINS_DIR_NAME = 'plugins'
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

function getPluginsDir() {
  if (!pluginsDir) pluginsDir = path.join(app.getPath('userData'), PLUGINS_DIR_NAME)
  return pluginsDir
}

function ensurePluginsDir() {
  try {
    fs.mkdirSync(getPluginsDir(), { recursive: true })
  } catch (e) {
    console.error('[plugins] mkdir error:', e.message)
  }
}

function readManifest(folder) {
  try {
    const manifestPath = path.join(getPluginsDir(), folder, MANIFEST_FILE)
    if (!fs.existsSync(manifestPath)) return null
    const data = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    const name = typeof data.name === 'string' && data.name ? data.name : folder
    const entry = typeof data.entry === 'string' && data.entry ? data.entry : DEFAULT_ENTRY
    return { id: folder, name, entry }
  } catch (e) {
    console.error(`[plugins] manifest parse error in "${folder}":`, e.message)
    return null
  }
}

function listPlugins() {
  ensurePluginsDir()
  let entries = []
  try {
    entries = fs.readdirSync(getPluginsDir(), { withFileTypes: true })
  } catch (e) {
    console.error('[plugins] readdir error:', e.message)
    return []
  }
  const plugins = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (!SAFE_ID.test(entry.name)) continue
    const manifest = readManifest(entry.name)
    if (manifest) plugins.push(manifest)
  }
  return plugins
}

function resolvePluginFile(id, relativePath) {
  if (!SAFE_ID.test(id)) return null
  ensurePluginsDir()
  let base
  try {
    base = fs.realpathSync(path.join(getPluginsDir(), id))
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
  },

  start(b) {
    broadcast = b
    ensurePluginsDir()
  },

  getPluginsDir,
  resolvePluginFile,
  mimeFor,
}
