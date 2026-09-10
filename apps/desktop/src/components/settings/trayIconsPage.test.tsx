import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import { settingsPage } from '../../settings/registry'
import TrayIconsPage from './trayIconsPage'

describe('TrayIconsPage', () => {
  it('heads itself with the label the breadcrumb and the sidebar read', () => {
    render(<TrayIconsPage />)
    expect(screen.getByRole('heading').textContent).toBe(settingsPage('tray-icons')!.label)
  })
})
