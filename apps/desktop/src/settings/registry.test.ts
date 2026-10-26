import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import {
  LAUNCHER_SETTINGS,
  SETTINGS_PAGES,
  SETTINGS_REGISTRY,
  SETTINGS_SECTIONS,
  isSettingsValueEntry,
  settingsEntry,
  settingsEntryHint,
  settingsPage,
  settingsPageByRoute,
  settingsPageRoute,
} from './registry'

const LAUNCHER_SETTING_IDS = [
  'wifi',
  'bluetooth',
  'mute',
  'topbar-search-icon',
  'browser-bookmarks',
  'browser-tabs',
  'media-visualizer',
  'tray',
  'tiling',
  'volume',
  'brightness',
  'battery-saver',
  'battery-saver-automatic',
  'battery-saver-threshold',
  'battery-saver-polling',
  'battery-saver-throttling',
  'wallpaper',
  'emoji',
  'search',
  'updates',
  'apps-running',
  'apps-installed',
  'startup',
  'revert',
  'system',
  'power',
]

const SETTINGS_ONLY_IDS = ['battery-saver-dimming', 'battery-saver-dim-amount', 'battery-saver-dim-externals', 'status-sound']

const APPLIES = ['instant', 'confirm', 'restart', 'draft']

const DECISION_RECORD = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'docs', 'settings-decision.md')

const NEWLINE = /\r?\n/

const TABLE_ROW = /^\|\s*`([a-z0-9-]+)`\s*\|\s*(instant|confirm|restart|draft)\s*\|\s*(\S.*?)\s*\|\s*$/

const EXCEPTIONS: Record<string, SettingsApplies> = {
  displays: 'draft',
  'keyboard-layout-remove': 'confirm',
  'language-remove': 'confirm',
  'app-force-close': 'confirm',
  'app-uninstall': 'confirm',
  startup: 'confirm',
  'apps-defaults': 'confirm',
  'plugin-uninstall': 'confirm',
  updates: 'restart',
  'high-performance-gpu': 'restart',
  revert: 'confirm',
  power: 'confirm',
  'ridge-layout-reset': 'confirm',
}

const SETTINGS_FOLDED_INTO_RIDGE = [
  'topbar-color',
  'topbar-color-automatic',
  'topbar-adapt-to-apps',
  'calendar-days',
  'calendar-show-tasks',
]

const PERSONAL_SIDEBAR: SettingsPageId[] = ['wallpaper', 'ridge', 'appearance']

const SECTION_PAGE_LISTS: Record<SettingsSectionId, SettingsPageId[]> = {
  home: ['home', 'revert'],
  personalization: PERSONAL_SIDEBAR,
  desktop: ['search', 'tiling', 'shortcuts'],
  devices: ['displays', 'wifi', 'bluetooth', 'sound', 'battery', 'input'],
  system: ['apps', 'date-time', 'plugins', 'updates'],
}

function pageList(section: SettingsSectionId): SettingsPageId[] {
  return SETTINGS_PAGES.filter((page) => page.section === section && page.route !== null && !page.route.includes('/'))
    .sort((a, b) => a.order - b.order)
    .map((page) => page.id)
}

const OLD_BAR_NAME = /top ?bar/i

function textsAReaderSees(entry: SettingsEntry): string[] {
  const control = entry.control
  const options = control.kind === 'select' || control.kind === 'segmented' ? control.options.map((option) => String(option.label)) : []
  const actions = control.kind === 'action' ? [control.actionLabel] : []
  return [entry.label, entry.description, entry.hint ?? '', ...options, ...actions]
}

function decisionTableRows(): Map<string, string> {
  const rows = new Map<string, string>()
  for (const line of readFileSync(DECISION_RECORD, 'utf8').split(NEWLINE)) {
    const match = TABLE_ROW.exec(line)
    if (match) rows.set(match[1], match[2] + '|' + match[3])
  }
  return rows
}

const PAGE_ONLY_IDS = [
  'input',
  'keyboard-layouts',
  'keyboard-layout-remove',
  'language-add',
  'language-remove',
  'switch-input-method',
  'default-input-method',
  'sound',
  'audio-output',
  'audio-input',
  'wifi',
  'bluetooth',
  'displays',
  'apps-running',
  'apps-installed',
  'startup',
  'plugins',
  'updates',
  'tray-icons',
  'revert',
  'apps-defaults',
]

describe('settings pages', () => {
  it('declares a unique id for every page', () => {
    const ids = SETTINGS_PAGES.map((page) => page.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('gives every page a route except the launcher-only one', () => {
    for (const page of SETTINGS_PAGES) {
      if (page.kind === 'launcher') expect(page.route).toBeNull()
      else expect(typeof page.route).toBe('string')
    }
  })

  it('puts every routed page in a declared section', () => {
    const sections = new Set(SETTINGS_SECTIONS.map((section) => section.id))
    for (const page of SETTINGS_PAGES) {
      if (page.route === null) expect(page.section).toBeNull()
      else expect(sections.has(page.section as SettingsSectionId)).toBe(true)
    }
  })

  it('gives every routed page a route of its own', () => {
    const routes = SETTINGS_PAGES.map((page) => page.route).filter((route) => route !== null)
    expect(new Set(routes).size).toBe(routes.length)
  })

  it('declares every ancestor of a nested route as a page in its own right', () => {
    const routes = new Set(SETTINGS_PAGES.map((page) => page.route).filter((route) => route !== null))
    for (const route of routes) {
      const segments = route.split('/')
      for (let depth = 1; depth < segments.length; depth++) {
        expect(routes.has(segments.slice(0, depth).join('/'))).toBe(true)
      }
    }
  })

  it('resolves pages and routes by id', () => {
    expect(settingsPage('battery')?.label).toBe('Battery')
    expect(settingsPageRoute('battery')).toBe('battery')
    expect(settingsPageRoute('tray-icons')).toBe('ridge/tray-icons')
    expect(settingsPageRoute('quick-actions')).toBeNull()
  })

  it('resolves pages by the route the settings window navigates to', () => {
    expect(settingsPageByRoute('ridge/tray-icons')?.id).toBe('tray-icons')
    expect(settingsPageByRoute('revert')?.label).toBe('Revert to Windows')
    expect(settingsPageByRoute('nowhere')).toBeNull()
  })

  it('lists the Personal pages with Ridge after Wallpaper and no System tray page', () => {
    expect(pageList('personalization')).toEqual(PERSONAL_SIDEBAR)
  })

  it('lists each section in the order the section bar shows it', () => {
    expect([...SETTINGS_SECTIONS].sort((a, b) => a.order - b.order).map((section) => section.id)).toEqual([
      'home',
      'personalization',
      'desktop',
      'devices',
      'system',
    ])
  })

  it('lists every section with its own pages, Revert to Windows under Home', () => {
    for (const section of SETTINGS_SECTIONS) expect(pageList(section.id), section.id).toEqual(SECTION_PAGE_LISTS[section.id])
  })

  it('gives no two pages in a section the same place', () => {
    for (const section of SETTINGS_SECTIONS) {
      const orders = SETTINGS_PAGES.filter((page) => page.section === section.id).map((page) => page.order)
      expect(new Set(orders).size, section.id).toBe(orders.length)
    }
  })

  it('calls the bar Ridge in every page name and description', () => {
    for (const page of SETTINGS_PAGES) {
      expect(page.label, page.id).not.toMatch(OLD_BAR_NAME)
      expect(page.description, page.id).not.toMatch(OLD_BAR_NAME)
    }
  })

  it('declares no Calendar page now that it folded into Ridge', () => {
    const ids = SETTINGS_PAGES.map((page) => page.id)
    expect(ids).not.toContain('calendar')
  })
})

describe('the settings folded into Ridge', () => {
  it('files the colour and hover calendar settings on Ridge', () => {
    for (const id of SETTINGS_FOLDED_INTO_RIDGE) {
      expect(settingsEntry(id)?.page, id).toBe('ridge')
    }
  })

  it('lets Ridge follow the colour of the app in front, as a switch that is on by default', () => {
    const adaptToApps = settingsEntry('topbar-adapt-to-apps') as SettingsEntry
    expect(adaptToApps.control.kind).toBe('toggle')
    expect(isSettingsValueEntry(adaptToApps) && adaptToApps.defaultValue).toBe(true)
  })

  it('has no theme setting of its own, because the settings window follows the Windows color mode', () => {
    expect(settingsEntry('theme')).toBeNull()
  })
})

describe('the graphics setting', () => {
  it('leaves the high-performance GPU off until someone turns it on, and applies it at the next start', () => {
    const highPerformanceGpu = settingsEntry('high-performance-gpu') as SettingsEntry
    expect(highPerformanceGpu.control.kind).toBe('toggle')
    expect(isSettingsValueEntry(highPerformanceGpu)).toBe(true)
    expect((highPerformanceGpu as SettingsValueEntry).defaultValue).toBe(false)
    expect(highPerformanceGpu.applies).toBe('restart')
  })
})

describe('settings registry', () => {
  it('gives every entry a unique id', () => {
    const ids = SETTINGS_REGISTRY.map((entry) => entry.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('uses kebab-case ids', () => {
    for (const entry of SETTINGS_REGISTRY) {
      expect(entry.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    }
  })

  it('gives every entry at least two keywords', () => {
    for (const entry of SETTINGS_REGISTRY) {
      expect(entry.keywords.length).toBeGreaterThanOrEqual(2)
    }
  })

  it('gives every entry distinct non-empty keywords', () => {
    for (const entry of SETTINGS_REGISTRY) {
      expect(new Set(entry.keywords).size).toBe(entry.keywords.length)
      for (const keyword of entry.keywords) expect(keyword.trim().length).toBeGreaterThan(0)
    }
  })

  it('files every entry under a declared page', () => {
    const pages = new Set(SETTINGS_PAGES.map((page) => page.id))
    for (const entry of SETTINGS_REGISTRY) {
      expect(pages.has(entry.page)).toBe(true)
    }
  })

  it('declares how every entry applies', () => {
    for (const entry of SETTINGS_REGISTRY) {
      expect(Object.prototype.hasOwnProperty.call(entry, 'applies')).toBe(true)
      expect(APPLIES).toContain(entry.applies)
    }
  })

  it('keeps the exception on every entry that has one', () => {
    for (const [id, applies] of Object.entries(EXCEPTIONS)) {
      expect(settingsEntry(id)?.applies).toBe(applies)
    }
  })

  it('declares nothing else as an exception without arguing it first', () => {
    const nonInstant = SETTINGS_REGISTRY.filter((entry) => entry.applies !== 'instant').map((entry) => entry.id)
    expect(nonInstant.sort()).toEqual(Object.keys(EXCEPTIONS).sort())
  })

  it('leaves draft to pages that own an apply and revert flow', () => {
    for (const entry of SETTINGS_REGISTRY) {
      if (entry.applies !== 'draft') continue
      expect(isSettingsValueEntry(entry)).toBe(false)
    }
  })

  it('argues every entry in the decision record', () => {
    const rows = decisionTableRows()
    for (const entry of SETTINGS_REGISTRY) {
      expect(rows.get(entry.id)?.split('|')[0]).toBe(entry.applies)
      expect((rows.get(entry.id)?.split('|')[1] ?? '').length).toBeGreaterThan(20)
    }
    expect([...rows.keys()].sort()).toEqual(SETTINGS_REGISTRY.map((entry) => entry.id).sort())
  })

  it('calls the bar Ridge in everything an entry shows a reader, leaving the old name to keywords', () => {
    for (const entry of SETTINGS_REGISTRY) {
      for (const text of textsAReaderSees(entry)) expect(text, entry.id).not.toMatch(OLD_BAR_NAME)
    }
  })

  it('gives every entry a label and a description', () => {
    for (const entry of SETTINGS_REGISTRY) {
      expect(entry.label.trim().length).toBeGreaterThan(0)
      expect(entry.description.trim().length).toBeGreaterThan(0)
      expect(settingsEntryHint(entry).trim().length).toBeGreaterThan(0)
    }
  })

  it('orders entries within a page group without collisions', () => {
    const seen = new Set<string>()
    for (const entry of SETTINGS_REGISTRY) {
      const key = `${entry.page}/${entry.group}/${entry.order}`
      expect(seen.has(key)).toBe(false)
      seen.add(key)
    }
  })

  it('keeps every setting the launcher exposes today', () => {
    const launcherIds = new Set(LAUNCHER_SETTINGS.map((entry) => entry.id))
    for (const id of LAUNCHER_SETTING_IDS) {
      expect(launcherIds.has(id)).toBe(true)
    }
  })

  it('keeps settings-only entries in the settings window and out of the launcher', () => {
    const launcherIds = new Set(LAUNCHER_SETTINGS.map((entry) => entry.id))
    for (const id of SETTINGS_ONLY_IDS) {
      expect(settingsEntry(id)).not.toBeNull()
      expect(launcherIds.has(id)).toBe(false)
    }
  })

  it('declares a page-level entry for every route the registry cannot own', () => {
    for (const id of PAGE_ONLY_IDS) {
      const entry = settingsEntry(id)
      expect(entry).not.toBeNull()
      expect(isSettingsValueEntry(entry as SettingsEntry)).toBe(false)
    }
  })

  it('points every navigate control at a declared page route', () => {
    const routes = new Set(SETTINGS_PAGES.map((page) => page.route).filter((route) => route !== null))
    for (const entry of SETTINGS_REGISTRY) {
      if (entry.control.kind !== 'navigate') continue
      expect(routes.has(entry.control.path)).toBe(true)
    }
  })
})

describe('settings values', () => {
  it('matches every default value to the type its control edits', () => {
    for (const entry of SETTINGS_REGISTRY) {
      if (!isSettingsValueEntry(entry)) continue
      const control = entry.control
      if (control.kind === 'toggle') expect(typeof entry.defaultValue).toBe('boolean')
      else if (control.kind === 'slider') expect(typeof entry.defaultValue).toBe('number')
      else if (control.kind === 'hotkey') expect(typeof entry.defaultValue).toBe('string')
      else if (control.kind === 'color') expect(entry.defaultValue === null || typeof entry.defaultValue === 'object').toBe(true)
      else expect(control.options.map((option) => option.value)).toContain(entry.defaultValue)
    }
  })

  it('gives every slider a usable range', () => {
    for (const entry of SETTINGS_REGISTRY) {
      if (!isSettingsValueEntry(entry) || entry.control.kind !== 'slider') continue
      const { min, max, step } = entry.control
      expect(max).toBeGreaterThan(min)
      expect(step).toBeGreaterThan(0)
      expect(entry.defaultValue as number).toBeGreaterThanOrEqual(min)
      expect(entry.defaultValue as number).toBeLessThanOrEqual(max)
    }
  })

  it('gives every choice control at least two distinct options', () => {
    for (const entry of SETTINGS_REGISTRY) {
      if (!isSettingsValueEntry(entry)) continue
      if (entry.control.kind !== 'select' && entry.control.kind !== 'segmented') continue
      const values = entry.control.options.map((option) => option.value)
      expect(values.length).toBeGreaterThanOrEqual(2)
      expect(new Set(values).size).toBe(values.length)
      for (const option of entry.control.options) expect(option.label.trim().length).toBeGreaterThan(0)
    }
  })

  it('falls back to a declared option when validating rubbish', () => {
    for (const entry of SETTINGS_REGISTRY) {
      if (!isSettingsValueEntry(entry) || !entry.validate) continue
      const control = entry.control
      if (control.kind !== 'select' && control.kind !== 'segmented') continue
      expect(control.options.map((option) => option.value)).toContain(entry.validate('nonsense'))
    }
  })

  it('offers only the 12-hour and 24-hour clock, and turns anything else into one of them', () => {
    const timeFormat = settingsEntry('clock-time-format') as SettingsEntry
    const control = timeFormat.control
    expect(control.kind === 'segmented' && control.options.map((option) => option.value)).toEqual(['12h', '24h'])
    for (const value of ['auto', 'nonsense', 12, null]) {
      expect(isSettingsValueEntry(timeFormat) && timeFormat.validate?.(value)).toMatch(/^(12h|24h)$/)
    }
  })

  it('gives no panel entry a value to read or write', () => {
    for (const entry of SETTINGS_REGISTRY) {
      if (isSettingsValueEntry(entry)) continue
      expect('read' in entry).toBe(false)
      expect('write' in entry).toBe(false)
      expect('defaultValue' in entry).toBe(false)
    }
  })
})
