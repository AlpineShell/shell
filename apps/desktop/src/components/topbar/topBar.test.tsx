import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'

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

beforeEach(() => {
  Object.assign(window, {
    topbar: {
      initialLayout: null,
      layout: () => new Promise(() => {}),
      onLayoutChanged: () => () => undefined,
    },
    launcher: { onShow: () => undefined, onHide: () => undefined },
    plugins: { onReload: () => () => undefined },
  })
})

describe('top bar structure', () => {
  it('renders the shipped rows in the shipped order', () => {
    const { container } = render(<TopBar />)
    const rows = Array.from(container.querySelectorAll('.z-10 > div')).map((row) =>
      Array.from(row.querySelectorAll('i')).map((el) => el.getAttribute('data-el'))
    )
    expect(rows).toEqual([
      ['system-menu', 'plugins-left', 'notice'],
      ['launcher'],
      ['tray', 'media', 'microphone', 'status', 'plugins-right', 'clock'],
    ])
    expect(container.querySelector('.z-10')?.children.length).toBe(3)
  })
})
