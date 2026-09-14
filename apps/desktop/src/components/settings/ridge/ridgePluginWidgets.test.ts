import { describe, expect, it } from 'vitest'
import { pluginWidgetPlaceholders } from './ridgePluginWidgets'
import { ridgePluginRecord } from './ridgeTestFixtures'

const NOTES_PLUGIN = { id: 'com.example.notes', name: 'Notes' }

function pluginWithWidgets(topbarWidgets: unknown[], overrides: Partial<PluginRecord> = {}): PluginRecord {
  return ridgePluginRecord({ contributes: { topbarWidgets }, ...overrides })
}

function placeholderIds(records: PluginRecord[], slot: RidgePluginSlot): string[] {
  return pluginWidgetPlaceholders(records, slot).map((widget) => widget.id)
}

describe('pluginWidgetPlaceholders', () => {
  it('stands one placeholder in for each widget a loaded plugin puts on its side of the bar', () => {
    const records = [pluginWithWidgets([{ slot: 'left', export: 'Forecast', order: 2 }])]
    expect(pluginWidgetPlaceholders(records, 'left')).toEqual([
      {
        id: 'com.example.weather:Forecast',
        pluginId: 'com.example.weather',
        pluginName: 'Weather',
        pluginIcon: null,
        slot: 'left',
        order: 2,
      },
    ])
    expect(pluginWidgetPlaceholders(records, 'right')).toEqual([])
  })

  it('carries the plugin logo, preferring the marketplace one to the manifest icon', () => {
    const withIcon = pluginWithWidgets([{ slot: 'right' }], { icon: 'icon.png' })
    const withLogo = pluginWithWidgets([{ slot: 'right' }], {
      icon: 'icon.png',
      marketplace: { logo: 'logo.png' } as PluginRecord['marketplace'],
    })
    expect(pluginWidgetPlaceholders([withIcon], 'right')[0].pluginIcon).toBe('alpine-plugin://com.example.weather/icon.png')
    expect(pluginWidgetPlaceholders([withLogo], 'right')[0].pluginIcon).toBe('alpine-plugin://com.example.weather/logo.png')
  })

  it.each<[string, Partial<PluginRecord>]>([
    ['disabled', { enabled: false }],
    ['unable to load', { loadable: false }],
  ])('leaves out a plugin that is %s, as the bar does', (_, overrides) => {
    const records = [pluginWithWidgets([{ slot: 'right', export: 'Forecast' }], overrides)]
    expect(pluginWidgetPlaceholders(records, 'right')).toEqual([])
  })

  it('puts a widget without a slot on the right, first, under its default export', () => {
    expect(pluginWidgetPlaceholders([pluginWithWidgets([{}])], 'right')).toEqual([
      {
        id: 'com.example.weather:default',
        pluginId: 'com.example.weather',
        pluginName: 'Weather',
        pluginIcon: null,
        slot: 'right',
        order: 0,
      },
    ])
  })

  it('drops a centre widget, because the bar has no centre plugin group', () => {
    const records = [pluginWithWidgets([{ slot: 'center', export: 'Forecast' }])]
    expect(placeholderIds(records, 'left')).toEqual([])
    expect(placeholderIds(records, 'right')).toEqual([])
  })

  it('sorts by order across plugins and keeps list order between equal orders', () => {
    const records = [
      pluginWithWidgets([{ slot: 'right', export: 'Late', order: 5 }, { slot: 'right', export: 'Tied' }]),
      pluginWithWidgets([{ slot: 'right', export: 'Early', order: -1 }, { slot: 'right', export: 'AlsoTied', order: 0 }], NOTES_PLUGIN),
    ]
    expect(placeholderIds(records, 'right')).toEqual([
      'com.example.notes:Early',
      'com.example.weather:Tied',
      'com.example.notes:AlsoTied',
      'com.example.weather:Late',
    ])
  })

  it('keeps only the last widget listed under one export, as the bar registry does', () => {
    const records = [pluginWithWidgets([{ slot: 'left', export: 'Forecast', order: 1 }, { slot: 'right', export: 'Forecast', order: 3 }])]
    expect(placeholderIds(records, 'left')).toEqual([])
    expect(pluginWidgetPlaceholders(records, 'right')).toMatchObject([{ id: 'com.example.weather:Forecast', order: 3 }])
  })

  it('lets a later centre widget displace an earlier one under the same export', () => {
    const records = [pluginWithWidgets([{ slot: 'left', export: 'Forecast' }, { slot: 'center', export: 'Forecast' }])]
    expect(placeholderIds(records, 'left')).toEqual([])
  })

  it.each<[string, unknown]>([
    ['no contributions at all', undefined],
    ['no bar widgets', {}],
    ['a widget list that is not a list', { topbarWidgets: 'Forecast' }],
    ['widget entries that are not objects', { topbarWidgets: [null, 'Forecast', 3] }],
    ['only other contribution kinds', { settingsPages: [{ export: 'Settings' }] }],
  ])('draws nothing for a plugin with %s', (_, contributes) => {
    const records = [ridgePluginRecord({ contributes: contributes as PluginRecord['contributes'] })]
    expect(placeholderIds(records, 'left')).toEqual([])
    expect(placeholderIds(records, 'right')).toEqual([])
  })
})
