import { describe, it, expect } from 'vitest'
import { Keyboard, Wifi } from 'lucide-react'
import { SETTINGS_PAGES, SETTINGS_REGISTRY, settingsPage, settingsPageRoute } from './registry'
import {
  SETTINGS_SEARCH_LIMIT,
  SETTINGS_SEARCH_TARGETS,
  searchSettings,
  settingsSearchTargets,
} from './settingsSearch'

function labels(matches: SettingsSearchMatch[]): string[] {
  return matches.map((match) => match.target.label)
}

function shown(query: string): SettingsSearchMatch[] {
  return searchSettings(query).slice(0, SETTINGS_SEARCH_LIMIT)
}

function inputLanguageEntry(page: SettingsPageId, group: string): SettingsEntry {
  return {
    id: `input-language-${page}`,
    label: 'Input language',
    description: 'The language you type in and the layout your keys are mapped to',
    keywords: ['input language', 'keyboard layout', 'typing', 'qwerty', 'azerty'],
    icon: Keyboard,
    page,
    group,
    order: 1,
    applies: 'instant',
    control: { kind: 'navigate', path: settingsPageRoute(page) as string },
  }
}

describe('settings search targets', () => {
  it('reaches every entry in the registry without scrolling past the cap', () => {
    for (const entry of SETTINGS_REGISTRY) {
      const route = settingsPageRoute(entry.page)
      const found = shown(entry.label).some((match) =>
        route === null
          ? match.target.id === entry.id
          : match.target.action.kind === 'navigate'
            ? match.target.action.route === route
            : match.target.id === entry.id
      )
      expect(found, `no result for ${entry.id} leads to its page`).toBe(true)
    }
  })

  it('reaches every routed page by its own name', () => {
    for (const page of SETTINGS_PAGES) {
      if (page.route === null) continue
      const found = shown(page.label).some(
        (match) => match.target.action.kind === 'navigate' && match.target.action.route === page.route
      )
      expect(found, `no result for the ${page.id} page`).toBe(true)
    }
  })

  it('says which page each setting lives on', () => {
    for (const target of SETTINGS_SEARCH_TARGETS) {
      expect(target.context.trim().length).toBeGreaterThan(0)
    }
  })

  it('flips an instant toggle in place and sends everything else to a page', () => {
    for (const target of SETTINGS_SEARCH_TARGETS) {
      if (target.action.kind !== 'toggle') continue
      expect(target.action.entry.control.kind).toBe('toggle')
      expect(target.action.entry.applies).toBe('instant')
    }
  })

  it('never fires an entry that does not apply instantly', () => {
    const risky = SETTINGS_REGISTRY.filter((entry) => entry.applies !== 'instant').map((entry) => entry.id)
    const fired = SETTINGS_SEARCH_TARGETS.filter((target) => target.action.kind === 'toggle').map(
      (target) => target.id
    )
    for (const id of risky) expect(fired).not.toContain(id)
  })
})

describe('settings search ranking', () => {
  it('finds a setting by a synonym that appears in no title', () => {
    const found = labels(shown('eco'))
    expect(found).toContain('Force battery saver on')
    expect(found.join(' ')).not.toContain('eco')
  })

  it('finds Wi-Fi by a word its title does not contain', () => {
    expect(labels(shown('wireless'))).toContain('Wi-Fi')
  })

  it('finds the input language setting by keyboard layout, whichever page it is filed under', () => {
    for (const [page, group] of [
      ['search', 'Input'],
      ['appearance', 'Language'],
      ['home', 'Region'],
    ] as [SettingsPageId, string][]) {
      const targets = settingsSearchTargets([inputLanguageEntry(page, group)], SETTINGS_PAGES)
      const matches = searchSettings('keyboard layout', targets)
      expect(labels(matches)).toContain('Input language')
    }
  })

  it('finds the Input and language page whichever word you reach for', () => {
    for (const query of [
      'keyboard layout',
      'input language',
      'input method',
      'azerty',
      'qwertz',
      'locale',
      'region',
      'ime',
    ]) {
      const found = shown(query).some(
        (match) => match.target.action.kind === 'navigate' && match.target.action.route === 'input'
      )
      expect(found, `no result for "${query}" leads to the input page`).toBe(true)
    }
  })

  it('ranks an exact title above a keyword match on another entry', () => {
    const matches = searchSettings('theme')
    expect(matches[0].target.label).toBe('Theme')
    expect(labels(matches).length).toBeGreaterThan(1)
  })

  it('ranks a word of a title above anything that only scatters through a description', () => {
    expect(searchSettings('threshold')[0].target.label).toBe('Battery saver threshold')
    expect(searchSettings('overflow')[0].target.label).toBe('Show overflow arrow')
    expect(searchSettings('monitors')[0].target.label).toBe('Displays')
  })

  it('ranks a title match above a description match', () => {
    const matches = searchSettings('gap')
    expect(matches[0].target.label).toBe('Gap')
  })

  it('ranks Ridge first for its own name and for the name the bar had before', () => {
    for (const query of ['ridge', 'top bar', 'topbar']) {
      const first = searchSettings(query)[0].target
      expect(first.label, query).toBe(settingsPage('ridge')?.label)
      expect(first.action, query).toEqual({ kind: 'navigate', route: settingsPageRoute('ridge'), highlight: null })
    }
  })

  it('ranks the clock on Ridge first for clock', () => {
    expect(searchSettings('clock')[0].target.label).toBe('Clock on Ridge')
  })

  it('opens Ridge with the time format picked out for time format', () => {
    expect(searchSettings('time format')[0].target.action).toEqual({
      kind: 'navigate',
      route: settingsPageRoute('ridge'),
      highlight: 'clock-time-format',
    })
  })

  it('finds the power menu confirmation by the word the sketch used, as a switch', () => {
    const match = shown('reassurance').find((candidate) => candidate.target.label === 'Confirm power menu actions')
    expect(match?.target.action.kind).toBe('toggle')
  })

  it('finds the tray through its switch and the page it folded into, with no second System tray result', () => {
    const found = labels(shown('system tray'))
    expect(found[0]).toBe('Show system tray')
    expect(found).toContain(settingsPage('ridge')?.label)
    expect(found).not.toContain('System tray on Ridge')
  })

  it('returns nothing rather than everything when nothing matches', () => {
    expect(searchSettings('zzzzzz')).toEqual([])
    expect(searchSettings('   ')).toEqual([])
  })

  it('drops a page entry that only repeats the page it points at', () => {
    const wallpaper = SETTINGS_SEARCH_TARGETS.filter((target) => target.label === 'Wallpaper')
    expect(wallpaper).toHaveLength(1)
  })

  it('keeps a page reachable through a target that carries the section it belongs to', () => {
    const wifi = SETTINGS_SEARCH_TARGETS.find((target) => target.label === 'Wi-Fi')
    expect(wifi?.context).toBe('Devices')
    expect(wifi?.icon).toBe(Wifi)
  })
})
