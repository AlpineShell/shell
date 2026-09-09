import { describe, it, expect } from 'vitest'
import { SETTINGS_PAGES } from '../../settings/registry'
import { SETTINGS_ROUTES } from './settingsRoutes'

const declaredRoutes = SETTINGS_PAGES.map((page) => page.route).filter((route): route is string => route !== null)

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
})
