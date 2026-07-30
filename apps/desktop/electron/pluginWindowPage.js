const path = require('path')

function relativeInsidePlugin(value, extensionPattern) {
  if (typeof value !== 'string' || !value) return null
  if (/^[a-z-]+:/i.test(value)) return null
  const normalized = value.replace(/\\/g, '/').replace(/^\/+/, '')
  if (!normalized || normalized.split('/').includes('..')) return null
  if (!extensionPattern.test(normalized)) return null
  return normalized
}

function pageUrl(pluginId, page) {
  const normalized = relativeInsidePlugin(page, /\.html?$/i)
  return normalized ? `alpine-plugin://${pluginId}/${normalized}` : null
}

function preloadPath(pluginDir, preload) {
  const normalized = relativeInsidePlugin(preload, /\.(c?js)$/i)
  if (!normalized || typeof pluginDir !== 'string' || !pluginDir) return null
  const base = path.resolve(pluginDir)
  const resolved = path.resolve(base, normalized)
  const withSeparator = base.endsWith(path.sep) ? base : base + path.sep
  return resolved.startsWith(withSeparator) ? resolved : null
}

module.exports = { pageUrl, preloadPath }
