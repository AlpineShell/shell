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

function fileInsidePlugin(pluginDir, value, extensionPattern) {
  const normalized = relativeInsidePlugin(value, extensionPattern)
  if (!normalized || typeof pluginDir !== 'string' || !pluginDir) return null
  const base = path.resolve(pluginDir)
  const resolved = path.resolve(base, normalized)
  const withSeparator = base.endsWith(path.sep) ? base : base + path.sep
  return resolved.startsWith(withSeparator) ? resolved : null
}

function preloadPath(pluginDir, preload) {
  return fileInsidePlugin(pluginDir, preload, /\.(c?js)$/i)
}

function iconPath(pluginDir, icon) {
  return fileInsidePlugin(pluginDir, icon, /\.(ico|png)$/i)
}

module.exports = { pageUrl, preloadPath, iconPath }
