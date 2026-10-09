import { afterEach, describe, it, expect, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'

import { settingsPage } from '../../settings/registry'
import SystemRevertPage from './systemRevertPage'

const INSTALL_REVERTS = ['Revert until next sign-in', 'Revert permanently', 'Delete Alpine Shell']
const REVERT_DONE: RevertResult = { success: true, gpoBlocked: false, error: null, leftBehind: [] }

function installSetupBridge(testSession: boolean) {
  const bridge = {
    isTestSession: vi.fn(async () => testSession),
    endTestSession: vi.fn(async () => REVERT_DONE),
    revertTemporary: vi.fn(async () => REVERT_DONE),
    revertPermanent: vi.fn(async () => REVERT_DONE),
    uninstall: vi.fn(async () => REVERT_DONE),
  }
  ;(window as unknown as { setup: unknown }).setup = bridge
  return bridge
}

async function renderPage() {
  render(<SystemRevertPage />)
  await act(async () => {
    await Promise.resolve()
  })
}

afterEach(() => {
  delete (window as unknown as { setup?: unknown }).setup
  vi.unstubAllEnvs()
})

describe('SystemRevertPage', () => {
  it('heads itself with the label the breadcrumb and the search result read', async () => {
    installSetupBridge(false)
    await renderPage()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(settingsPage('revert')!.label)
  })

  it('offers the three ways back from an installed Alpine Shell', async () => {
    installSetupBridge(false)
    await renderPage()
    for (const label of INSTALL_REVERTS) expect(screen.getByText(label)).toBeTruthy()
    expect(screen.queryByText('Return to Windows')).toBeNull()
  })

  it('offers only Return to Windows during a test-out, and ends the test with it', async () => {
    vi.stubEnv('DEV', false)
    const bridge = installSetupBridge(true)
    await renderPage()
    for (const label of INSTALL_REVERTS) expect(screen.queryByText(label)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Return' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Return to Windows' }))
    })
    expect(bridge.endTestSession).toHaveBeenCalledTimes(1)
    expect(bridge.revertTemporary).not.toHaveBeenCalled()
    expect(screen.getByText('Switching to Windows Explorer…')).toBeTruthy()
  })
})
