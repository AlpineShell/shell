import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { settingsPageRoute } from '../../../settings/registry'
import { TOPBAR_SLOTS, findTopbarItem } from '../../topbar/layout/topbarLayout'
import { RIDGE_PRESENCE_NOTES } from './ridgeSamples'
import { absentRidgePreviewData, liveRidgePreviewData } from './ridgeTestFixtures'

let RidgeCallout: typeof import('./ridgeCallout').default
let ridgeItemEntries: typeof import('./ridgeItemCatalogue').ridgeItemEntries

const BRIDGE_ROOTS = ['shell', 'topbar', 'launcher']

function installBridges() {
  const clockPrefs = liveRidgePreviewData().clock.prefs
  const tray = {
    settings: vi.fn(() => Promise.resolve<TraySettings>({ enabled: true, showOverflow: true })),
    setSettings: vi.fn((partial: Partial<TraySettings>) => Promise.resolve({ enabled: true, showOverflow: true, ...partial })),
    onSettingsChanged: vi.fn(() => () => {}),
    display: vi.fn(() => Promise.resolve<TrayDisplaySetting>({ showOnAllMonitors: false, primaryDisplayId: 1 })),
    setDisplay: vi.fn((showOnAllMonitors: boolean) => Promise.resolve({ showOnAllMonitors, primaryDisplayId: 1 })),
    onDisplayChanged: vi.fn(() => () => {}),
  }
  const clock = {
    prefs: vi.fn(() => Promise.resolve(clockPrefs)),
    setPrefs: vi.fn((partial: Partial<ClockPrefs>) => Promise.resolve({ ...clockPrefs, ...partial })),
    onPrefsChanged: vi.fn(() => () => {}),
  }
  const system = {
    powerConfirm: vi.fn(() => Promise.resolve(true)),
    setPowerConfirm: vi.fn((value: boolean) => Promise.resolve(value)),
    onPowerConfirmChanged: vi.fn(() => () => {}),
  }
  const topbar = {
    mediaVisualizer: vi.fn(() => Promise.resolve(false)),
    setMediaVisualizer: vi.fn((value: boolean) => Promise.resolve(value)),
    onMediaVisualizerChanged: vi.fn(() => () => {}),
  }
  const launcher = {
    getHotkey: vi.fn(() => Promise.resolve('Win')),
    setHotkey: vi.fn((hotkey: string) => Promise.resolve({ ok: true, hotkey })),
    onHotkeyChanged: vi.fn(() => () => {}),
  }
  Object.assign(window, { shell: { tray, clock, system }, topbar, launcher })
  return { tray, topbar }
}

function renderCallout(id: TopbarItemId, overrides: Partial<RidgeCalloutProps> = {}) {
  const bridges = installBridges()
  const handlers = { onSide: vi.fn(), onStep: vi.fn(), onHide: vi.fn(), onNavigate: vi.fn(), onClose: vi.fn() }
  const slot = findTopbarItem(id)?.slot ?? 'right'
  render(
    <RidgeCallout
      item={{ id, slot, order: 0, visible: true }}
      previewData={liveRidgePreviewData()}
      highlightedSetting={null}
      sides={TOPBAR_SLOTS}
      canStepEarlier
      canStepLater
      {...handlers}
      {...overrides}
    />
  )
  return { ...bridges, ...handlers }
}

async function settle() {
  await act(async () => {})
}

function settingRow(id: string): Element {
  const row = document.querySelector(`[data-setting="${id}"]`)
  if (!row) throw new Error(`the callout drew no row for ${id}`)
  return row
}

function clockFollowingWindows(): RidgePreviewData {
  const live = liveRidgePreviewData()
  return { ...live, clock: { ...live.clock, prefs: { ...live.clock.prefs, timeFormat: 'auto', systemTimeFormat: '12h' } } }
}

beforeEach(async () => {
  vi.resetModules()
  RidgeCallout = (await import('./ridgeCallout')).default
  ridgeItemEntries = (await import('./ridgeItemCatalogue')).ridgeItemEntries
})

afterEach(() => {
  const bridges = window as unknown as Record<string, unknown>
  for (const root of BRIDGE_ROOTS) delete bridges[root]
})

describe('the callout header', () => {
  it('names the callout after the item, as Ridge labels it', async () => {
    renderCallout('tray')
    await settle()
    expect(screen.getByRole('region', { name: 'System tray settings' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 3 }).textContent).toBe('System tray')
  })

  it('closes from its Close button and on Escape', async () => {
    const { onClose } = renderCallout('clock')
    await settle()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    fireEvent.keyDown(screen.getByRole('button', { name: 'Move later' }), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('leaves other keys to the control that has focus', async () => {
    const { onClose } = renderCallout('clock')
    await settle()
    fireEvent.keyDown(screen.getByRole('button', { name: 'Move later' }), { key: 'Enter' })
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('the callout settings', () => {
  it('draws the System tray settings as the registry does', async () => {
    renderCallout('tray')
    await settle()
    expect(screen.getByRole('switch', { name: 'Show tray on all monitors' }).getAttribute('aria-checked')).toBe('false')
    expect(screen.getByRole('switch', { name: 'Show overflow arrow' }).getAttribute('aria-checked')).toBe('true')
  })

  it('shows the tray on every monitor through the tray bridge', async () => {
    const { tray } = renderCallout('tray')
    await settle()
    fireEvent.click(screen.getByRole('switch', { name: 'Show tray on all monitors' }))
    await settle()
    expect(tray.setDisplay).toHaveBeenCalledWith(true)
    expect(screen.getByRole('switch', { name: 'Show tray on all monitors' }).getAttribute('aria-checked')).toBe('true')
  })

  it('turns the media visualizer on from its switch', async () => {
    const { topbar } = renderCallout('media')
    await settle()
    fireEvent.click(screen.getByRole('switch', { name: 'Media visualizer' }))
    await settle()
    expect(topbar.setMediaVisualizer).toHaveBeenCalledWith(true)
  })

  it('carries the Search hotkey on the Search button callout', async () => {
    renderCallout('launcher')
    await settle()
    expect(screen.getByText('Search hotkey')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Win' })).toBeTruthy()
  })

  it('offers the time format, and says the clock follows Windows while it is automatic', async () => {
    renderCallout('clock', { previewData: clockFollowingWindows() })
    await settle()
    expect(screen.getByRole('radiogroup', { name: 'Time format' })).toBeTruthy()
    expect(screen.getByText('Following Windows (12-hour).')).toBeTruthy()
  })

  it('draws one row for each of its settings the registry holds', async () => {
    renderCallout('system-menu')
    await settle()
    expect(document.querySelectorAll('[data-setting]')).toHaveLength(ridgeItemEntries('system-menu').length)
  })

  it('rings the setting a search hit points at, and no other', async () => {
    renderCallout('tray', { highlightedSetting: 'tray-overflow' })
    await settle()
    expect(settingRow('tray-overflow').className).toContain('ring-1')
    expect(settingRow('tray-all-monitors').className).not.toContain('ring-1')
  })

  it('rings nothing while no search hit points into it', async () => {
    renderCallout('tray')
    await settle()
    expect(document.querySelectorAll('[data-setting].ring-1')).toHaveLength(0)
  })

  it('brings the ringed setting into view', async () => {
    const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView')
    renderCallout('tray', { highlightedSetting: 'tray-overflow' })
    await settle()
    expect(scrollIntoView.mock.contexts).toEqual([settingRow('tray-overflow')])
    scrollIntoView.mockRestore()
  })
})

describe('the callout links and notes', () => {
  it('opens the tray icons page, counting what is shown and hidden', async () => {
    const { onNavigate } = renderCallout('tray')
    await settle()
    const link = screen.getByRole('button', { name: /Manage tray icons/ })
    expect(link.textContent).toContain('2 shown, 1 hidden')
    fireEvent.click(link)
    expect(onNavigate).toHaveBeenCalledWith(settingsPageRoute('tray-icons'))
  })

  it('opens the Search page from the Search button callout', async () => {
    const { onNavigate } = renderCallout('launcher')
    await settle()
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    expect(onNavigate).toHaveBeenCalledWith(settingsPageRoute('search'))
  })

  it.each<[string, SettingsPageId]>([
    ['Wi-Fi', 'wifi'],
    ['Bluetooth', 'bluetooth'],
    ['Battery', 'battery'],
  ])('opens %s from the Status icons callout', async (label, page) => {
    const { onNavigate } = renderCallout('status')
    await settle()
    fireEvent.click(screen.getByRole('button', { name: label }))
    expect(onNavigate).toHaveBeenCalledWith(settingsPageRoute(page))
  })

  it('explains an item Ridge is only drawing a sample of', async () => {
    renderCallout('microphone', { previewData: absentRidgePreviewData() })
    await settle()
    expect(screen.getByText(RIDGE_PRESENCE_NOTES.microphone ?? '')).toBeTruthy()
  })

  it('has nothing to explain once the item is live', async () => {
    renderCallout('microphone')
    await settle()
    expect(screen.queryByText(RIDGE_PRESENCE_NOTES.microphone ?? '')).toBeNull()
  })
})

describe('the callout placement', () => {
  it('moves the item to another side, and ignores the side it is already on', async () => {
    const { onSide } = renderCallout('clock')
    await settle()
    expect(screen.getByRole('radio', { name: 'Right' }).getAttribute('aria-checked')).toBe('true')
    fireEvent.click(screen.getByRole('radio', { name: 'Left' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Right' }))
    expect(onSide).toHaveBeenCalledOnce()
    expect(onSide).toHaveBeenCalledWith('left')
  })

  it('steps the item later, and refuses to step past the start of its side', async () => {
    const { onStep } = renderCallout('clock', { canStepEarlier: false })
    await settle()
    const earlier = screen.getByRole('button', { name: 'Move earlier' })
    expect(earlier.hasAttribute('disabled')).toBe(true)
    fireEvent.click(earlier)
    fireEvent.click(screen.getByRole('button', { name: 'Move later' }))
    expect(onStep).toHaveBeenCalledOnce()
    expect(onStep).toHaveBeenCalledWith('later')
  })

  it('refuses to step past the end of its side', async () => {
    renderCallout('clock', { canStepLater: false })
    await settle()
    expect(screen.getByRole('button', { name: 'Move later' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: 'Move earlier' }).hasAttribute('disabled')).toBe(false)
  })

  it('hides the item', async () => {
    const { onHide } = renderCallout('media')
    await settle()
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }))
    expect(onHide).toHaveBeenCalledOnce()
  })

  it('tells a plugin group it stays on its own side, lists its widgets and opens Plugins', async () => {
    const { onNavigate } = renderCallout('plugins-right', { sides: ['right'] })
    await settle()
    expect(screen.queryByRole('radiogroup', { name: 'Side' })).toBeNull()
    expect(screen.getByText('Always on the right. Plugin groups stay on their own side.')).toBeTruthy()
    expect(screen.getByRole('list', { name: 'Plugin widgets' }).textContent).toBe('Notes')
    fireEvent.click(screen.getByRole('button', { name: 'Plugins' }))
    expect(onNavigate).toHaveBeenCalledWith(settingsPageRoute('plugins'))
  })
})
