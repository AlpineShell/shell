const { guardHandlers, SETTINGS_WINDOW } = require('../trustedSenders')
const { pluginLogs, RUNTIME_ERROR_SUMMARIES } = require('../pluginLogStore')

const PLUGIN_ID = /^[a-z0-9][a-z0-9._-]*$/
const STACK_LINES_KEPT = 3
const RUNTIME_ERROR_CHANNEL = 'plugins/runtime-error'
const UNKNOWN_ERROR = 'Unknown error'

function isPluginId(value) {
  return typeof value === 'string' && PLUGIN_ID.test(value)
}

function firstStackFrames(stack) {
  if (typeof stack !== 'string') return []
  return stack
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('at '))
    .slice(0, STACK_LINES_KEPT)
}

function widgetErrorText(report) {
  const message = typeof report.message === 'string' && report.message ? report.message : UNKNOWN_ERROR
  return [message, ...firstStackFrames(report.stack)].join('\n')
}

function reportWidgetError(report) {
  if (!report || typeof report !== 'object' || !isPluginId(report.id)) return false
  pluginLogs.add(report.id, { source: 'widget', level: 'error', message: widgetErrorText(report) })
  pluginLogs.setRuntimeError(report.id, RUNTIME_ERROR_SUMMARIES.widget)
  return true
}

function linesOf(id) {
  return isPluginId(id) ? pluginLogs.list(id) : []
}

function clearLinesOf(id) {
  if (isPluginId(id)) pluginLogs.clear(id)
}

module.exports = {
  handlers: {
    'plugins/report-widget-error': (_event, report) => reportWidgetError(report),
    ...guardHandlers({
      'plugins/logs': (_event, id) => linesOf(id),
      'plugins/clear-logs': (_event, id) => clearLinesOf(id),
    }, [SETTINGS_WINDOW]),
  },

  start(broadcast) {
    pluginLogs.onRuntimeError((id) => broadcast(RUNTIME_ERROR_CHANNEL, { id }))
  },
}
