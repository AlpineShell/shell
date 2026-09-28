const path = require('path')
const { fileURLToPath } = require('url')

const PLUGIN_PAGE_PROTOCOL = 'alpine-plugin:'
const PLUGIN_WINDOW_CHANNEL_PREFIX = 'plugin-window/'

function parseUrl(value) {
  if (typeof value !== 'string' || !value) return null
  try {
    return new URL(value)
  } catch {
    return null
  }
}

function comparablePath(filePath) {
  const resolved = path.resolve(filePath)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

function isAppIndexFile(url, indexPath) {
  if (typeof indexPath !== 'string' || !indexPath || url.protocol !== 'file:') return false
  try {
    return comparablePath(fileURLToPath(url)) === comparablePath(indexPath)
  } catch {
    return false
  }
}

function isDevServerPage(url, devServerUrl) {
  const devServer = parseUrl(devServerUrl)
  if (!devServer || devServer.origin === 'null') return false
  return url.origin === devServer.origin
}

function isAppPageUrl(value, appLocation) {
  const url = parseUrl(value)
  if (!url || !appLocation) return false
  return isAppIndexFile(url, appLocation.indexPath) || isDevServerPage(url, appLocation.devServerUrl)
}

function pluginIdOfPageUrl(value) {
  const url = parseUrl(value)
  if (!url || url.protocol !== PLUGIN_PAGE_PROTOCOL) return null
  return url.hostname || null
}

function isShellPageUrl(value, appLocation) {
  return isAppPageUrl(value, appLocation) || pluginIdOfPageUrl(value) !== null
}

function mayNavigate(fromUrl, toUrl, appLocation) {
  if (isAppPageUrl(fromUrl, appLocation)) return isAppPageUrl(toUrl, appLocation)
  const pluginId = pluginIdOfPageUrl(fromUrl)
  return pluginId !== null && pluginIdOfPageUrl(toUrl) === pluginId
}

function isBrowserLink(value) {
  const url = parseUrl(value)
  return Boolean(url) && url.protocol === 'https:' && Boolean(url.hostname)
}

function isPluginWindowChannel(channel) {
  return typeof channel === 'string' && channel.startsWith(PLUGIN_WINDOW_CHANNEL_PREFIX)
}

function acceptsIpcSender(channel, senderUrl, appLocation) {
  if (isPluginWindowChannel(channel)) return pluginIdOfPageUrl(senderUrl) !== null
  return isAppPageUrl(senderUrl, appLocation)
}

module.exports = {
  isAppPageUrl,
  pluginIdOfPageUrl,
  isShellPageUrl,
  mayNavigate,
  isBrowserLink,
  acceptsIpcSender,
}
