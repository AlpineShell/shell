import { settingsEntry, settingsPage } from '../../../settings/registry'
import { TOPBAR_ITEMS, TOPBAR_ITEM_SETTING_GATES, findTopbarItem } from '../../topbar/layout/topbarLayout'
import { RIDGE_PRESENCE_NOTES, ridgeItemIsSample } from './ridgeSamples'
import { isRidgeGatedItem } from './ridgeVisibility'

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

function systemTimeFormatLabel(prefs: ClockPrefs): string {
  return prefs.systemTimeFormat === '12h' ? '12-hour' : '24-hour'
}

function followingWindowsNote(data: RidgePreviewData): string | null {
  const { prefs } = data.clock
  return prefs.timeFormat === 'auto' ? `Following Windows (${systemTimeFormatLabel(prefs)}).` : null
}

function trayIconCounts(data: RidgePreviewData): string | null {
  const { visible, overflow } = data.tray
  if (visible.length + overflow.length === 0) return null
  return `${visible.length} shown, ${overflow.length} hidden`
}

export const RIDGE_ITEM_DETAILS: Record<TopbarItemId, RidgeItemDetail> = {
  'system-menu': { entries: ['power-confirm'], links: [], note: noNote },
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
  clock: { entries: ['clock-time-format'], links: [pageLink('calendar')], note: followingWindowsNote },
}

export function ridgeItemTitle(id: TopbarItemId): string {
  return findTopbarItem(id)?.label ?? id
}

export function ridgeItemSearchEntryId(id: TopbarItemId): string {
  return isRidgeGatedItem(id) ? TOPBAR_ITEM_SETTING_GATES[id] : `${RIDGE_ITEM_ENTRY_PREFIX}${id}`
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
