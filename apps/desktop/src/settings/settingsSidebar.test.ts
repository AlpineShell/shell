import { describe, expect, it } from 'vitest'
import {
  groupHoldingRoute,
  settingsSidebarSections,
  showsAsGroup,
  sidebarItemLabel,
} from './settingsSidebar'

function pluginPage(pluginId: string, topLevel: boolean): PluginSettingsPageEntry {
  return {
    pluginId,
    pluginName: pluginId,
    route: `plugins/${pluginId}`,
    label: `${pluginId} settings`,
    iconUrl: null,
    topLevel,
    exportName: null,
    entry: 'index.js',
    enabled: true,
    settings: [],
  }
}

function routesOf(sidebar: SettingsSidebarSection[], section: SettingsSectionId): string[] {
  return sidebar.find((sidebarSection) => sidebarSection.section.id === section)?.items.map((item) => item.route) ?? []
}

function groupIds(sidebar: SettingsSidebarSection[]): SettingsSectionId[] {
  return sidebar.filter(showsAsGroup).map((sidebarSection) => sidebarSection.section.id)
}

describe('settings sidebar', () => {
  it('lists Home and the everyday device pages directly, then the groups', () => {
    const sidebar = settingsSidebarSections([])
    expect(sidebar.map((sidebarSection) => sidebarSection.section.id)).toEqual([
      'home',
      'devices',
      'personalization',
      'desktop',
      'system',
      'plugins',
    ])
    expect(routesOf(sidebar, 'home')).toEqual(['home'])
    expect(routesOf(sidebar, 'devices')).toEqual(['wifi', 'bluetooth', 'sound', 'displays', 'battery'])
    expect(routesOf(sidebar, 'system')).toEqual(['date-time', 'input', 'apps', 'updates', 'revert'])
  })

  it('keeps nested pages like the apps subpages out of the sidebar', () => {
    const routes = settingsSidebarSections([]).flatMap((sidebarSection) => sidebarSection.items.map((item) => item.route))
    expect(routes.some((route) => route.includes('/'))).toBe(false)
  })

  it('shows Plugins as a plain page while no plugin has a settings page of its own', () => {
    const sidebar = settingsSidebarSections([pluginPage('com.example.hidden', false)])
    expect(groupIds(sidebar)).toEqual(['personalization', 'desktop', 'system'])
    const plugins = sidebar.find((sidebarSection) => sidebarSection.section.id === 'plugins') as SettingsSidebarSection
    expect(plugins.items.map((item) => sidebarItemLabel(item, showsAsGroup(plugins)))).toEqual(['Plugins'])
  })

  it('folds the plugin pages under a Plugins group once a plugin has one', () => {
    const sidebar = settingsSidebarSections([pluginPage('com.example.weather', true), pluginPage('com.example.hidden', false)])
    expect(groupIds(sidebar)).toEqual(['personalization', 'desktop', 'system', 'plugins'])
    const plugins = sidebar.find((sidebarSection) => sidebarSection.section.id === 'plugins') as SettingsSidebarSection
    expect(plugins.items.map((item) => sidebarItemLabel(item, true))).toEqual(['Manage plugins', 'com.example.weather settings'])
  })

  it('finds the group a route sits in, and none for a page shown directly', () => {
    const sidebar = settingsSidebarSections([pluginPage('com.example.weather', true)])
    expect(groupHoldingRoute('tiling', sidebar)).toBe('desktop')
    expect(groupHoldingRoute('revert', sidebar)).toBe('system')
    expect(groupHoldingRoute('plugins/com.example.weather', sidebar)).toBe('plugins')
    expect(groupHoldingRoute('sound', sidebar)).toBeNull()
    expect(groupHoldingRoute(null, sidebar)).toBeNull()
    expect(groupHoldingRoute('plugins', settingsSidebarSections([]))).toBeNull()
  })
})
