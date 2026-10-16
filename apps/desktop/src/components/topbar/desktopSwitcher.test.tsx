import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import DesktopSwitcher from './desktopSwitcher'
import DesktopsFace from './faces/desktopsFace'
import DesktopLinesFace from './faces/desktopLinesFace'

const MIDDLE_BUTTON = 1

let switchTo: ReturnType<typeof vi.fn>
let add: ReturnType<typeof vi.fn>
let close: ReturnType<typeof vi.fn>
let desktopsState: VirtualDesktopsState
let onlyWithSeveral: boolean
let announceChange: (state: VirtualDesktopsState) => void
let announceOnlyWithSeveral: (value: boolean) => void

beforeEach(() => {
  switchTo = vi.fn().mockResolvedValue({ count: 3, current: 2 })
  add = vi.fn().mockResolvedValue({ count: 4, current: 3 })
  close = vi.fn().mockResolvedValue({ count: 2, current: 0 })
  desktopsState = { count: 3, current: 1 }
  onlyWithSeveral = false
  Object.assign(window, {
    shell: {
      desktops: {
        state: vi.fn(() => Promise.resolve(desktopsState)),
        onChanged: (callback: (state: VirtualDesktopsState) => void) => {
          announceChange = callback
          return () => undefined
        },
        switchTo,
        add,
        close,
        onlyWithSeveral: vi.fn(() => Promise.resolve(onlyWithSeveral)),
        onOnlyWithSeveralChanged: (callback: (value: boolean) => void) => {
          announceOnlyWithSeveral = callback
          return () => undefined
        },
        setOnlyWithSeveral: vi.fn(),
      },
    },
  })
})

function desktopButtons() {
  return screen.queryAllByRole('button', { name: /^Desktop/ })
}

async function renderSwitcher(look: 'numbers' | 'lines' = 'numbers') {
  const view = render(<DesktopSwitcher look={look} />)
  await act(async () => {})
  return view
}

describe('DesktopSwitcher', () => {
  it('numbers every desktop and marks the current one', async () => {
    await renderSwitcher()
    expect(desktopButtons().map((button) => button.textContent)).toEqual(['1', '2', '3'])
    expect(screen.getByRole('button', { name: 'Desktop 2' }).className).toContain('bg-white/20')
  })

  it('switches to the desktop that is clicked and adds one from +', async () => {
    await renderSwitcher()
    fireEvent.click(screen.getByRole('button', { name: 'Desktop 3' }))
    fireEvent.click(screen.getByRole('button', { name: 'New desktop' }))
    expect(switchTo).toHaveBeenCalledWith(2)
    expect(add).toHaveBeenCalledTimes(1)
  })

  it('closes the desktop that is middle-clicked, without switching to it', async () => {
    await renderSwitcher()
    const third = screen.getByRole('button', { name: 'Desktop 3' })
    fireEvent.mouseDown(third, { button: MIDDLE_BUTTON })
    fireEvent(third, new MouseEvent('auxclick', { bubbles: true, button: MIDDLE_BUTTON }))
    expect(close).toHaveBeenCalledWith(2)
    expect(switchTo).not.toHaveBeenCalled()
  })

  it('follows a switch made from the keyboard', async () => {
    await renderSwitcher()
    act(() => announceChange({ count: 2, current: 0 }))
    expect(desktopButtons()).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Desktop 1' }).className).toContain('bg-white/20')
  })

  it('stays on Ridge with one desktop by default', async () => {
    desktopsState = { count: 1, current: 0 }
    await renderSwitcher()
    expect(desktopButtons()).toHaveLength(1)
  })

  it('leaves Ridge with one desktop when it shows only with several, and comes back with a second', async () => {
    desktopsState = { count: 1, current: 0 }
    onlyWithSeveral = true
    await renderSwitcher()
    expect(desktopButtons()).toHaveLength(0)

    act(() => announceChange({ count: 2, current: 1 }))
    expect(desktopButtons()).toHaveLength(2)

    act(() => announceOnlyWithSeveral(false))
    act(() => announceChange({ count: 1, current: 0 }))
    expect(desktopButtons()).toHaveLength(1)
  })

  it('draws a line per desktop, switches on click and closes on middle-click', async () => {
    await renderSwitcher('lines')
    expect(desktopButtons()).toHaveLength(3)
    expect(screen.queryByRole('button', { name: 'New desktop' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Desktop 1' }))
    fireEvent(screen.getByRole('button', { name: 'Desktop 3' }), new MouseEvent('auxclick', { bubbles: true, button: MIDDLE_BUTTON }))
    expect(switchTo).toHaveBeenCalledWith(0)
    expect(close).toHaveBeenCalledWith(2)
  })
})

describe('the desktop faces without handlers', () => {
  it('draw the numbers without anything to press', () => {
    const { container } = render(<DesktopsFace desktops={{ count: 2, current: 1 }} darkText />)
    expect(container.querySelectorAll('button')).toHaveLength(0)
    expect(container.textContent).toBe('12')
  })

  it('draw the lines without anything to press, the current one marked', () => {
    const { container } = render(<DesktopLinesFace desktops={{ count: 3, current: 2 }} darkText={false} />)
    expect(container.querySelectorAll('button')).toHaveLength(0)
    const lines = Array.from(container.querySelectorAll('span > span'))
    expect(lines.map((line) => line.hasAttribute('data-current'))).toEqual([false, false, true])
  })
})
