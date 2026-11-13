const MAX_LINES_PER_PLUGIN = 200
const MAX_MESSAGE_LENGTH = 4000
const LOG_SOURCES = new Set(['backend', 'widget', 'command', 'settings'])
const LOG_LEVELS = new Set(['info', 'error'])
const RUNTIME_ERROR_SUMMARIES = {
  backend: 'The backend stopped with an error.',
  widget: 'The widget stopped with an error.',
}

function isPluginId(value) {
  return typeof value === 'string' && value.length > 0
}

function messageText(message) {
  const text = typeof message === 'string' ? message : String(message)
  return text.length > MAX_MESSAGE_LENGTH ? `${text.slice(0, MAX_MESSAGE_LENGTH)}…` : text
}

function createPluginLogStore({ limit = MAX_LINES_PER_PLUGIN, now = Date.now } = {}) {
  const linesByPlugin = new Map()
  const runtimeErrors = new Map()
  const runtimeErrorListeners = new Set()

  function add(pluginId, { source, level, message }) {
    if (!isPluginId(pluginId) || !LOG_SOURCES.has(source) || !LOG_LEVELS.has(level)) return
    const lines = linesByPlugin.get(pluginId) || []
    lines.push({ at: now(), source, level, message: messageText(message) })
    if (lines.length > limit) lines.splice(0, lines.length - limit)
    linesByPlugin.set(pluginId, lines)
  }

  function list(pluginId) {
    return [...(linesByPlugin.get(pluginId) || [])]
  }

  function clear(pluginId) {
    linesByPlugin.delete(pluginId)
  }

  function notifyRuntimeError(pluginId, summary) {
    for (const listener of runtimeErrorListeners) {
      try {
        listener(pluginId, summary)
      } catch (e) {
        console.error('[pluginLogs] runtime error listener failed:', e && e.message)
      }
    }
  }

  function setRuntimeError(pluginId, summary) {
    if (!isPluginId(pluginId) || runtimeErrors.get(pluginId) === summary) return
    runtimeErrors.set(pluginId, summary)
    notifyRuntimeError(pluginId, summary)
  }

  function runtimeError(pluginId) {
    return runtimeErrors.get(pluginId) || null
  }

  function clearRuntimeError(pluginId) {
    runtimeErrors.delete(pluginId)
  }

  function clearAllRuntimeErrors() {
    runtimeErrors.clear()
  }

  function forget(pluginId) {
    clear(pluginId)
    clearRuntimeError(pluginId)
  }

  function onRuntimeError(listener) {
    if (typeof listener !== 'function') return () => {}
    runtimeErrorListeners.add(listener)
    return () => runtimeErrorListeners.delete(listener)
  }

  return { add, list, clear, setRuntimeError, runtimeError, clearRuntimeError, clearAllRuntimeErrors, forget, onRuntimeError }
}

function withRuntimeError(record, store) {
  return { ...record, runtimeError: store.runtimeError(record.id) }
}

const pluginLogs = createPluginLogStore()

module.exports = { MAX_LINES_PER_PLUGIN, RUNTIME_ERROR_SUMMARIES, createPluginLogStore, withRuntimeError, pluginLogs }
