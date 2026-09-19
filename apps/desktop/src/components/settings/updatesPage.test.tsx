import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'

import UpdatesPage from './updatesPage'

const idleUpdate: UpdateState = { status: 'not-available', currentVersion: '1.2.3', availableVersion: null, progressPercent: 0, error: null }
const idleWindows: WindowsUpdateState = {
  status: 'up-to-date',
  updates: [],
  lastCheckedAt: null,
  rebootRequired: false,
  progressPercent: 0,
  progressLabel: null,
  installingId: null,
  error: null,
}

function installBridge(checkForUpdates: boolean) {
  const preferenceListeners: Array<(preferences: UpdatePreferences) => void> = []
  const setPreferences = vi.fn(async (partial: Partial<UpdatePreferences>) => ({ checkForUpdates: partial.checkForUpdates ?? checkForUpdates }))
  const check = vi.fn(async () => idleUpdate)
  ;(window as unknown as { shell: unknown }).shell = {
    updates: {
      getState: async () => idleUpdate,
      getLog: async () => [],
      check,
      download: async () => undefined,
      install: async () => undefined,
      preferences: async () => ({ checkForUpdates }),
      setPreferences,
      onStateChanged: () => {},
      onLogChanged: () => {},
      onPreferencesChanged: (listener: (preferences: UpdatePreferences) => void) => {
        preferenceListeners.push(listener)
        return () => {}
      },
    },
    windowsUpdate: {
      getState: async () => idleWindows,
      check: async () => idleWindows,
      install: async () => idleWindows,
      openWindowsUpdate: async () => ({ ok: true }),
      onStateChanged: () => {},
    },
    system: { powerAction: () => {} },
  }
  return { preferenceListeners, setPreferences, check }
}

async function renderPage(checkForUpdates: boolean) {
  const bridge = installBridge(checkForUpdates)
  render(<UpdatesPage />)
  await act(async () => {
    await Promise.resolve()
  })
  return bridge
}

describe('UpdatesPage', () => {
  it('says what off means, then offers the switch that turns checks back on', async () => {
    const bridge = await renderPage(false)
    expect(screen.getByText('Update checks are off')).toBeTruthy()
    expect(screen.getByText(/makes no update requests and never contacts alpineshell\.com on its own for anything/)).toBeTruthy()
    expect(screen.queryByText("You're up to date")).toBeNull()

    fireEvent.click(screen.getByRole('switch', { name: 'Check for updates' }))
    expect(bridge.setPreferences).toHaveBeenCalledWith({ checkForUpdates: true })

    act(() => bridge.preferenceListeners.forEach((listener) => listener({ checkForUpdates: true })))
    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.getByText("You're up to date")).toBeTruthy()
    expect(screen.getByText(/about every six hours, sending only its licence token/)).toBeTruthy()
  })
})
