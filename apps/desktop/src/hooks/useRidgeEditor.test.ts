import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { EMPTY_TOPBAR_LAYOUT } from '../components/topbar/layout/topbarLayout'

let useRidgeEditor: typeof import('./useRidgeEditor').useRidgeEditor

const REFUSAL = new Error('The bar did not answer.')

function installBridges({ searchIcon = false, trayEnabled = true, stored = EMPTY_TOPBAR_LAYOUT } = {}) {
  const writes: string[] = []
  const topbar = {
    initialLayout: null,
    layout: vi.fn(() => Promise.resolve(stored)),
    setLayout: vi.fn((layout: StoredTopbarLayout) => {
      writes.push('layout')
      return Promise.resolve(layout)
    }),
    onLayoutChanged: vi.fn(() => () => {}),
    searchIcon: vi.fn(() => Promise.resolve(searchIcon)),
    setSearchIcon: vi.fn((visible: boolean) => {
      writes.push(`search ${visible ? 'on' : 'off'}`)
      return Promise.resolve(visible)
    }),
    onSearchIconChanged: vi.fn(() => () => {}),
  }
  const tray = {
    settings: vi.fn(() => Promise.resolve({ enabled: trayEnabled, showOverflow: true })),
    setSettings: vi.fn((partial: Partial<TraySettings>) => {
      writes.push(`tray ${partial.enabled ? 'on' : 'off'}`)
      return Promise.resolve({ enabled: trayEnabled, showOverflow: true, ...partial })
    }),
    onSettingsChanged: vi.fn(() => () => {}),
  }
  Object.assign(window, { topbar, shell: { tray } })
  return { topbar, tray, writes }
}

async function renderEditor() {
  const view = renderHook(() => useRidgeEditor())
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  return view
}

beforeEach(async () => {
  vi.resetModules()
  useRidgeEditor = (await import('./useRidgeEditor')).useRidgeEditor
})

afterEach(() => {
  const bridges = window as unknown as { topbar?: unknown; shell?: unknown }
  delete bridges.topbar
  delete bridges.shell
})

describe('useRidgeEditor', () => {
  it('shows an item only when its layout and its flag both do', async () => {
    installBridges({ searchIcon: false })
    const { result } = await renderEditor()

    expect(result.current.items.find((item) => item.id === 'launcher')?.visible).toBe(false)
    expect(result.current.layout.find((item) => item.id === 'launcher')?.visible).toBe(true)
  })

  it('moves an item without writing the flag-hidden Search button into the hidden list', async () => {
    const { topbar } = installBridges({ searchIcon: false })
    const { result } = await renderEditor()

    await act(() => result.current.move('clock', { slot: 'center', index: 0 }))

    expect(topbar.setLayout).toHaveBeenCalledWith({
      slots: {
        left: ['system-menu', 'plugins-left', 'desktops'],
        center: ['launcher', 'clock'],
        right: ['tray', 'media', 'microphone', 'status', 'plugins-right'],
      },
      hidden: [],
    })
  })

  it('writes nothing for an arrangement that comes back unchanged', async () => {
    const { topbar } = installBridges()
    const { result } = await renderEditor()

    let committed: boolean | undefined
    await act(async () => {
      committed = await result.current.commit(result.current.items)
    })

    expect(committed).toBe(true)
    expect(topbar.setLayout).not.toHaveBeenCalled()
  })

  it('shows a Search button hidden both ways by clearing the layout mark before turning its flag on', async () => {
    const { writes } = installBridges({ stored: { ...EMPTY_TOPBAR_LAYOUT, hidden: ['launcher'] } })
    const { result } = await renderEditor()

    let shown: boolean | undefined
    await act(async () => {
      shown = await result.current.show('launcher')
    })

    expect(shown).toBe(true)
    expect(writes).toEqual(['layout', 'search on'])
    expect(result.current.items.find((item) => item.id === 'launcher')?.visible).toBe(true)
  })

  it('leaves the flag alone when the layout write before it is refused', async () => {
    const { topbar } = installBridges({ stored: { ...EMPTY_TOPBAR_LAYOUT, hidden: ['launcher'] } })
    topbar.setLayout.mockRejectedValueOnce(REFUSAL)
    const { result } = await renderEditor()

    let shown: boolean | undefined
    await act(async () => {
      shown = await result.current.show('launcher')
    })

    expect(shown).toBe(false)
    expect(topbar.setSearchIcon).not.toHaveBeenCalled()
  })

  it('resets by turning the search flag off, writing the default layout, then turning the tray on', async () => {
    const { topbar, writes } = installBridges({
      searchIcon: true,
      trayEnabled: false,
      stored: { ...EMPTY_TOPBAR_LAYOUT, hidden: ['clock'] },
    })
    const { result } = await renderEditor()
    expect(result.current.isDefault).toBe(false)

    await act(() => result.current.reset())

    expect(writes).toEqual(['search off', 'layout', 'tray on'])
    expect(topbar.setLayout).toHaveBeenCalledWith(EMPTY_TOPBAR_LAYOUT)
    expect(result.current.isDefault).toBe(true)
  })

  it('stops a reset at the first refusal', async () => {
    const { topbar, tray, writes } = installBridges({ searchIcon: true, trayEnabled: false })
    topbar.setLayout.mockRejectedValueOnce(REFUSAL)
    const { result } = await renderEditor()

    let reset: boolean | undefined
    await act(async () => {
      reset = await result.current.reset()
    })

    expect(reset).toBe(false)
    expect(writes).toEqual(['search off'])
    expect(topbar.setLayout).toHaveBeenCalledTimes(1)
    expect(tray.setSettings).not.toHaveBeenCalled()
  })

  it('reports a flag write that was refused', async () => {
    const { topbar } = installBridges({ searchIcon: true })
    topbar.setSearchIcon.mockRejectedValueOnce(REFUSAL)
    const { result } = await renderEditor()

    let hidden: boolean | undefined
    await act(async () => {
      hidden = await result.current.hide('launcher')
    })

    expect(hidden).toBe(false)
    await waitFor(() => expect(result.current.error).toBe('Ridge could not save that change.'))
  })
})
