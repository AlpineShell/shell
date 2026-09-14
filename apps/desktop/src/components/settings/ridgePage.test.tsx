import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { settingsPage, settingsPageRoute } from '../../settings/registry'
import { EMPTY_TOPBAR_LAYOUT, TOPBAR_ITEMS } from '../topbar/layout/topbarLayout'
import { liveRidgePreviewData } from './ridge/ridgeTestFixtures'

let RidgePage: typeof import('./ridgePage').default
let highlightSetting: typeof import('../../hooks/useHighlightedSetting').highlightSetting
let resizeTo: (width: number) => void

const LIVE = liveRidgePreviewData()
const HIGHLIGHT_DURATION = 2500
const REFUSAL = new Error('The bar did not answer.')
const REFUSED_MESSAGE = 'Ridge could not save that change.'
const RESET_SETTING = 'ridge-layout-reset'
const BRIDGE_ROOTS = ['shell', 'topbar', 'launcher', 'plugins']
const CLOCK_HIDDEN: StoredTopbarLayout = { ...EMPTY_TOPBAR_LAYOUT, hidden: ['clock'] }
const MEDIA_HIDDEN: StoredTopbarLayout = { ...EMPTY_TOPBAR_LAYOUT, hidden: ['media'] }

const PREVIEW_READS: Record<string, unknown> = {
  'topbar.color': LIVE.color,
  'topbar.mediaVisualizer': false,
  'shell.clock.prefs': LIVE.clock.prefs,
  'shell.system.battery': LIVE.status.battery,
  'shell.system.bluetooth': LIVE.status.bluetooth,
  'shell.network.wifiSignal': LIVE.status.network,
  'shell.media.session': LIVE.media.playback,
  'shell.media.microphone': LIVE.microphone,
  'shell.tray.icons': [...LIVE.tray.visible, ...LIVE.tray.overflow],
  'shell.tray.layout': { order: [], hidden: [] },
  'shell.tray.display': { showOnAllMonitors: false, primaryDisplayId: 1 },
  'shell.system.powerConfirm': true,
  'launcher.getHotkey': 'Win',
  'plugins.list': [],
}

const SUBSCRIPTIONS = [
  'topbar.onColorChanged',
  'topbar.onMediaVisualizerChanged',
  'topbar.onLayoutChanged',
  'topbar.onSearchIconChanged',
  'shell.clock.onPrefsChanged',
  'shell.system.onResume',
  'shell.system.onBatteryChanged',
  'shell.system.onBluetoothChanged',
  'shell.system.onPowerConfirmChanged',
  'shell.network.onWifiSignalChanged',
  'shell.media.onSessionChanged',
  'shell.media.onMicrophoneChanged',
  'shell.tray.onIconsChanged',
  'shell.tray.onLayoutChanged',
  'shell.tray.onSettingsChanged',
  'shell.tray.onDisplayChanged',
  'launcher.onHotkeyChanged',
  'plugins.onReload',
]

const QUIET_WRITES = [
  'shell.clock.setPrefs',
  'shell.tray.setDisplay',
  'shell.system.setPowerConfirm',
  'topbar.setMediaVisualizer',
  'launcher.setHotkey',
]

const FORBIDDEN_BRIDGES = [
  'launcher.show',
  'shell.system.powerAction',
  'shell.tray.click',
  'shell.tray.setLayout',
  'shell.system.subscribePeak',
  'shell.network.wifiScan',
  'shell.network.wifiRadioGet',
  'shell.system.bluetoothRefresh',
  'shell.system.bluetoothConnect',
  'shell.system.bluetoothDisconnect',
  'shell.media.control',
  'shell.system.setVolume',
  'shell.system.setMonitorBrightness',
  'topbar.setActiveRegion',
  'topbar.setInteractiveZones',
]

function installBridge(path: string, bridge: Mock) {
  const keys = path.split('.')
  const owner = keys.slice(0, -1).reduce((node, key) => {
    node[key] ??= {}
    return node[key] as Record<string, unknown>
  }, window as unknown as Record<string, unknown>)
  owner[keys[keys.length - 1]] = bridge
}

function recordedWrite(writes: string[], label: string, value: unknown): Promise<unknown> {
  writes.push(label)
  return Promise.resolve(value)
}

function installBridges({ searchIcon = false, trayEnabled = true, stored = EMPTY_TOPBAR_LAYOUT } = {}) {
  const writes: string[] = []
  const traySettings: TraySettings = { enabled: trayEnabled, showOverflow: true }
  const reads = { ...PREVIEW_READS, 'topbar.layout': stored, 'topbar.searchIcon': searchIcon, 'shell.tray.settings': traySettings }
  const bridges = new Map<string, Mock>()
  for (const [path, value] of Object.entries(reads)) bridges.set(path, vi.fn().mockResolvedValue(value))
  for (const path of SUBSCRIPTIONS) bridges.set(path, vi.fn().mockImplementation(() => vi.fn()))
  for (const path of [...QUIET_WRITES, ...FORBIDDEN_BRIDGES]) bridges.set(path, vi.fn().mockResolvedValue(undefined))
  bridges.set('topbar.setLayout', vi.fn((layout: StoredTopbarLayout) => recordedWrite(writes, 'layout', layout)))
  bridges.set(
    'topbar.setSearchIcon',
    vi.fn((visible: boolean) => recordedWrite(writes, `search ${visible ? 'on' : 'off'}`, visible))
  )
  bridges.set(
    'shell.tray.setSettings',
    vi.fn((partial: Partial<TraySettings>) =>
      recordedWrite(writes, `tray ${partial.enabled ? 'on' : 'off'}`, { ...traySettings, ...partial })
    )
  )
  bridges.forEach((bridge, path) => installBridge(path, bridge))

  function spy(path: string): Mock {
    const bridge = bridges.get(path)
    if (!bridge) throw new Error(`no bridge installed at ${path}`)
    return bridge
  }

  return { spy, writes }
}

function stubResizeObserver(): (width: number) => void {
  const callbacks = new Set<ResizeObserverCallback>()
  class ResizeObserverStub {
    callback: ResizeObserverCallback
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback
    }
    observe() {
      callbacks.add(this.callback)
    }
    unobserve() {}
    disconnect() {
      callbacks.delete(this.callback)
    }
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  return (width) =>
    act(() => {
      const entry = { contentRect: { width } } as ResizeObserverEntry
      callbacks.forEach((callback) => callback([entry], {} as ResizeObserver))
    })
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function flushReads() {
  await act(async () => {})
}

async function openPage(): Promise<Mock> {
  const onNavigate = vi.fn()
  render(<RidgePage onNavigate={onNavigate} />)
  await settle()
  return onNavigate
}

function chip(name: string): HTMLElement {
  return screen.getByRole('button', { name })
}

async function openCallout(name: string): Promise<HTMLElement> {
  act(() => chip(name).click())
  await settle()
  return calloutFor(name)
}

function calloutFor(name: string): HTMLElement {
  return screen.getByRole('region', { name: `${name} settings` })
}

function expandedItems(): Element[] {
  return Array.from(document.querySelectorAll('[data-ridge-chip][aria-expanded="true"]'))
}

function settingRow(id: string): Element {
  const row = document.querySelector(`[data-setting="${id}"]`)
  if (!row) throw new Error(`the page drew nothing for ${id}`)
  return row
}

function laneItems(slot: TopbarSlot): (string | null)[] {
  const lane = document.querySelector<HTMLElement>(`[data-ridge-lane="${slot}"]`)
  if (!lane) throw new Error(`no ${slot} lane rendered`)
  return within(lane)
    .queryAllByRole('button')
    .map((button) => button.getAttribute('aria-label'))
}

function resetButton(): HTMLElement {
  return screen.getByRole('button', { name: 'Reset Ridge' })
}

function addButton(): HTMLElement {
  return screen.getByRole('button', { name: 'Add to Ridge' })
}

function lastWrittenLayout(setLayout: Mock): StoredTopbarLayout {
  return setLayout.mock.calls.at(-1)?.[0] as StoredTopbarLayout
}

function pressSpace(name: string) {
  fireEvent.keyDown(chip(name), { key: ' ' })
  fireEvent.keyUp(chip(name), { key: ' ' })
}

function pressKey(name: string, key: string) {
  fireEvent.keyDown(chip(name), { key })
}

function announced(): string {
  const canvas = document.querySelector<HTMLElement>('[data-layout-mode]')
  if (!canvas) throw new Error('no canvas rendered')
  return (within(canvas).getByRole('status').textContent ?? '').trim()
}

beforeEach(async () => {
  vi.resetModules()
  resizeTo = stubResizeObserver()
  RidgePage = (await import('./ridgePage')).default
  highlightSetting = (await import('../../hooks/useHighlightedSetting')).highlightSetting
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  const globals = window as unknown as Record<string, unknown>
  for (const root of BRIDGE_ROOTS) delete globals[root]
})

describe('the Ridge page header', () => {
  it('heads the page with the label the sidebar and the breadcrumb read', async () => {
    installBridges()
    await openPage()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(settingsPage('ridge')?.label ?? '')
  })

  it('opens Appearance for the color and theme', async () => {
    installBridges()
    const onNavigate = await openPage()
    fireEvent.click(screen.getByRole('button', { name: 'Color and theme' }))
    expect(onNavigate).toHaveBeenCalledWith(settingsPageRoute('appearance'))
  })
})

describe('search highlights on the Ridge page', () => {
  it('opens the Clock callout for a highlight made before the page opened', async () => {
    installBridges()
    act(() => highlightSetting('ridge-item-clock'))
    await openPage()

    expect(chip('Clock').getAttribute('aria-expanded')).toBe('true')
    expect(calloutFor('Clock')).toBeTruthy()
  })

  it('opens the Clock callout and rings Time format for a highlight made while the page is open', async () => {
    installBridges()
    await openPage()
    act(() => highlightSetting('clock-time-format'))
    await flushReads()

    expect(chip('Clock').getAttribute('aria-expanded')).toBe('true')
    expect(settingRow('clock-time-format').className).toContain('ring-1')
  })

  it('keeps the callout open when the highlight fades, taking only the ring away', async () => {
    installBridges()
    await openPage()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    act(() => highlightSetting('clock-time-format'))
    await flushReads()

    act(() => vi.advanceTimersByTime(HIGHLIGHT_DURATION))

    expect(chip('Clock').getAttribute('aria-expanded')).toBe('true')
    expect(settingRow('clock-time-format').className).not.toContain('ring-1')
  })

  it('opens no callout for a highlight that belongs to another page', async () => {
    installBridges()
    act(() => highlightSetting('theme'))
    await openPage()
    act(() => highlightSetting('wallpaper'))

    expect(expandedItems()).toEqual([])
  })

  it('focuses and rings Reset for a reset highlight made before the page opened', async () => {
    installBridges({ stored: CLOCK_HIDDEN })
    act(() => highlightSetting(RESET_SETTING))
    await openPage()

    expect(document.activeElement).toBe(resetButton())
    expect(settingRow(RESET_SETTING).className).toContain('ring-1')
    expect(expandedItems()).toEqual([])
  })

  it('focuses Reset for a reset highlight made while the page is open', async () => {
    installBridges({ stored: CLOCK_HIDDEN })
    await openPage()
    act(() => highlightSetting(RESET_SETTING))

    expect(document.activeElement).toBe(resetButton())
  })
})

describe('a search hit for an item Ridge is not showing', () => {
  it('says the item is hidden, and adding it back opens its callout on Ridge', async () => {
    const { spy } = installBridges({ stored: CLOCK_HIDDEN })
    act(() => highlightSetting('ridge-item-clock'))
    await openPage()

    const notice = calloutFor('Clock')
    expect(notice.textContent).toContain('Clock is hidden from Ridge.')
    expect(expandedItems()).toEqual([])
    fireEvent.click(within(notice).getByRole('button', { name: 'Add Clock to Ridge' }))
    await settle()

    expect(lastWrittenLayout(spy('topbar.setLayout')).hidden).toEqual([])
    expect(chip('Clock').getAttribute('aria-expanded')).toBe('true')
    expect(document.activeElement).toBe(chip('Clock'))
    expect(calloutFor('Clock').textContent).not.toContain('is hidden from Ridge')
  })

  it('points at the Search button, hidden by default, for a hit on its hotkey', async () => {
    installBridges({ searchIcon: false })
    act(() => highlightSetting('launcher-hotkey'))
    await openPage()

    expect(calloutFor('Search button').textContent).toContain('Search button is hidden from Ridge.')
  })

  it('closes on its Close button and hands focus to +', async () => {
    installBridges({ stored: CLOCK_HIDDEN })
    act(() => highlightSetting('ridge-item-clock'))
    await openPage()

    fireEvent.click(within(calloutFor('Clock')).getByRole('button', { name: 'Close' }))

    expect(screen.queryByRole('region', { name: 'Clock settings' })).toBeNull()
    expect(document.activeElement).toBe(addButton())
  })
})

describe('resetting Ridge', () => {
  it('offers no reset while Ridge is as it started', async () => {
    installBridges()
    await openPage()
    expect(resetButton().hasAttribute('disabled')).toBe(true)
  })

  it('asks once, then turns search off, writes the default layout and turns the tray on, in that order', async () => {
    const { spy, writes } = installBridges({ searchIcon: true, trayEnabled: false, stored: CLOCK_HIDDEN })
    await openPage()

    fireEvent.click(resetButton())
    await settle()
    expect(writes).toEqual([])
    fireEvent.click(screen.getByRole('button', { name: 'Reset to default' }))
    await settle()

    expect(writes).toEqual(['search off', 'layout', 'tray on'])
    expect(spy('topbar.setLayout')).toHaveBeenCalledWith(EMPTY_TOPBAR_LAYOUT)
    expect(spy('shell.tray.setSettings')).toHaveBeenCalledWith({ enabled: true })
    expect(resetButton().hasAttribute('disabled')).toBe(true)
    expect(document.activeElement).toBe(chip('Power menu'))
  })

  it('stops before the tray when the layout write is refused, and says so', async () => {
    const { spy, writes } = installBridges({ searchIcon: true, trayEnabled: false, stored: CLOCK_HIDDEN })
    spy('topbar.setLayout').mockRejectedValueOnce(REFUSAL)
    await openPage()

    fireEvent.click(resetButton())
    fireEvent.click(screen.getByRole('button', { name: 'Reset to default' }))
    await settle()

    expect(writes).toEqual(['search off'])
    expect(spy('topbar.setLayout')).toHaveBeenCalledTimes(1)
    expect(spy('shell.tray.setSettings')).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toBe(REFUSED_MESSAGE)
    expect(resetButton().hasAttribute('disabled')).toBe(false)
  })

  it('closes the open callout when it resets', async () => {
    installBridges({ stored: CLOCK_HIDDEN })
    await openPage()
    await openCallout('Media')

    fireEvent.click(resetButton())
    fireEvent.click(screen.getByRole('button', { name: 'Reset to default' }))
    await settle()

    expect(expandedItems()).toEqual([])
  })
})

describe("bringing items back with '+'", () => {
  it('lists what Ridge is not showing, and puts the chosen item back where it was, focused and open', async () => {
    const { spy } = installBridges({ stored: MEDIA_HIDDEN })
    await openPage()
    expect(screen.queryByRole('button', { name: 'Media' })).toBeNull()

    fireEvent.click(addButton())
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['Search button', 'Media'])
    fireEvent.click(screen.getByRole('option', { name: 'Media' }))
    await settle()

    expect(lastWrittenLayout(spy('topbar.setLayout')).hidden).toEqual([])
    expect(laneItems('right')).toEqual(['System tray', 'Media', 'Microphone', 'Status icons', 'Right plugins', 'Clock'])
    expect(document.activeElement).toBe(chip('Media'))
    expect(chip('Media').getAttribute('aria-expanded')).toBe('true')
    expect(calloutFor('Media')).toBeTruthy()
    expect(screen.queryByRole('group', { name: 'Add to Ridge' })).toBeNull()
    expect(announced()).toBe('Media added, position 2 of 6 on the right.')
  })

  it('tells assistive technology whether its menu is open, and which menu that is', async () => {
    installBridges()
    await openPage()
    expect(addButton().getAttribute('aria-expanded')).toBe('false')
    expect(addButton().hasAttribute('aria-controls')).toBe(false)

    fireEvent.click(addButton())

    expect(addButton().getAttribute('aria-expanded')).toBe('true')
    const menu = document.getElementById(addButton().getAttribute('aria-controls') ?? '')
    expect(menu).toBe(screen.getByRole('group', { name: 'Add to Ridge' }))
  })

  it('brings the Search button back by turning its flag on, leaving the layout alone', async () => {
    const { spy } = installBridges({ searchIcon: false })
    await openPage()

    fireEvent.click(addButton())
    fireEvent.click(screen.getByRole('option', { name: 'Search button' }))
    await settle()

    expect(spy('topbar.setSearchIcon')).toHaveBeenCalledWith(true)
    expect(spy('topbar.setLayout')).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(chip('Search button'))
  })

  it('backs out on Escape and puts focus back on +', async () => {
    installBridges()
    await openPage()

    fireEvent.click(addButton())
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' })

    expect(screen.queryByRole('group', { name: 'Add to Ridge' })).toBeNull()
    expect(document.activeElement).toBe(addButton())
  })

  it('closes again from + itself', async () => {
    installBridges()
    await openPage()

    fireEvent.click(addButton())
    fireEvent.click(addButton())

    expect(screen.queryByRole('group', { name: 'Add to Ridge' })).toBeNull()
  })
})

describe('the callout on the Ridge page', () => {
  it('gives focus back to its item when it closes', async () => {
    installBridges()
    await openPage()
    const callout = await openCallout('Clock')

    fireEvent.click(within(callout).getByRole('button', { name: 'Close' }))

    expect(chip('Clock').getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(chip('Clock'))
  })

  it('hides its item and hands focus to the item after it', async () => {
    const { spy } = installBridges()
    await openPage()
    const callout = await openCallout('Media')

    fireEvent.click(within(callout).getByRole('button', { name: 'Hide' }))
    await settle()

    expect(lastWrittenLayout(spy('topbar.setLayout')).hidden).toEqual(['media'])
    expect(screen.queryByRole('button', { name: 'Media' })).toBeNull()
    expect(document.activeElement).toBe(chip('Microphone'))
    expect(announced()).toBe('Media hidden from Ridge.')
  })

  it('keeps a move made in the callout while its item is picked up on the keyboard', async () => {
    const { spy } = installBridges()
    await openPage()
    await openCallout('Clock')

    chip('Clock').focus()
    pressSpace('Clock')
    fireEvent.click(within(calloutFor('Clock')).getByRole('button', { name: 'Move earlier' }))
    await settle()
    pressSpace('Clock')
    pressSpace('Clock')
    await settle()

    expect(spy('topbar.setLayout')).toHaveBeenCalledTimes(1)
    expect(lastWrittenLayout(spy('topbar.setLayout')).slots.right).toEqual([
      'tray',
      'media',
      'microphone',
      'status',
      'clock',
      'plugins-right',
    ])
  })

  it('hands focus to the item before it when it hides the last item', async () => {
    installBridges()
    await openPage()
    const callout = await openCallout('Clock')

    fireEvent.click(within(callout).getByRole('button', { name: 'Hide' }))
    await settle()

    expect(document.activeElement).toBe(chip('Right plugins'))
  })

  it('moves its item to the near end of a side it joins from the right', async () => {
    const { spy } = installBridges()
    await openPage()
    const callout = await openCallout('Clock')

    fireEvent.click(within(callout).getByRole('radio', { name: 'Left' }))
    await settle()

    expect(lastWrittenLayout(spy('topbar.setLayout')).slots.left).toEqual(['system-menu', 'plugins-left', 'notice', 'clock'])
    expect(chip('Clock').getAttribute('aria-expanded')).toBe('true')
  })

  it('moves its item to the near end of a side it joins from the left', async () => {
    const { spy } = installBridges()
    await openPage()
    const callout = await openCallout('Notices')

    fireEvent.click(within(callout).getByRole('radio', { name: 'Right' }))
    await settle()

    expect(lastWrittenLayout(spy('topbar.setLayout')).slots.right[0]).toBe('notice')
  })

  it('steps its item along the bar, and never past the end', async () => {
    const { spy } = installBridges()
    await openPage()
    const callout = await openCallout('Clock')
    expect(within(callout).getByRole('button', { name: 'Move later' }).hasAttribute('disabled')).toBe(true)

    fireEvent.click(within(callout).getByRole('button', { name: 'Move earlier' }))
    await settle()

    expect(lastWrittenLayout(spy('topbar.setLayout')).slots.right).toEqual([
      'tray',
      'media',
      'microphone',
      'status',
      'clock',
      'plugins-right',
    ])
  })

  it('offers a plugin group no side but its own', async () => {
    installBridges()
    await openPage()
    const callout = await openCallout('Left plugins')

    expect(within(callout).queryByRole('radiogroup', { name: 'Side' })).toBeNull()
  })

  it('opens the pages it links to', async () => {
    installBridges()
    const onNavigate = await openPage()
    const callout = await openCallout('Clock')

    fireEvent.click(within(callout).getByRole('button', { name: settingsPage('calendar')?.label }))

    expect(onNavigate).toHaveBeenCalledWith(settingsPageRoute('calendar'))
  })
})

describe('what the Ridge page reads and calls', () => {
  it('reads media and microphone once, however the items move, the canvas changes shape or the page hides', async () => {
    const { spy } = installBridges()
    await openPage()
    resizeTo(1015)

    pressSpace('Media')
    pressKey('Media', 'ArrowLeft')
    pressKey('Media', 'ArrowLeft')
    pressSpace('Media')
    await settle()
    expect(laneItems('center')).toEqual(['Media'])

    resizeTo(525)
    resizeTo(0)
    resizeTo(1015)
    await openCallout('Media')

    expect(spy('topbar.setLayout')).toHaveBeenCalledTimes(1)
    expect(spy('shell.media.session')).toHaveBeenCalledTimes(1)
    expect(spy('shell.media.microphone')).toHaveBeenCalledTimes(1)
  })

  it('never calls a bridge that acts on the system, with every callout opened in turn', async () => {
    const { spy } = installBridges({ searchIcon: true })
    await openPage()

    for (const item of TOPBAR_ITEMS) await openCallout(item.label)

    for (const path of FORBIDDEN_BRIDGES) expect(spy(path)).not.toHaveBeenCalled()
  })
})
