import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import { render, waitFor } from '@testing-library/react'

vi.mock('./chrome/ChromeCanvas', () => ({ default: () => null }))
vi.mock('./launcherPanel', () => ({ default: () => null }))
vi.mock('./altTabPanel', () => ({ default: () => null }))
vi.mock('./noticeStrip', () => ({ default: () => null }))
vi.mock('./systemMenu', () => ({ default: () => <i data-el="system-menu" /> }))
vi.mock('./noticeStatus', () => ({ default: () => <i data-el="notice" /> }))
vi.mock('./launcherTrigger', () => ({ default: () => <i data-el="launcher" /> }))
vi.mock('./systemTray', () => ({ default: () => <i data-el="tray" /> }))
vi.mock('./status/mediaStatus', () => ({ default: () => <i data-el="media" /> }))
vi.mock('./status/microphoneStatus', () => ({ default: () => <i data-el="microphone" /> }))
vi.mock('./status/statusIndicator', () => ({ default: () => <i data-el="status" /> }))
vi.mock('./clock', () => ({ default: () => <i data-el="clock" /> }))
vi.mock('./pluginSlot', () => ({ default: ({ slot }: { slot: string }) => <i data-el={`plugins-${slot}`} /> }))
vi.mock('../../lib/emojiRenderable', () => ({ warmRenderableEmojis: () => undefined }))
vi.mock('../../plugins/loadPlugins', () => ({ loadTopbarPlugins: () => undefined }))
vi.mock('../../hooks/useTopbarColor', () => ({ useTopbarColor: () => null }))
vi.mock('../../hooks/useForegroundColor', () => ({ useForegroundColor: () => null }))

import TopBar from './topBar'

const CLUSTER_BOXES = [
  { left: 0, width: 90 },
  { left: 900, width: 120 },
  { left: 1500, width: 400 },
]

let setInteractiveZones: Mock<(zones: TopbarInteractiveZone[]) => void>

function barClusters() {
  return Array.from(document.querySelectorAll('.z-10 > div'))
}

function clusterRect(this: Element) {
  const { left, width } = CLUSTER_BOXES[barClusters().indexOf(this)] ?? { left: 0, width: 0 }
  return { left, right: left + width, width, top: 0, bottom: 24, height: 24, x: left, y: 0, toJSON: () => ({}) } as DOMRect
}

beforeEach(() => {
  setInteractiveZones = vi.fn()
  Object.assign(window, {
    topbar: {
      initialLayout: null,
      layout: () => new Promise(() => {}),
      onLayoutChanged: () => () => undefined,
      setInteractiveZones,
    },
    launcher: { onShow: () => undefined, onHide: () => undefined },
    plugins: { onReload: () => () => undefined },
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('top bar structure', () => {
  it('renders the shipped rows in the shipped order', () => {
    const { container } = render(<TopBar />)
    const rows = Array.from(container.querySelectorAll('.z-10 > div')).map((row) =>
      Array.from(row.querySelectorAll('i')).map((el) => el.getAttribute('data-el'))
    )
    expect(rows).toEqual([
      ['system-menu', 'plugins-left'],
      ['notice', 'launcher'],
      ['tray', 'media', 'microphone', 'status', 'plugins-right', 'clock'],
    ])
    expect(container.querySelector('.z-10')?.children.length).toBe(3)
  })

  it('keeps the notices first in the centre cluster whatever the layout puts there', () => {
    Object.assign(window.topbar, {
      initialLayout: { slots: { left: [], center: ['clock', 'launcher'], right: [] }, hidden: ['launcher'] },
    })
    const { container } = render(<TopBar />)
    const centre = container.querySelectorAll('.z-10 > div')[1]
    expect(Array.from(centre.querySelectorAll('i')).map((el) => el.getAttribute('data-el'))).toEqual([
      'notice',
      'clock',
    ])
  })

  it('spaces the centre cluster like its sides', () => {
    const { container } = render(<TopBar />)
    const rows = Array.from(container.querySelectorAll('.z-10 > div'))
    expect(rows.map((row) => row.classList.contains('gap-1'))).toEqual([true, true, true])
  })

  it('reports its three clusters, in bar order, as the zones that take clicks', async () => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(clusterRect)
    render(<TopBar />)

    await waitFor(() => expect(setInteractiveZones).toHaveBeenCalled())

    const zones = setInteractiveZones.mock.lastCall?.[0] ?? []
    expect(zones).toHaveLength(CLUSTER_BOXES.length)
    zones.forEach((zone, index) => {
      const box = CLUSTER_BOXES[index]
      expect(zone.left).toBeLessThanOrEqual(box.left)
      expect(zone.right).toBeGreaterThanOrEqual(box.left + box.width)
    })
  })
})
