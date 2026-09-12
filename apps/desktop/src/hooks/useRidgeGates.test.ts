import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

let useRidgeGates: typeof import('./useRidgeGates').useRidgeGates

function traySettings(enabled: boolean): TraySettings {
  return { enabled, showOverflow: true }
}

function installGateBridges(searchIcon: boolean, trayEnabled: boolean) {
  let pushSearchIcon: (visible: boolean) => void = () => {}
  const topbar = {
    searchIcon: vi.fn(() => Promise.resolve(searchIcon)),
    setSearchIcon: vi.fn((value: boolean) => Promise.resolve(value)),
    onSearchIconChanged: vi.fn((callback: (visible: boolean) => void) => {
      pushSearchIcon = callback
      return () => {}
    }),
  }
  const tray = {
    settings: vi.fn(() => Promise.resolve(traySettings(trayEnabled))),
    setSettings: vi.fn((partial: Partial<TraySettings>) =>
      Promise.resolve({ ...traySettings(trayEnabled), ...partial })
    ),
    onSettingsChanged: vi.fn(() => () => {}),
  }
  Object.assign(window, { topbar, shell: { tray } })
  return { topbar, tray, broadcastSearchIcon: (visible: boolean) => pushSearchIcon(visible) }
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

beforeEach(async () => {
  vi.resetModules()
  useRidgeGates = (await import('./useRidgeGates')).useRidgeGates
})

afterEach(() => {
  const bridges = window as unknown as { topbar?: unknown; shell?: unknown }
  delete bridges.topbar
  delete bridges.shell
})

describe('useRidgeGates', () => {
  it('reads the Search button and tray flags', async () => {
    installGateBridges(true, false)
    const { result } = renderHook(() => useRidgeGates())

    await waitFor(() => expect(result.current.visible).toEqual({ launcher: true, tray: false }))
  })

  it('starts from the registry defaults until the flags are read', () => {
    const { topbar, tray } = installGateBridges(true, false)
    topbar.searchIcon.mockImplementation(() => new Promise<boolean>(() => {}))
    tray.settings.mockImplementation(() => new Promise<TraySettings>(() => {}))
    const { result } = renderHook(() => useRidgeGates())

    expect(result.current.visible).toEqual({ launcher: false, tray: true })
  })

  it('follows a flag changed somewhere else', async () => {
    const { broadcastSearchIcon } = installGateBridges(false, true)
    const { result } = renderHook(() => useRidgeGates())
    await settle()

    act(() => broadcastSearchIcon(true))

    expect(result.current.visible.launcher).toBe(true)
  })

  it('hides the Search button by turning only its flag off', async () => {
    const { topbar, tray } = installGateBridges(true, true)
    const { result } = renderHook(() => useRidgeGates())
    await waitFor(() => expect(result.current.visible.launcher).toBe(true))

    let written: boolean | undefined
    await act(async () => {
      written = await result.current.setGate('launcher', false)
    })

    expect(written).toBe(true)
    expect(topbar.setSearchIcon).toHaveBeenCalledWith(false)
    expect(tray.setSettings).not.toHaveBeenCalled()
    expect(result.current.visible.launcher).toBe(false)
  })

  it('shows the tray by turning only its flag on', async () => {
    const { topbar, tray } = installGateBridges(false, false)
    const { result } = renderHook(() => useRidgeGates())
    await waitFor(() => expect(result.current.visible.tray).toBe(false))

    let written: boolean | undefined
    await act(async () => {
      written = await result.current.setGate('tray', true)
    })

    expect(written).toBe(true)
    expect(tray.setSettings).toHaveBeenCalledWith({ enabled: true })
    expect(topbar.setSearchIcon).not.toHaveBeenCalled()
    expect(result.current.visible.tray).toBe(true)
  })

  it('resolves false and keeps the stored flag when the write is refused', async () => {
    const { topbar } = installGateBridges(true, true)
    topbar.setSearchIcon.mockRejectedValueOnce(new Error('The bar did not answer.'))
    const { result } = renderHook(() => useRidgeGates())
    await waitFor(() => expect(result.current.visible.launcher).toBe(true))

    let written: boolean | undefined
    await act(async () => {
      written = await result.current.setGate('launcher', false)
    })

    expect(written).toBe(false)
    expect(result.current.visible.launcher).toBe(true)
  })

  it('keeps the same gates while the flags stay put', async () => {
    installGateBridges(true, false)
    const { result, rerender } = renderHook(() => useRidgeGates())
    await waitFor(() => expect(result.current.visible.launcher).toBe(true))
    const first = result.current

    rerender()

    expect(result.current).toBe(first)
  })
})
