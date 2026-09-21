import { describe, it, expect, beforeEach, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import { settingsPage, settingsPageRoute } from '../../settings/registry'
import AboutPage from './aboutPage'

const rowNamed = (pageId: SettingsPageId) => new RegExp(`^${settingsPage(pageId)!.label}`)

describe('AboutPage', () => {
  beforeEach(() => {
    ;(window as unknown as { shell: unknown }).shell = {
      system: { info: () => new Promise(() => {}) },
      windows: { wallpaper: () => new Promise(() => {}), onWallpaperChanged: () => () => {} },
    }
  })

  it('ends its rows with Ridge, named the way the breadcrumb and the search result name that page', () => {
    render(<AboutPage onNavigate={() => {}} />)
    const rows = screen.getAllByRole('button')
    expect(rows[rows.length - 1]).toBe(screen.getByRole('button', { name: rowNamed('ridge') }))
  })

  it('opens Ridge from its Ridge row', () => {
    const onNavigate = vi.fn()
    render(<AboutPage onNavigate={onNavigate} />)
    fireEvent.click(screen.getByRole('button', { name: rowNamed('ridge') }))
    expect(onNavigate).toHaveBeenCalledWith(settingsPageRoute('ridge'))
  })

  it('no longer lists Revert to Windows among its rows', () => {
    render(<AboutPage onNavigate={() => {}} />)
    expect(screen.queryByRole('button', { name: rowNamed('revert') })).toBeNull()
  })

  it('does not offer to make Alpine the default shell', () => {
    render(<AboutPage onNavigate={() => {}} />)
    expect(screen.queryByText(/default shell/i)).toBeNull()
  })
})
