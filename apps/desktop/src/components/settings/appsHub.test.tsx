import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import { settingsPage } from '../../settings/registry'
import AppsHub from './appsHub'

const APPS_PAGES = ['apps-installed', 'apps-startup', 'apps-running', 'apps-defaults'] as const

describe('AppsHub', () => {
  it('heads itself with the label the breadcrumb and the search result read', () => {
    render(<AppsHub onNavigate={() => {}} />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(settingsPage('apps')!.label)
  })

  it('names each row the way the breadcrumb and the search result name that page', () => {
    render(<AppsHub onNavigate={() => {}} />)
    for (const page of APPS_PAGES) {
      expect(screen.getByRole('button', { name: new RegExp(`^${settingsPage(page)!.label}`) })).toBeTruthy()
    }
  })
})
