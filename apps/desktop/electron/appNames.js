const knownApps = require('./knownApps')

function exeBaseName(exePath, processName) {
  if (exePath) {
    const segment = String(exePath).split(/[\\/]/).pop()
    if (segment) return segment.toLowerCase()
  }
  if (processName) return `${String(processName).toLowerCase()}.exe`
  return null
}

function friendlyAppName({ path, description, processName } = {}) {
  const base = exeBaseName(path, processName)
  const known = base ? knownApps[base] : null
  if (known && known.category !== 'system') return known.name
  const desc = (description || '').trim()
  if (desc && !/^ms-resource:/i.test(desc)) return desc
  const name = (processName || '').trim()
  if (name) return name
  return base ? base.replace(/\.exe$/i, '') : 'Unknown app'
}

module.exports = { friendlyAppName }
