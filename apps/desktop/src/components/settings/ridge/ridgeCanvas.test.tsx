import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { createElement, useState, type ReactElement } from 'react'
import { EMPTY_TOPBAR_LAYOUT, TOPBAR_ITEMS, TOPBAR_SLOTS } from '../../topbar/layout/topbarLayout'
import { RIDGE_KEYBOARD_HINT } from './ridgeAnnouncements'
import { liveRidgePreviewData } from './ridgeTestFixtures'

let RidgeCanvas: typeof import('./ridgeCanvas').default
let useRidgeEditor: typeof import('../../../hooks/useRidgeEditor').useRidgeEditor
let pluginRegistry: typeof import('../../../plugins/pluginRegistry')
let resizeTo: (width: number) => void

const PREVIEW_DATA = liveRidgePreviewData()
const TRAY_SETTINGS: TraySettings = { enabled: true, showOverflow: true }
const ONLY_THE_CLOCK: StoredTopbarLayout = {
  ...EMPTY_TOPBAR_LAYOUT,
  hidden: TOPBAR_ITEMS.map((item) => item.id).filter((id) => id !== 'clock'),
}
const NARROW_CANVAS = 500
const WIDE_CANVAS = 2000
const NATURAL_STRIP_WIDTH = 1000

const box = (left: number, top: number, right: number, bottom: number): RidgeBox => ({ left, top, right, bottom })
const chipAt = (id: TopbarItemId, left: number, right: number): RidgeChipBox => ({ id, ...box(left, 4, right, 36) })
const domRect = ({ left, top, right, bottom }: RidgeBox): DOMRect => ({
  left,
  top,
  right,
  bottom,
  x: left,
  y: top,
  width: right - left,
  height: bottom - top,
  toJSON: () => ({}),
})

const STRIP_GEOMETRY: RidgeDragGeometry = {
  lanes: [
    {
      slot: 'left',
      ...box(0, 0, 300, 40),
      chips: [chipAt('system-menu', 4, 36), chipAt('plugins-left', 40, 72)],
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
  hideZone: null,
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

function registerLiveWidget(slot: TopbarSlot, text: string) {
  pluginRegistry.registerContribution({
    type: 'topbar-widget',
    id: `com.example.${text.toLowerCase()}:default`,
    component: () => createElement('span', null, text),
    slot,
  })
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
  onNothingLeftToFocus = () => {},
}: {
  measure?: () => RidgeDragGeometry
  scrollContainer?: () => HTMLElement | null
  onNothingLeftToFocus?: () => void
}) {
  const editor = useRidgeEditor()
  const [openItem, setOpenItem] = useState<TopbarItemId | null>(null)
  return (
    <RidgeCanvas
      editor={editor}
      previewData={PREVIEW_DATA}
      openItem={openItem}
      onOpenItemChange={setOpenItem}
      onNothingLeftToFocus={onNothingLeftToFocus}
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

function layoutMode(): string | null {
  return document.querySelector('[data-layout-mode]')?.getAttribute('data-layout-mode') ?? null
}

function strip(): HTMLElement {
  return screen.getByRole('group', { name: 'Ridge' })
}

function stripScale(): string {
  return strip().parentElement?.style.transform ?? ''
}

function isStripArea(element: Element): boolean {
  const stage = element.parentElement
  return stage !== null && stage.hasAttribute('data-layout-mode') && stage.children[1] === element
}

function precedesStrip(element: Element): boolean {
  return (strip().compareDocumentPosition(element) & Node.DOCUMENT_POSITION_PRECEDING) !== 0
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
  pluginRegistry = await import('../../../plugins/pluginRegistry')
  registerLiveWidget('left', 'Weather')
  registerLiveWidget('right', 'Notes')
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  pluginRegistry.clearWidgets()
  const bridges = window as unknown as { topbar?: unknown; shell?: unknown }
  delete bridges.topbar
  delete bridges.shell
})

describe('RidgeCanvas from the keyboard', () => {
  it('picks an item up with Space, carries it across two sides and writes once on the drop', async () => {
    const { topbar } = installBridges()
    await mount(<CanvasHarness />)

    chip('Power menu').focus()
    pressSpace('Power menu')
    pressKey('Power menu', 'ArrowRight')
    pressKey('Power menu', 'ArrowRight')
    pressKey('Power menu', 'ArrowRight')
    pressKey('Power menu', 'ArrowRight')
    expect(topbar.setLayout).not.toHaveBeenCalled()
    pressSpace('Power menu')
    await settle()

    expect(topbar.setLayout).toHaveBeenCalledTimes(1)
    expect(writtenLayout(topbar.setLayout)).toEqual({
      slots: {
        left: ['plugins-left', 'desktops'],
        center: ['launcher'],
        right: ['system-menu', 'tray', 'media', 'microphone', 'status', 'plugins-right', 'clock'],
      },
      hidden: [],
    })
    expect(announced()).toBe('Power menu dropped, position 1 of 7 on the right.')
  })

  it('keeps focus on the item it carries into another side and says where it is', async () => {
    installBridges()
    await mount(<CanvasHarness />)

    chip('Power menu').focus()
    pressSpace('Power menu')
    pressKey('Power menu', 'ArrowRight')
    pressKey('Power menu', 'ArrowRight')
    pressKey('Power menu', 'ArrowRight')

    expect(chipsIn('center')).toEqual(['Power menu'])
    expect(document.activeElement).toBe(chip('Power menu'))
    expect(announced()).toBe('Power menu, position 1 of 1 in the center.')
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

    chip('Power menu').focus()
    pressSpace('Power menu')
    pressKey('Power menu', 'ArrowRight')
    pressKey('Power menu', 'Escape')
    await settle()

    expect(topbar.setLayout).not.toHaveBeenCalled()
    expect(chipsIn('left')).toEqual(['Power menu', 'Weather', 'Desktops'])
    expect(document.activeElement).toBe(chip('Power menu'))
    expect(announced()).toBe('Power menu returned to position 1 of 3 on the left.')
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

  it('carries a plugin group onto another side like any other item', async () => {
    const { topbar } = installBridges()
    await mount(<CanvasHarness />)

    pressSpace('Weather')
    pressKey('Weather', 'ArrowRight')
    pressKey('Weather', 'ArrowRight')
    expect(chipsIn('center')).toEqual(['Weather'])
    pressSpace('Weather')
    await settle()

    expect(topbar.setLayout).toHaveBeenCalledTimes(1)
    expect(writtenLayout(topbar.setLayout).slots.left).toEqual(['system-menu', 'desktops'])
    expect(writtenLayout(topbar.setLayout).slots.center).toEqual(['launcher', 'plugins-left'])
  })

  it('moves focus along the bar with the arrow keys, as one Tab stop', async () => {
    installBridges()
    await mount(<CanvasHarness />)

    chip('Desktops').focus()
    pressKey('Desktops', 'ArrowRight')

    expect(document.activeElement).toBe(chip('System tray'))
    expect(screen.getAllByRole('button').filter((button) => button.tabIndex === 0)).toEqual([chip('System tray')])
  })

  it('hands focus out of the canvas when it hides the only item Ridge shows', async () => {
    const onNothingLeftToFocus = vi.fn()
    installBridges({ stored: ONLY_THE_CLOCK })
    await mount(<CanvasHarness onNothingLeftToFocus={onNothingLeftToFocus} />)

    chip('Clock').focus()
    pressKey('Clock', 'Delete')
    await settle()

    expect(screen.queryByRole('button', { name: 'Clock' })).toBeNull()
    expect(onNothingLeftToFocus).toHaveBeenCalledTimes(1)
    expect(announced()).toBe('Clock hidden from Ridge.')
  })

  it('puts a picked-up item back once focus leaves the items, for its callout or anything else', async () => {
    installBridges()
    await mount(<CanvasHarness />)
    act(() => chip('Clock').click())

    pressSpace('Clock')
    pressKey('Clock', 'Home')
    fireEvent.focusOut(chip('Clock'), { relatedTarget: screen.getByText('Settings for clock') })

    expect(chip('Clock').hasAttribute('data-grabbed')).toBe(false)
    expect(chipsIn('right').at(-1)).toBe('Clock')
    expect(announced()).toBe('Clock returned to position 6 of 6 on the right.')
  })

  it('keeps the item picked up while focus stays among the items', async () => {
    installBridges()
    await mount(<CanvasHarness />)

    pressSpace('Clock')
    fireEvent.focusOut(chip('Clock'), { relatedTarget: chip('Media') })
    fireEvent.focusOut(chip('Clock'), { relatedTarget: null })

    expect(chip('Clock').getAttribute('data-grabbed')).toBe('true')
  })

  it('describes the keys to assistive technology only, in a hint every item points at', async () => {
    installBridges()
    await mount(<CanvasHarness />)

    const hint = document.getElementById(chip('Clock').getAttribute('aria-describedby') ?? '')
    expect(hint?.textContent).toBe(RIDGE_KEYBOARD_HINT)
    expect(hint?.className.split(' ')).toContain('sr-only')
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

  it('drops nothing when an item is released outside every side', async () => {
    const { topbar } = installBridges()
    await mount(<CanvasHarness measure={() => STRIP_GEOMETRY} />)

    dragChip('Media', { x: 456, y: 20 }, { x: 500, y: 80 })
    await settle()

    expect(topbar.setLayout).not.toHaveBeenCalled()
    expect(chipsIn('right')).toContain('Media')
  })

  it('marks the side under a held item, draws no hide zone, and Escape drops nothing', async () => {
    const { topbar } = installBridges()
    await mount(<CanvasHarness measure={() => STRIP_GEOMETRY} />)

    pressPointer('Media', { x: 456, y: 20 })
    movePointer({ x: 350, y: 20 })
    expect(laneOf('center').getAttribute('data-drop-state')).toBe('accept')
    expect(document.querySelector('[data-ridge-hide-zone]')).toBeNull()

    fireEvent.keyDown(document.body, { key: 'Escape' })
    releasePointer({ x: 350, y: 20 })
    await settle()

    expect(laneOf('center').getAttribute('data-drop-state')).toBe('idle')
    expect(topbar.setLayout).not.toHaveBeenCalled()
    expect(chipsIn('right')).toContain('Media')
  })

  it('moves a plugin group dragged onto another side', async () => {
    const { topbar } = installBridges()
    await mount(<CanvasHarness measure={() => STRIP_GEOMETRY} />)

    pressPointer('Notes', { x: 564, y: 20 })
    movePointer({ x: 350, y: 20 })
    expect(laneOf('center').getAttribute('data-drop-state')).toBe('accept')
    releasePointer({ x: 350, y: 20 })
    await settle()

    expect(topbar.setLayout).toHaveBeenCalledTimes(1)
    expect(writtenLayout(topbar.setLayout).slots.center).toEqual(['launcher', 'plugins-right'])
    expect(chipsIn('center')).toEqual(['Notes'])
  })

  it('never opens a callout from the click that ends a drag', async () => {
    const { topbar } = installBridges()
    await mount(<CanvasHarness measure={() => STRIP_GEOMETRY} />)

    dragChip('Clock', { x: 950, y: 20 }, { x: 450, y: 20 })
    act(() => chip('Clock').click())
    await settle()

    expect(writtenLayout(topbar.setLayout).slots.right).toEqual([
      'tray',
      'clock',
      'media',
      'microphone',
      'status',
      'plugins-right',
    ])
    expect(chip('Clock').getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('Settings for clock')).toBeNull()
  })

  it.each<[string, RidgePoint, string]>([
    ['moved to another side', { x: 350, y: 20 }, 'Media'],
    ['released outside every side', { x: 500, y: 80 }, 'Clock'],
  ])('opens the next callout asked for after a drag whose own click reached no item: %s', async (_, droppedAt, next) => {
    installBridges()
    await mount(<CanvasHarness measure={() => STRIP_GEOMETRY} />)

    dragChip('Media', { x: 456, y: 20 }, droppedAt)
    await settle()
    act(() => chip(next).click())

    expect(chip(next).getAttribute('aria-expanded')).toBe('true')
  })

  it('opens the next callout asked for after a drag cancelled with Escape', async () => {
    installBridges()
    await mount(<CanvasHarness measure={() => STRIP_GEOMETRY} />)

    pressPointer('Media', { x: 456, y: 20 })
    movePointer({ x: 350, y: 20 })
    fireEvent.keyDown(document.body, { key: 'Escape' })
    releasePointer({ x: 350, y: 20 })
    await settle()
    act(() => chip('Clock').click())

    expect(chip('Clock').getAttribute('aria-expanded')).toBe('true')
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
    scroller.getBoundingClientRect = () => domRect(box(0, 0, 1000, 100))
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
  it('draws the three sides as one strip at every width, never stacking them', async () => {
    installBridges()
    await mount(<CanvasHarness />)

    for (const width of [1015, 525, 0]) {
      resizeTo(width)
      expect(layoutMode()).toBe('strip')
    }
    expect(screen.getAllByRole('list')).toHaveLength(3)
  })

  it('scales the strip down to fit a narrow canvas, and back to full size once it fits', async () => {
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(NATURAL_STRIP_WIDTH)
    installBridges()
    await mount(<CanvasHarness />)

    resizeTo(NARROW_CANVAS)
    expect(stripScale()).toMatch(/^scale\(0\.\d+\)$/)

    resizeTo(WIDE_CANVAS)
    expect(stripScale()).toBe('')
  })

  it('draws a plugin group only while a live widget fills it', async () => {
    installBridges()
    await mount(<CanvasHarness />)
    expect(chipsIn('left')).toEqual(['Power menu', 'Weather', 'Desktops'])

    act(() => pluginRegistry.clearWidgets())

    expect(chipsIn('left')).toEqual(['Power menu', 'Desktops'])
    expect(chipsIn('right')).not.toContain('Notes')
  })

  it('outlines the sides only while an item is picked up', async () => {
    installBridges()
    await mount(<CanvasHarness />)

    for (const slot of TOPBAR_SLOTS) expect(laneOf(slot).className).not.toContain('outline-dashed')

    pressSpace('Clock')

    for (const slot of TOPBAR_SLOTS) expect(laneOf(slot).className.split(' ')).toContain('outline-dashed')
  })

  it('opens the callout below Ridge while there is room for it there', async () => {
    installBridges()
    await mount(<CanvasHarness />)

    act(() => chip('Clock').click())

    expect(precedesStrip(screen.getByText('Settings for clock'))).toBe(false)
  })

  it('opens the callout above Ridge when only the room above holds it', async () => {
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(200)
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      if (this.hasAttribute('data-layout-mode')) return domRect(box(0, 0, 1000, 700))
      if (isStripArea(this)) return domRect(box(0, 500, 1000, 540))
      return domRect(box(0, 0, 0, 0))
    })
    const scroller = document.createElement('div')
    scroller.getBoundingClientRect = () => domRect(box(0, 0, 1000, 600))
    installBridges()
    await mount(<CanvasHarness scrollContainer={() => scroller} />)

    act(() => chip('Clock').click())

    expect(chip('Clock').getAttribute('aria-expanded')).toBe('true')
    expect(precedesStrip(screen.getByText('Settings for clock'))).toBe(true)
  })
})
