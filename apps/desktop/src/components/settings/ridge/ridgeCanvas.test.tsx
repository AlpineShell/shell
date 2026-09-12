import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { useState, type ReactElement } from 'react'
import { EMPTY_TOPBAR_LAYOUT } from '../../topbar/layout/topbarLayout'
import { liveRidgePreviewData } from './ridgeTestFixtures'

let RidgeCanvas: typeof import('./ridgeCanvas').default
let useRidgeEditor: typeof import('../../../hooks/useRidgeEditor').useRidgeEditor
let resizeTo: (width: number) => void

const PREVIEW_DATA = liveRidgePreviewData()
const TRAY_SETTINGS: TraySettings = { enabled: true, showOverflow: true }

const box = (left: number, top: number, right: number, bottom: number): RidgeBox => ({ left, top, right, bottom })
const chipAt = (id: TopbarItemId, left: number, right: number): RidgeChipBox => ({ id, ...box(left, 4, right, 36) })

const STRIP_GEOMETRY: RidgeDragGeometry = {
  lanes: [
    {
      slot: 'left',
      ...box(0, 0, 300, 40),
      chips: [chipAt('system-menu', 4, 36), chipAt('plugins-left', 40, 72), chipAt('notice', 76, 200)],
    },
    { slot: 'center', ...box(300, 0, 400, 40), chips: [] },
    {
      slot: 'right',
      ...box(400, 0, 1000, 40),
      chips: [
        chipAt('tray', 404, 436),
        chipAt('media', 440, 472),
        chipAt('microphone', 476, 508),
        chipAt('status', 512, 544),
        chipAt('plugins-right', 548, 580),
        chipAt('clock', 900, 996),
      ],
    },
  ],
  hideZone: box(0, 60, 1000, 100),
}

function installBridges({ searchIcon = false, stored = EMPTY_TOPBAR_LAYOUT } = {}) {
  const topbar = {
    initialLayout: null,
    layout: vi.fn(() => Promise.resolve(stored)),
    setLayout: vi.fn((layout: StoredTopbarLayout) => Promise.resolve(layout)),
    onLayoutChanged: vi.fn(() => () => {}),
    searchIcon: vi.fn(() => Promise.resolve(searchIcon)),
    setSearchIcon: vi.fn((visible: boolean) => Promise.resolve(visible)),
    onSearchIconChanged: vi.fn(() => () => {}),
  }
  const tray = {
    settings: vi.fn(() => Promise.resolve(TRAY_SETTINGS)),
    setSettings: vi.fn((partial: Partial<TraySettings>) => Promise.resolve({ ...TRAY_SETTINGS, ...partial })),
    onSettingsChanged: vi.fn(() => () => {}),
  }
  Object.assign(window, { topbar, shell: { tray } })
  return { topbar, tray }
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

function CanvasHarness({
  measure,
  scrollContainer,
}: {
  measure?: () => RidgeDragGeometry
  scrollContainer?: () => HTMLElement | null
}) {
  const editor = useRidgeEditor()
  const [openItem, setOpenItem] = useState<TopbarItemId | null>(null)
  return (
    <RidgeCanvas
      editor={editor}
      previewData={PREVIEW_DATA}
      openItem={openItem}
      onOpenItemChange={setOpenItem}
      renderCallout={(id) => <p>Settings for {id}</p>}
      measure={measure}
      scrollContainer={scrollContainer ?? (() => null)}
    />
  )
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function mount(harness: ReactElement) {
  render(harness)
  await settle()
}

function chip(name: string): HTMLElement {
  return screen.getByRole('button', { name })
}

function laneOf(slot: TopbarSlot): HTMLElement {
  const lane = document.querySelector<HTMLElement>(`[data-ridge-lane="${slot}"]`)
  if (!lane) throw new Error(`no ${slot} lane rendered`)
  return lane
}

function chipsIn(slot: TopbarSlot): (string | null)[] {
  return within(laneOf(slot))
    .queryAllByRole('button')
    .map((button) => button.getAttribute('aria-label'))
}

function announced(): string {
  return (screen.getByRole('status').textContent ?? '').trim()
}

function hideZone(): HTMLElement {
  const zone = document.querySelector<HTMLElement>('[data-ridge-hide-zone]')
  if (!zone) throw new Error('no hide zone rendered')
  return zone
}

function layoutMode(): string | null {
  return document.querySelector('[data-layout-mode]')?.getAttribute('data-layout-mode') ?? null
}

function writtenLayout(setLayout: Mock): StoredTopbarLayout {
  return setLayout.mock.calls[0][0] as StoredTopbarLayout
}

function pressSpace(name: string) {
  fireEvent.keyDown(chip(name), { key: ' ' })
  fireEvent.keyUp(chip(name), { key: ' ' })
}

function pressKey(name: string, key: string) {
  fireEvent.keyDown(chip(name), { key })
}

function pressPointer(name: string, from: RidgePoint) {
  fireEvent.pointerDown(chip(name), { clientX: from.x, clientY: from.y, button: 0, pointerId: 1 })
}

function movePointer(to: RidgePoint) {
  fireEvent.pointerMove(document.body, { clientX: to.x, clientY: to.y, pointerId: 1 })
}

function releasePointer(at: RidgePoint) {
  fireEvent.pointerUp(document.body, { clientX: at.x, clientY: at.y, pointerId: 1 })
}

function dragChip(name: string, from: RidgePoint, to: RidgePoint) {
  pressPointer(name, from)
  movePointer(to)
  releasePointer(to)
}

beforeEach(async () => {
  vi.resetModules()
  resizeTo = stubResizeObserver()
  RidgeCanvas = (await import('./ridgeCanvas')).default
  useRidgeEditor = (await import('../../../hooks/useRidgeEditor')).useRidgeEditor
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  const bridges = window as unknown as { topbar?: unknown; shell?: unknown }
  delete bridges.topbar
  delete bridges.shell
})

describe('RidgeCanvas from the keyboard', () => {
  it('picks an item up with Space, carries it across two sides and writes once on the drop', async () => {
    const { topbar } = installBridges()
    await mount(<CanvasHarness />)

    chip('Notices').focus()
    pressSpace('Notices')
    pressKey('Notices', 'ArrowRight')
    pressKey('Notices', 'ArrowRight')
    expect(topbar.setLayout).not.toHaveBeenCalled()
    pressSpace('Notices')
    await settle()

    expect(topbar.setLayout).toHaveBeenCalledTimes(1)
    expect(writtenLayout(topbar.setLayout)).toEqual({
      slots: {
        left: ['system-menu', 'plugins-left'],
        center: ['launcher'],
        right: ['notice', 'tray', 'media', 'microphone', 'status', 'plugins-right', 'clock'],
      },
      hidden: [],
    })
    expect(announced()).toBe('Notices dropped, position 1 of 7 on the right.')
  })

  it('keeps focus on the item it carries into another side and says where it is', async () => {
    installBridges()
    await mount(<CanvasHarness />)

    chip('Notices').focus()
    pressSpace('Notices')
    pressKey('Notices', 'ArrowRight')

    expect(chipsIn('center')).toEqual(['Notices'])
    expect(document.activeElement).toBe(chip('Notices'))
    expect(announced()).toBe('Notices, position 1 of 1 in the center.')
  })

  it('drops with Enter while an item is picked up', async () => {
    const { topbar } = installBridges()
    await mount(<CanvasHarness />)

    pressSpace('Clock')
    pressKey('Clock', 'Home')
    pressKey('Clock', 'Enter')
    await settle()

    expect(topbar.setLayout).toHaveBeenCalledTimes(1)
    expect(writtenLayout(topbar.setLayout).slots.right[0]).toBe('clock')
    expect(chip('Clock').getAttribute('aria-expanded')).toBe('false')
  })

  it('puts the item back and writes nothing on Escape', async () => {
    const { topbar } = installBridges()
    await mount(<CanvasHarness />)

    chip('Notices').focus()
    pressSpace('Notices')
    pressKey('Notices', 'ArrowRight')
    pressKey('Notices', 'Escape')
    await settle()

    expect(topbar.setLayout).not.toHaveBeenCalled()
    expect(chipsIn('left')).toEqual(['Power menu', 'Left plugins', 'Notices'])
    expect(document.activeElement).toBe(chip('Notices'))
    expect(announced()).toBe('Notices returned to position 3 of 3 on the left.')
  })

  it('hides the Search button on Delete by turning off only its own flag', async () => {
    const { topbar, tray } = installBridges({ searchIcon: true })
    await mount(<CanvasHarness />)

    chip('Search button').focus()
    pressKey('Search button', 'Delete')
    await settle()

    expect(topbar.setSearchIcon).toHaveBeenCalledTimes(1)
    expect(topbar.setSearchIcon).toHaveBeenCalledWith(false)
    expect(topbar.setLayout).not.toHaveBeenCalled()
    expect(tray.setSettings).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Search button' })).toBeNull()
    expect(document.activeElement).toBe(chip('System tray'))
    expect(announced()).toBe('Search button hidden from Ridge.')
  })

  it('refuses to carry a plugin group off its own side, says why and writes nothing', async () => {
    const { topbar } = installBridges({
      stored: { slots: { left: ['system-menu', 'notice', 'plugins-left'], center: [], right: [] }, hidden: [] },
    })
    await mount(<CanvasHarness />)

    pressSpace('Left plugins')
    pressKey('Left plugins', 'ArrowRight')
    expect(announced()).toBe("Left plugins can't move to the center. Plugin groups stay on their own side.")
    pressSpace('Left plugins')
    await settle()

    expect(topbar.setLayout).not.toHaveBeenCalled()
    expect(chipsIn('left')).toEqual(['Power menu', 'Notices', 'Left plugins'])
  })

  it('moves focus along the bar with the arrow keys, as one Tab stop', async () => {
    installBridges()
    await mount(<CanvasHarness />)

    chip('Notices').focus()
    pressKey('Notices', 'ArrowRight')

    expect(document.activeElement).toBe(chip('System tray'))
    expect(screen.getAllByRole('button').filter((button) => button.tabIndex === 0)).toEqual([chip('System tray')])
  })
})

describe('RidgeCanvas under the pointer', () => {
  it('moves an item dragged onto another side, with one write', async () => {
    const { topbar } = installBridges()
    await mount(<CanvasHarness measure={() => STRIP_GEOMETRY} />)

    dragChip('Clock', { x: 950, y: 20 }, { x: 350, y: 20 })
    await settle()

    expect(topbar.setLayout).toHaveBeenCalledTimes(1)
    expect(writtenLayout(topbar.setLayout).slots.center).toEqual(['launcher', 'clock'])
    expect(chipsIn('center')).toEqual(['Clock'])
  })

  it('hides an item dropped on the hide zone', async () => {
    const { topbar } = installBridges()
    await mount(<CanvasHarness measure={() => STRIP_GEOMETRY} />)

    dragChip('Media', { x: 456, y: 20 }, { x: 500, y: 80 })
    await settle()

    expect(writtenLayout(topbar.setLayout).hidden).toEqual(['media'])
    expect(screen.queryByRole('button', { name: 'Media' })).toBeNull()
  })

  it('shows the hide zone only while an item is held, and Escape drops nothing', async () => {
    const { topbar } = installBridges()
    await mount(<CanvasHarness measure={() => STRIP_GEOMETRY} />)
    expect(hideZone().hasAttribute('data-active')).toBe(false)

    pressPointer('Media', { x: 456, y: 20 })
    movePointer({ x: 500, y: 80 })
    expect(hideZone().getAttribute('data-active')).toBe('true')
    expect(hideZone().getAttribute('data-targeted')).toBe('true')

    fireEvent.keyDown(document.body, { key: 'Escape' })
    releasePointer({ x: 500, y: 80 })
    await settle()

    expect(hideZone().hasAttribute('data-active')).toBe(false)
    expect(topbar.setLayout).not.toHaveBeenCalled()
    expect(chipsIn('right')).toContain('Media')
  })

  it('refuses a plugin group dropped on another side and says why', async () => {
    const { topbar } = installBridges()
    await mount(<CanvasHarness measure={() => STRIP_GEOMETRY} />)

    pressPointer('Right plugins', { x: 564, y: 20 })
    movePointer({ x: 350, y: 20 })
    expect(laneOf('center').getAttribute('data-drop-state')).toBe('refuse')
    releasePointer({ x: 350, y: 20 })
    await settle()

    expect(topbar.setLayout).not.toHaveBeenCalled()
    expect(announced()).toBe("Right plugins can't move to the center. Plugin groups stay on their own side.")
  })

  it('never opens a callout from the click that ends a drag', async () => {
    installBridges()
    await mount(<CanvasHarness measure={() => STRIP_GEOMETRY} />)

    dragChip('Clock', { x: 950, y: 20 }, { x: 350, y: 20 })
    await settle()
    act(() => chip('Clock').click())

    expect(chip('Clock').getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('Settings for clock')).toBeNull()
  })

  it('still opens the callout after a press that never travels far enough to drag', async () => {
    const { topbar } = installBridges()
    await mount(<CanvasHarness measure={() => STRIP_GEOMETRY} />)

    dragChip('Clock', { x: 950, y: 20 }, { x: 952, y: 21 })
    act(() => chip('Clock').click())

    expect(chip('Clock').getAttribute('aria-expanded')).toBe('true')
    expect(topbar.setLayout).not.toHaveBeenCalled()
  })

  it('scrolls the page while an item is held near its edge, and stops when the drag ends', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    installBridges()
    let scrolled = 0
    const scroller = document.createElement('div')
    Object.defineProperty(scroller, 'scrollTop', {
      get: () => scrolled,
      set: (value: number) => {
        scrolled = value
      },
    })
    scroller.getBoundingClientRect = () => ({ ...box(0, 0, 1000, 100), x: 0, y: 0, width: 1000, height: 100, toJSON: () => ({}) })
    await mount(<CanvasHarness measure={() => STRIP_GEOMETRY} scrollContainer={() => scroller} />)

    pressPointer('Clock', { x: 950, y: 20 })
    movePointer({ x: 950, y: 95 })
    act(() => vi.advanceTimersByTime(48))
    const scrolledWhileHeld = scrolled
    fireEvent.keyDown(document.body, { key: 'Escape' })
    act(() => vi.advanceTimersByTime(48))

    expect(scrolledWhileHeld).toBeGreaterThan(0)
    expect(scrolled).toBe(scrolledWhileHeld)
  })
})

describe('RidgeCanvas activation', () => {
  it('opens and closes the callout on a bare click, the way a screen reader or voice control sends it', async () => {
    installBridges()
    await mount(<CanvasHarness />)

    act(() => chip('Clock').click())
    const controlled = chip('Clock').getAttribute('aria-controls') ?? ''
    expect(chip('Clock').getAttribute('aria-expanded')).toBe('true')
    expect(document.getElementById(controlled)?.textContent).toBe('Settings for clock')
    expect(chip('Media').hasAttribute('aria-controls')).toBe(false)

    act(() => chip('Clock').click())
    expect(chip('Clock').getAttribute('aria-expanded')).toBe('false')
    expect(chip('Clock').hasAttribute('aria-controls')).toBe(false)
    expect(screen.queryByText('Settings for clock')).toBeNull()
  })

  it('picks the item up on Space and ignores the click that follows the key', async () => {
    installBridges()
    await mount(<CanvasHarness />)

    pressSpace('Clock')
    act(() => chip('Clock').click())

    expect(chip('Clock').getAttribute('data-grabbed')).toBe('true')
    expect(chip('Clock').getAttribute('aria-expanded')).toBe('false')
    expect(announced()).toBe('Clock picked up, position 6 of 6 on the right.')
  })

  it('closes the open callout on Escape from its item', async () => {
    installBridges()
    await mount(<CanvasHarness />)

    act(() => chip('Clock').click())
    expect(chip('Clock').getAttribute('aria-expanded')).toBe('true')
    pressKey('Clock', 'Escape')

    expect(chip('Clock').getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('Settings for clock')).toBeNull()
  })
})

describe('RidgeCanvas layout', () => {
  it('draws one strip on a wide canvas and stacks the sides at the 525px minimum', async () => {
    installBridges()
    await mount(<CanvasHarness />)

    resizeTo(1015)
    expect(layoutMode()).toBe('strip')
    resizeTo(525)
    expect(layoutMode()).toBe('stacked')
    expect(screen.getAllByRole('list')).toHaveLength(3)
  })

  it('keeps its mode when the page is hidden and reports a width of 0', async () => {
    installBridges()
    await mount(<CanvasHarness />)

    resizeTo(525)
    resizeTo(0)
    expect(layoutMode()).toBe('stacked')
    resizeTo(1015)
    resizeTo(0)
    expect(layoutMode()).toBe('strip')
  })
})
