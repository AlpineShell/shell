import { describe, it, expect } from 'vitest'
import {
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
  'recent-apps',
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
  'battery-saver-dimming',
  'battery-saver-dim-externals',
  'battery-saver-dim-amount',
  'battery-saver-polling',
  'battery-saver-throttling',
  'wallpaper',
  'emoji',
  'appearance',
  'search',
  'theme',
  'updates',
  'apps-running',
  'apps-installed',
  'startup',
  'revert',
  'system',
  'power',
]

const APPLIES = ['instant', 'confirm', 'restart', 'draft']

const PAGE_ONLY_IDS = [
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
    expect(settingsPageRoute('tray-icons')).toBe('tray/icons')
    expect(settingsPageRoute('quick-actions')).toBeNull()
  })

  it('resolves pages by the route the settings window navigates to', () => {
    expect(settingsPageByRoute('tray/icons')?.id).toBe('tray-icons')
    expect(settingsPageByRoute('home/revert')?.label).toBe('Revert to Windows')
    expect(settingsPageByRoute('nowhere')).toBeNull()
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
      expect(APPLIES).toContain(entry.applies)
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
    for (const id of LAUNCHER_SETTING_IDS) {
      expect(settingsEntry(id)).not.toBeNull()
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

  it('gives no panel entry a value to read or write', () => {
    for (const entry of SETTINGS_REGISTRY) {
      if (isSettingsValueEntry(entry)) continue
      expect('read' in entry).toBe(false)
      expect('write' in entry).toBe(false)
      expect('defaultValue' in entry).toBe(false)
    }
  })
})
