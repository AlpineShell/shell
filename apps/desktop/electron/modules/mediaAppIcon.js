const iconCache = new Map()

async function getAppIcon(appId) {
  if (!appId) return null
  if (iconCache.has(appId)) return iconCache.get(appId)
  let b64 = null
  try {
    const appIcons = require('./appIcons')
    const [url] = await appIcons.resolveAppIcons([appId])
    if (url) b64 = url.replace(/^data:image\/png;base64,/, '')
  } catch {}
  iconCache.set(appId, b64)
  return b64
}

module.exports = { getAppIcon }
