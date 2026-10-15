import { settingsEntry, settingsPage } from '../../../settings/registry'
import {
  TOPBAR_ITEMS,
  TOPBAR_ITEM_SETTING_GATES,
  findTopbarItem,
  isTopbarItemGated,
  topbarItemLabel,
} from '../../topbar/layout/topbarLayout'
import { RIDGE_PRESENCE_NOTES, ridgeItemIsSample } from './ridgeSamples'

const RIDGE_ITEM_ENTRY_PREFIX = 'ridge-item-'

function pageLink(page: SettingsPageId, detail?: RidgeItemLink['detail']): RidgeItemLink {
  return { label: settingsPage(page)?.label ?? page, page, ...(detail ? { detail } : {}) }
}

function noNote(): null {
  return null
}

function presenceNote(id: TopbarItemId): RidgeItemDetail['note'] {
  return (data) => (ridgeItemIsSample(id, data) ? (RIDGE_PRESENCE_NOTES[id] ?? null) : null)
}

function trayIconCounts(data: RidgePreviewData): string | null {
  const { visible, overflow } = data.tray
  if (visible.length + overflow.length === 0) return null
  return `${visible.length} shown, ${overflow.length} hidden`
}

export const RIDGE_ITEM_DETAILS: Record<TopbarItemId, RidgeItemDetail> = {
  'system-menu': { entries: ['power-confirm', 'power-show-hibernate'], links: [], note: noNote },
  desktops: { entries: [], links: [], note: noNote },
  'plugins-left': { entries: [], links: [pageLink('plugins')], note: presenceNote('plugins-left') },
  notice: { entries: [], links: [], note: presenceNote('notice') },
  launcher: { entries: ['launcher-hotkey'], links: [pageLink('search')], note: noNote },
  tray: {
    entries: ['tray-all-monitors', 'tray-overflow'],
    links: [pageLink('tray-icons', trayIconCounts)],
    note: presenceNote('tray'),
  },
  media: { entries: ['media-visualizer'], links: [], note: presenceNote('media') },
  microphone: { entries: [], links: [], note: presenceNote('microphone') },
  status: { entries: [], links: [pageLink('wifi'), pageLink('bluetooth'), pageLink('battery')], note: noNote },
  'plugins-right': { entries: [], links: [pageLink('plugins')], note: presenceNote('plugins-right') },
  clock: { entries: ['clock-time-format', 'calendar-days', 'calendar-show-tasks'], links: [], note: noNote },
}

export function ridgeItemSearchEntryId(id: TopbarItemId): string {
  return isTopbarItemGated(id) ? TOPBAR_ITEM_SETTING_GATES[id] : `${RIDGE_ITEM_ENTRY_PREFIX}${id}`
}

function calloutHoldsSetting(id: TopbarItemId, settingId: string): boolean {
  return ridgeItemSearchEntryId(id) === settingId || RIDGE_ITEM_DETAILS[id].entries.includes(settingId)
}

export function ridgeItemForSetting(settingId: string): TopbarItemId | null {
  return TOPBAR_ITEMS.find((item) => calloutHoldsSetting(item.id, settingId))?.id ?? null
}

export function ridgeItemEntries(id: TopbarItemId): SettingsEntry[] {
  return RIDGE_ITEM_DETAILS[id].entries
    .map((entryId) => settingsEntry(entryId))
    .filter((entry): entry is SettingsEntry => entry !== null)
}

export function ridgePluginGroupWidgets(id: TopbarItemId, data: RidgePreviewData): RidgePluginWidget[] | null {
  const definition = findTopbarItem(id)
  if (!definition || definition.kind !== 'plugin-group' || definition.slot === 'center') return null
  return data.plugins[definition.slot]
}

export function ridgePluginSettingGroups(id: TopbarItemId, data: RidgePreviewData): PluginSettingGroup[] {
  const groups: PluginSettingGroup[] = []
  for (const widget of ridgePluginGroupWidgets(id, data) ?? []) {
    if (widget.pluginSettings.length === 0 || groups.some((group) => group.pluginId === widget.pluginId)) continue
    groups.push({ pluginId: widget.pluginId, pluginName: widget.pluginName, settings: widget.pluginSettings })
  }
  return groups
}

function uniquePluginNames(widgets: RidgePluginWidget[]): string[] {
  return [...new Set(widgets.map((widget) => widget.pluginName))]
}

export function ridgeItemTitle(id: TopbarItemId, data: RidgePreviewData): string {
  const names = uniquePluginNames(ridgePluginGroupWidgets(id, data) ?? [])
  return names.length > 0 ? names.join(', ') : topbarItemLabel(id)
}

export function ridgeItemPluginIcon(id: TopbarItemId, data: RidgePreviewData): string | null {
  return ridgePluginGroupWidgets(id, data)?.find((widget) => widget.pluginIcon !== null)?.pluginIcon ?? null
}

export function ridgeCanAddItem(id: TopbarItemId, data: RidgePreviewData): boolean {
  const widgets = ridgePluginGroupWidgets(id, data)
  return widgets === null || widgets.length > 0
}

export function ridgeDrawsItem(id: TopbarItemId, liveWidgetCounts: Record<RidgePluginSlot, number>): boolean {
  const definition = findTopbarItem(id)
  if (!definition || definition.kind !== 'plugin-group' || definition.slot === 'center') return true
  return liveWidgetCounts[definition.slot] > 0
}
