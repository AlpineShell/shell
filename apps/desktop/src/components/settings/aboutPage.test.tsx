import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

import { settingsPage } from '../../settings/registry'
import AboutPage from './aboutPage'

describe('AboutPage', () => {
  beforeEach(() => {
    ;(window as unknown as { shell: unknown }).shell = {
      system: { info: () => new Promise(() => {}) },
      windows: { wallpaper: () => new Promise(() => {}), onWallpaperChanged: () => () => {} },
    }
  })

  it('names its Revert row the way the breadcrumb and the search result name that page', () => {
    render(<AboutPage onNavigate={() => {}} />)
    expect(
      screen.getByRole('button', { name: new RegExp(`^${settingsPage('revert')!.label}`) })
    ).toBeTruthy()
  })

  it('does not offer to make Alpine the default shell', () => {
    render(<AboutPage onNavigate={() => {}} />)
    expect(screen.queryByText(/default shell/i)).toBeNull()
  })
})
