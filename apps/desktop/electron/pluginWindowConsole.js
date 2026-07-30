const LEVEL_NAMES = ['verbose', 'info', 'warning', 'error']
const IGNORED = [/Electron Security Warning/i]

function consoleDetail(args) {
  const first = Array.isArray(args) ? args[0] : null
  if (first && typeof first === 'object' && typeof first.message === 'string') {
    return { level: first.level, message: first.message, line: first.lineNumber, source: first.sourceId }
  }
  if (Array.isArray(args) && typeof args[2] === 'string') {
    return { level: args[1], message: args[2], line: args[3], source: args[4] }
  }
  return null
}

function levelName(level) {
  if (typeof level === 'string' && level) return level
  return LEVEL_NAMES[level] || 'info'
}

function consoleReport(args) {
  const detail = consoleDetail(args)
  if (!detail || !detail.message) return null
  if (IGNORED.some((pattern) => pattern.test(detail.message))) return null
  const where = detail.source ? ` (${detail.source}:${detail.line})` : ''
  return `${levelName(detail.level)}: ${detail.message}${where}`
}

module.exports = { consoleReport }
