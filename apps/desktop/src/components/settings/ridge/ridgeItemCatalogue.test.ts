import { afterEach, describe, expect, it, vi } from 'vitest'
import { SETTINGS_REGISTRY, settingsEntry, settingsPage, settingsPageRoute } from '../../../settings/registry'
import { TOPBAR_ITEMS, topbarItemLabel } from '../../topbar/layout/topbarLayout'
import {
  RIDGE_ITEM_DETAILS,
  ridgeCanAddItem,
  ridgeDrawsItem,
  ridgeItemEntries,
  ridgeItemForSetting,
  ridgeItemPluginIcon,
  ridgeItemSearchEntryId,
  ridgeItemTitle,
  ridgePluginGroupWidgets,
} from './ridgeItemCatalogue'
import { absentRidgePreviewData, liveRidgePreviewData, ridgePluginWidget, ridgeTrayIcon } from './ridgeTestFixtures'

const REGISTRY_MODULE = '../../../settings/registry'

const ITEM_IDS = TOPBAR_ITEMS.map((item) => item.id)

const LINKS = ITEM_IDS.flatMap((id) => RIDGE_ITEM_DETAILS[id].links)

const RADAR_LOGO = 'alpine-plugin://com.example.radar/logo.png'

function rightPluginsData(widgets: RidgePluginWidget[]): RidgePreviewData {
  const live = liveRidgePreviewData()
  return { ...live, plugins: { ...live.plugins, right: widgets } }
}

function trayData(shown: number, hidden: number): RidgePreviewData {
  const icons = Array.from({ length: shown + hidden }, (_, at) => ridgeTrayIcon(`icon-${at}`))
  return {
    ...liveRidgePreviewData(),
    tray: { visible: icons.slice(0, shown), overflow: icons.slice(shown), showOverflow: true },
  }
}

function trayIconsLink(): RidgeItemLink {
  const link = RIDGE_ITEM_DETAILS.tray.links.find((candidate) => candidate.page === 'tray-icons')
  if (!link) throw new Error('the System tray callout has no link to the tray icons')
  return link
}

function textACalloutReads(id: TopbarItemId, data: RidgePreviewData): string {
  const detail = RIDGE_ITEM_DETAILS[id]
  return [topbarItemLabel(id), ...detail.links.flatMap((link) => [link.label, link.detail?.(data) ?? ''])].join(' ')
}

afterEach(() => {
  vi.doUnmock(REGISTRY_MODULE)
  vi.resetModules()
})

describe('RIDGE_ITEM_DETAILS', () => {
  it('describes every item Ridge can hold', () => {
    expect(Object.keys(RIDGE_ITEM_DETAILS)).toEqual(expect.arrayContaining(ITEM_IDS))
  })

  it.each<[TopbarItemId, string[], SettingsPageId[]]>([
    ['system-menu', ['power-confirm', 'power-show-hibernate'], []],
    ['plugins-left', [], ['plugins']],
    ['launcher', ['launcher-hotkey'], ['search']],
    ['tray', ['tray-all-monitors', 'tray-overflow'], ['tray-icons']],
    ['media', ['media-visualizer'], []],
    ['microphone', [], []],
    ['status', [], ['wifi', 'bluetooth', 'battery']],
    ['plugins-right', [], ['plugins']],
    ['clock', ['clock-time-format', 'calendar-days', 'calendar-show-tasks'], []],
  ])('gives the %s callout its settings and its links', (id, entries, pages) => {
    expect(RIDGE_ITEM_DETAILS[id].entries).toEqual(entries)
    expect(RIDGE_ITEM_DETAILS[id].links.map((link) => link.page)).toEqual(pages)
  })

  it.each(LINKS.map((link) => [link.page]))('links to %s, a page the settings window has a route for', (page) => {
    expect(settingsPageRoute(page)).not.toBeNull()
  })

  it('names each link after the page it opens', () => {
    for (const link of LINKS) expect(link.label).toBe(settingsPage(link.page)?.label)
  })

  it('files each setting in one callout at most', () => {
    const entries = ITEM_IDS.flatMap((id) => RIDGE_ITEM_DETAILS[id].entries)
    expect(new Set(entries).size).toBe(entries.length)
  })

  it('never calls the bar the top bar in anything a callout reads', () => {
    for (const data of [liveRidgePreviewData(), absentRidgePreviewData()]) {
      for (const id of ITEM_IDS) expect(textACalloutReads(id, data)).not.toMatch(/top ?bar/i)
    }
  })
})

describe('the tray icons link', () => {
  it.each<[number, number, string | null]>([
    [2, 1, '2 shown, 1 hidden'],
    [0, 3, '0 shown, 3 hidden'],
    [4, 0, '4 shown, 0 hidden'],
    [0, 0, null],
  ])('counts %i shown and %i hidden icons as %s', (shown, hidden, counts) => {
    expect(trayIconsLink().detail?.(trayData(shown, hidden))).toBe(counts)
  })
})

describe('ridgeItemSearchEntryId', () => {
  it('finds the Search button and the tray through the flags that show them', () => {
    expect(ridgeItemSearchEntryId('launcher')).toBe('topbar-search-icon')
    expect(ridgeItemSearchEntryId('tray')).toBe('tray-enabled')
    expect(settingsEntry('topbar-search-icon')).not.toBeNull()
    expect(settingsEntry('tray-enabled')).not.toBeNull()
  })

  it.each<TopbarItemId>(['system-menu', 'plugins-left', 'media', 'microphone', 'status', 'plugins-right', 'clock'])(
    'gives %s a Ridge item entry of its own',
    (id) => {
      expect(ridgeItemSearchEntryId(id)).toBe(`ridge-item-${id}`)
    }
  )

  it('leaves no Ridge item entry in the registry without an item to open', () => {
    const itemEntries = SETTINGS_REGISTRY.filter((entry) => entry.id.startsWith('ridge-item-'))
    expect(itemEntries.filter((entry) => ridgeItemForSetting(entry.id) === null)).toEqual([])
  })
})

describe('ridgeItemForSetting', () => {
  it.each<[string, TopbarItemId]>([
    ['power-confirm', 'system-menu'],
    ['power-show-hibernate', 'system-menu'],
    ['launcher-hotkey', 'launcher'],
    ['topbar-search-icon', 'launcher'],
    ['tray-enabled', 'tray'],
    ['tray-all-monitors', 'tray'],
    ['tray-overflow', 'tray'],
    ['media-visualizer', 'media'],
    ['clock-time-format', 'clock'],
    ['ridge-item-clock', 'clock'],
    ['ridge-item-plugins-right', 'plugins-right'],
  ])('opens the callout that holds %s on %s', (settingId, id) => {
    expect(ridgeItemForSetting(settingId)).toBe(id)
  })

  it.each(['ridge-layout-reset', 'theme', 'ridge-item-', 'ridge-item-taskbar', ''])('opens no callout for %j', (settingId) => {
    expect(ridgeItemForSetting(settingId)).toBeNull()
  })

  it('finds every item again from its own search entry', () => {
    expect(ITEM_IDS.map((id) => ridgeItemForSetting(ridgeItemSearchEntryId(id)))).toEqual(ITEM_IDS)
  })
})

describe('ridgeItemEntries', () => {
  it('hands over the registry entries in the order the callout lists them', () => {
    const entries = ridgeItemEntries('tray')
    expect(entries.map((entry) => entry.id)).toEqual(['tray-all-monitors', 'tray-overflow'])
    expect(entries[0]).toBe(settingsEntry('tray-all-monitors'))
  })

  it('skips a setting the registry does not hold yet', async () => {
    vi.resetModules()
    vi.doMock(REGISTRY_MODULE, async (importOriginal) => {
      const registry = await importOriginal<typeof import('../../../settings/registry')>()
      return {
        ...registry,
        settingsEntry: (id: string) => (id === 'tray-overflow' ? null : registry.settingsEntry(id)),
      }
    })
    const catalogue = await import('./ridgeItemCatalogue')
    expect(catalogue.ridgeItemEntries('tray').map((entry) => entry.id)).toEqual(['tray-all-monitors'])
  })
})

describe('ridgePluginGroupWidgets', () => {
  it('hands each plugin group the widgets on its own side', () => {
    const data = liveRidgePreviewData()
    expect(ridgePluginGroupWidgets('plugins-left', data)).toBe(data.plugins.left)
    expect(ridgePluginGroupWidgets('plugins-right', data)).toBe(data.plugins.right)
  })

  it.each<TopbarItemId>(['clock', 'tray', 'launcher'])('has no widgets for %s, which is not a plugin group', (id) => {
    expect(ridgePluginGroupWidgets(id, liveRidgePreviewData())).toBeNull()
  })
})

describe('ridgeItemTitle', () => {
  it('names a plugin group after the plugins on its side', () => {
    const data = liveRidgePreviewData()
    expect(ridgeItemTitle('plugins-left', data)).toBe('Weather')
    expect(ridgeItemTitle('plugins-right', data)).toBe('Notes')
  })

  it('names each plugin once, in the order their widgets sit', () => {
    const radar = ridgePluginWidget('right', 'Radar')
    const secondRadar = { ...radar, id: `${radar.pluginId}:Rain` }
    const data = rightPluginsData([radar, ridgePluginWidget('right', 'Notes'), secondRadar])
    expect(ridgeItemTitle('plugins-right', data)).toBe('Radar, Notes')
  })

  it('falls back to the Ridge label for a plugin group without widgets and for every other item', () => {
    const data = absentRidgePreviewData()
    expect(ridgeItemTitle('plugins-left', data)).toBe(topbarItemLabel('plugins-left'))
    expect(ridgeItemTitle('clock', data)).toBe(topbarItemLabel('clock'))
  })
})

describe('ridgeItemPluginIcon', () => {
  it('takes the first plugin logo on the side of a plugin group', () => {
    const radar = { ...ridgePluginWidget('right', 'Radar'), pluginIcon: RADAR_LOGO }
    expect(ridgeItemPluginIcon('plugins-right', rightPluginsData([ridgePluginWidget('right', 'Notes'), radar]))).toBe(RADAR_LOGO)
  })

  it('has no logo for plugins without one, nor for an item that is not a plugin group', () => {
    const data = liveRidgePreviewData()
    expect(ridgeItemPluginIcon('plugins-right', data)).toBeNull()
    expect(ridgeItemPluginIcon('clock', data)).toBeNull()
  })
})

describe('ridgeCanAddItem', () => {
  it('offers a plugin group back only while a plugin places a widget on its side', () => {
    expect(ridgeCanAddItem('plugins-left', liveRidgePreviewData())).toBe(true)
    expect(ridgeCanAddItem('plugins-left', absentRidgePreviewData())).toBe(false)
  })

  it('always offers an item that is not a plugin group', () => {
    expect(ridgeCanAddItem('media', absentRidgePreviewData())).toBe(true)
  })
})

describe('ridgeDrawsItem', () => {
  it('draws a plugin group only while a live widget fills its side', () => {
    const counts = { left: 0, right: 2 }
    expect(ridgeDrawsItem('plugins-left', counts)).toBe(false)
    expect(ridgeDrawsItem('plugins-right', counts)).toBe(true)
  })

  it('always draws an item that is not a plugin group', () => {
    expect(ridgeDrawsItem('clock', { left: 0, right: 0 })).toBe(true)
  })
})
