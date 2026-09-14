import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  SETTINGS_PAGE_GROUP,
  SETTINGS_REGISTRY,
  isSettingsValueEntry,
  settingsEntry,
  settingsPage,
  settingsPageRoute,
} from '../../../settings/registry'
import {
  TOPBAR_ITEMS,
  TOPBAR_ITEM_SETTING_GATES,
  isTopbarItemGated,
  topbarItemLabel,
} from '../../topbar/layout/topbarLayout'
import RidgePage from '../ridgePage'
import { RIDGE_ITEM_DETAILS, ridgeItemSearchEntryId } from './ridgeItemCatalogue'

vi.mock('../../../hooks/useRidgePreviewData', async () => {
  const { liveRidgePreviewData } = await import('./ridgeTestFixtures')
  const previewData = liveRidgePreviewData()
  return { useRidgePreviewData: () => previewData }
})

vi.mock('../../../hooks/useRidgeEditor', async () => {
  const { EMPTY_TOPBAR_LAYOUT, resolveTopbarLayout } = await import('../../topbar/layout/topbarLayout')
  const items = resolveTopbarLayout(EMPTY_TOPBAR_LAYOUT)
  const settled = () => Promise.resolve(true)
  const editor: RidgeEditor = {
    layout: items,
    items,
    error: null,
    isDefault: true,
    commit: settled,
    move: settled,
    step: settled,
    show: settled,
    hide: settled,
    reset: settled,
  }
  return { useRidgeEditor: () => editor }
})

vi.mock('../../../hooks/useRidgeLivePlugins', () => ({ useRidgeLivePlugins: () => {} }))

vi.mock('./ridgeCanvas', () => ({ default: () => null }))

vi.mock('./ridgeColorSection', () => ({ default: () => null }))

const RESET_ENTRY = 'ridge-layout-reset'

const PAGE_LEVEL_ENTRIES = ['ridge', 'tray']

const COLOR_SECTION_GROUP = 'Color'

const COLOR_SECTION_IDS = ['topbar-adapt-to-apps', 'topbar-color', 'topbar-color-automatic']

const RIDGE_ENTRIES = SETTINGS_REGISTRY.filter((entry) => entry.page === 'ridge')

const RIDGE_VALUE_IDS = RIDGE_ENTRIES.filter(isSettingsValueEntry).map((entry) => entry.id)

const GATE_IDS: string[] = Object.values(TOPBAR_ITEM_SETTING_GATES)

const OUTSIDE_THE_CALLOUTS = [...GATE_IDS, ...COLOR_SECTION_IDS]

const CALLOUT_ENTRY_IDS = TOPBAR_ITEMS.flatMap((item) => RIDGE_ITEM_DETAILS[item.id].entries)

const UNGATED_ITEMS = TOPBAR_ITEMS.filter((item) => !isTopbarItemGated(item.id))

function calloutsListing(id: string): number {
  return CALLOUT_ENTRY_IDS.filter((listed) => listed === id).length
}

describe('the settings filed on Ridge', () => {
  it('lists every value setting on Ridge in exactly one callout, apart from the two gates and the Color section', () => {
    const listed = RIDGE_VALUE_IDS.filter((id) => !OUTSIDE_THE_CALLOUTS.includes(id))
    expect(listed.length).toBeGreaterThan(0)
    for (const id of listed) expect(calloutsListing(id), id).toBe(1)
  })

  it('leaves out of the callouts exactly the gates that show the Search button and the tray, and the Color section', () => {
    expect(RIDGE_VALUE_IDS.filter((id) => calloutsListing(id) === 0).sort()).toEqual([...OUTSIDE_THE_CALLOUTS].sort())
    for (const id of GATE_IDS) expect(settingsEntry(id)?.page).toBe('ridge')
  })

  it('files the Color section settings on Ridge under Color', () => {
    const colorIds = RIDGE_ENTRIES.filter((entry) => entry.group === COLOR_SECTION_GROUP).map((entry) => entry.id)
    expect(colorIds.sort()).toEqual(COLOR_SECTION_IDS)
  })

  it('files on Ridge one entry per item without a gate, beside its page, the tray submenu and Reset', () => {
    const panelIds = RIDGE_ENTRIES.filter((entry) => !isSettingsValueEntry(entry)).map((entry) => entry.id)
    const itemIds = UNGATED_ITEMS.map((item) => ridgeItemSearchEntryId(item.id))
    expect(panelIds.sort()).toEqual([...itemIds, ...PAGE_LEVEL_ENTRIES, RESET_ENTRY].sort())
  })

  it('files the Ridge page entry and the tray submenu as page-level entries', () => {
    const pageLevel = RIDGE_ENTRIES.filter((entry) => entry.group === SETTINGS_PAGE_GROUP).map((entry) => entry.id)
    expect(pageLevel.sort()).toEqual([...PAGE_LEVEL_ENTRIES].sort())
  })

  it.each(UNGATED_ITEMS)('names the $id entry after the item and sends it to Ridge', ({ id }) => {
    const entry = settingsEntry(ridgeItemSearchEntryId(id))
    expect(entry?.label).toBe(`${topbarItemLabel(id)} on Ridge`)
    expect(entry?.control).toEqual({ kind: 'navigate', path: settingsPageRoute('ridge') })
  })
})

describe('the Ridge page', () => {
  it('heads itself with the name the registry gives Ridge', () => {
    render(<RidgePage onNavigate={() => {}} />)
    expect(settingsPage('ridge')?.label).toBe('Ridge')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(settingsPage('ridge')?.label)
  })
})
