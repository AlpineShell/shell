export function pluginIdOfWidget(widgetId: string): string {
  return widgetId.split(':')[0]
}

function widgetErrorReport(pluginId: string, error: unknown): PluginWidgetErrorReport {
  if (error instanceof Error) return { id: pluginId, message: error.message || error.name, stack: error.stack }
  return { id: pluginId, message: String(error) }
}

export function reportPluginWidgetError(pluginId: string, error: unknown) {
  try {
    window.plugins.reportWidgetError(widgetErrorReport(pluginId, error)).catch(() => false)
  } catch (failure) {
    console.error(`[plugins] could not report the "${pluginId}" crash:`, failure)
  }
}
