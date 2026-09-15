import { pluginLogoUrl } from '../../../plugins/pluginAssets'
import { pluginSettingDeclarations } from '../../../plugins/pluginSettingsPages'

const DEFAULT_WIDGET_SLOT = 'right'
const DEFAULT_WIDGET_ORDER = 0
const DEFAULT_WIDGET_EXPORT = 'default'

function loadsOnTheBar(record: PluginRecord): boolean {
  return record.enabled !== false && record.loadable !== false
}

function isManifestEntry(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function manifestTopbarWidgets(record: PluginRecord): Record<string, unknown>[] {
  const widgets = record.contributes?.topbarWidgets
  return Array.isArray(widgets) ? widgets.filter(isManifestEntry) : []
}

function widgetSlot(widget: Record<string, unknown>): string {
  return typeof widget.slot === 'string' && widget.slot ? widget.slot : DEFAULT_WIDGET_SLOT
}

function widgetOrder(widget: Record<string, unknown>): number {
  return typeof widget.order === 'number' ? widget.order : DEFAULT_WIDGET_ORDER
}

function widgetId(record: PluginRecord, widget: Record<string, unknown>): string {
  const exportName = typeof widget.export === 'string' && widget.export ? widget.export : DEFAULT_WIDGET_EXPORT
  return `${record.id}:${exportName}`
}

function isRidgePluginSlot(slot: string): slot is RidgePluginSlot {
  return slot === 'left' || slot === 'right'
}

function registerPlaceholder(byId: Map<string, RidgePluginWidget>, record: PluginRecord, widget: Record<string, unknown>) {
  const id = widgetId(record, widget)
  const slot = widgetSlot(widget)
  byId.delete(id)
  if (isRidgePluginSlot(slot)) {
    byId.set(id, {
      id,
      pluginId: record.id,
      pluginName: record.name,
      pluginIcon: pluginLogoUrl(record),
      pluginSettings: pluginSettingDeclarations(record),
      slot,
      order: widgetOrder(widget),
    })
  }
}

function registeredPlaceholders(records: PluginRecord[]): RidgePluginWidget[] {
  const byId = new Map<string, RidgePluginWidget>()
  for (const record of records.filter(loadsOnTheBar)) {
    for (const widget of manifestTopbarWidgets(record)) registerPlaceholder(byId, record, widget)
  }
  return [...byId.values()]
}

export function pluginWidgetPlaceholders(records: PluginRecord[], slot: RidgePluginSlot): RidgePluginWidget[] {
  return registeredPlaceholders(records)
    .filter((widget) => widget.slot === slot)
    .sort((a, b) => a.order - b.order)
}
