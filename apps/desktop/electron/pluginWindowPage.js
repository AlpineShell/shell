function pageUrl(pluginId, page) {
  if (typeof page !== 'string' || !page) return null
  if (/^[a-z-]+:/i.test(page)) return null
  const normalized = page.replace(/\\/g, '/').replace(/^\/+/, '')
  if (!normalized || normalized.split('/').includes('..')) return null
  if (!/\.html?$/i.test(normalized)) return null
  return `alpine-plugin://${pluginId}/${normalized}`
}

module.exports = { pageUrl }
