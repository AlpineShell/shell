import { describe, it, expect } from 'vitest'
import {
  SETTINGS_PAGE_GROUP,
  SETTINGS_PAGES,
  SETTINGS_REGISTRY,
  settingsEntry,
  settingsPageRoute,
} from '../../settings/registry'
import { SETTINGS_SEARCH_TARGETS } from '../../settings/settingsSearch'
import { SETTINGS_ROUTES, SETTINGS_ROUTE_COVERAGE } from './settingsRoutes'
import { registryPageRendersEntry } from './registryPage'

const declaredRoutes = SETTINGS_PAGES.map((page) => page.route).filter((route): route is string => route !== null)

const navigatedEntries = SETTINGS_SEARCH_TARGETS.flatMap((target) =>
  target.action.kind === 'navigate' && target.action.highlight !== null
    ? [{ id: target.action.highlight, route: target.action.route }]
    : []
)

const routesOwningEntries = [
  ...new Set(
    SETTINGS_REGISTRY.filter((entry) => entry.group !== SETTINGS_PAGE_GROUP)
      .map((entry) => settingsPageRoute(entry.page))
      .filter((route): route is string => route !== null)
  ),
]

function routeRendersEntry(route: string, entry: SettingsEntry): boolean {
  const coverage = SETTINGS_ROUTE_COVERAGE[route]
  if (!coverage) return false
  if (coverage.renderedByThePage.includes(entry.id)) return true
  return coverage.registryRows && registryPageRendersEntry(entry)
}

describe('settings routes', () => {
  it('renders a page for every route the registry declares', () => {
    for (const route of declaredRoutes) {
      expect(Object.keys(SETTINGS_ROUTES)).toContain(route)
    }
  })

  it('declares a registry page for every route it renders', () => {
    for (const route of Object.keys(SETTINGS_ROUTES)) {
      expect(declaredRoutes).toContain(route)
    }
  })

  it('reaches every nested route from a parent that renders', () => {
    for (const route of Object.keys(SETTINGS_ROUTES)) {
      const segments = route.split('/')
      for (let depth = 1; depth < segments.length; depth++) {
        expect(Object.keys(SETTINGS_ROUTES)).toContain(segments.slice(0, depth).join('/'))
      }
    }
  })

  it('says how every route that owns settings renders them', () => {
    for (const route of routesOwningEntries) {
      expect(Object.keys(SETTINGS_ROUTE_COVERAGE), `${route} declares no coverage`).toContain(route)
    }
  })

  it('renders every setting a search result navigates to', () => {
    expect(navigatedEntries.length).toBeGreaterThan(0)
    for (const { id, route } of navigatedEntries) {
      const entry = settingsEntry(id)
      expect(entry, `${id} is not in the registry`).not.toBeNull()
      expect(routeRendersEntry(route, entry!), `${route} does not render ${id}`).toBe(true)
    }
  })

  it('claims to render only entries that belong to the route claiming them', () => {
    for (const [route, coverage] of Object.entries(SETTINGS_ROUTE_COVERAGE)) {
      expect(Object.keys(SETTINGS_ROUTES)).toContain(route)
      for (const id of coverage.renderedByThePage) {
        const entry = settingsEntry(id)
        expect(entry, `${id} is not in the registry`).not.toBeNull()
        expect(settingsPageRoute(entry!.page), `${id} is not filed under ${route}`).toBe(route)
      }
    }
  })
})
