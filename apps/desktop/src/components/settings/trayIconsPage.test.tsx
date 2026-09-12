import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'

import { settingsPage } from '../../settings/registry'
import TrayIconsPage from './trayIconsPage'

const DROPBOX: TrayIcon = { id: 'dropbox', hWnd: 1, uID: 1, guid: null, tooltip: 'Dropbox', icon: '', version: 4 }

let reportedIcons: TrayIcon[]
let removeIconsListener: ReturnType<typeof vi.fn>
let removeLayoutListener: ReturnType<typeof vi.fn>

beforeEach(() => {
  reportedIcons = []
  removeIconsListener = vi.fn()
  removeLayoutListener = vi.fn()
  ;(window as unknown as { shell: unknown }).shell = {
    tray: {
      icons: vi.fn(() => Promise.resolve(reportedIcons)),
      onIconsChanged: vi.fn(() => removeIconsListener),
      layout: vi.fn(() => Promise.resolve({ order: [], hidden: [] })),
      onLayoutChanged: vi.fn(() => removeLayoutListener),
      setLayout: vi.fn((layout: TrayLayout) => Promise.resolve(layout)),
    },
  }
})

afterEach(() => {
  delete (window as unknown as { shell?: unknown }).shell
})

describe('TrayIconsPage', () => {
  it('heads itself with the label the breadcrumb and the sidebar read', async () => {
    render(<TrayIconsPage />)
    await act(async () => {})
    expect(screen.getByRole('heading').textContent).toBe(settingsPage('tray-icons')!.label)
  })

  it('lists the icons the tray reports', async () => {
    reportedIcons = [DROPBOX]
    render(<TrayIconsPage />)
    expect(await screen.findByText('Dropbox')).not.toBeNull()
  })

  it('removes its tray listeners when it closes', async () => {
    const { unmount } = render(<TrayIconsPage />)
    await act(async () => {})

    unmount()
    expect(removeIconsListener).toHaveBeenCalledTimes(1)
    expect(removeLayoutListener).toHaveBeenCalledTimes(1)
  })
})
