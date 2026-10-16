import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import DesktopSwitcher from './desktopSwitcher'
import DesktopsFace from './faces/desktopsFace'

let switchTo: ReturnType<typeof vi.fn>
let add: ReturnType<typeof vi.fn>
let announceChange: (state: VirtualDesktopsState) => void

beforeEach(() => {
  switchTo = vi.fn().mockResolvedValue({ count: 3, current: 2 })
  add = vi.fn().mockResolvedValue({ count: 4, current: 3 })
  Object.assign(window, {
    shell: {
      desktops: {
        state: vi.fn().mockResolvedValue({ count: 3, current: 1 }),
        onChanged: (callback: (state: VirtualDesktopsState) => void) => {
          announceChange = callback
          return () => undefined
        },
        switchTo,
        add,
        close: vi.fn(),
      },
    },
  })
})

describe('DesktopSwitcher', () => {
  it('numbers every desktop and marks the current one', async () => {
    render(<DesktopSwitcher />)
    await act(async () => {})
    expect(screen.getAllByRole('button', { name: /^Desktop/ }).map((button) => button.textContent)).toEqual(['1', '2', '3'])
    expect(screen.getByRole('button', { name: 'Desktop 2' }).className).toContain('bg-white/20')
  })

  it('switches to the desktop that is clicked and adds one from +', async () => {
    render(<DesktopSwitcher />)
    await act(async () => {})
    fireEvent.click(screen.getByRole('button', { name: 'Desktop 3' }))
    fireEvent.click(screen.getByRole('button', { name: 'New desktop' }))
    expect(switchTo).toHaveBeenCalledWith(2)
    expect(add).toHaveBeenCalledTimes(1)
  })

  it('follows a switch made from the keyboard', async () => {
    render(<DesktopSwitcher />)
    await act(async () => {})
    act(() => announceChange({ count: 2, current: 0 }))
    expect(screen.getAllByRole('button', { name: /^Desktop/ })).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Desktop 1' }).className).toContain('bg-white/20')
  })
})

describe('DesktopsFace', () => {
  it('draws the same numbers without anything to press when given no handlers', () => {
    const { container } = render(<DesktopsFace desktops={{ count: 2, current: 1 }} darkText />)
    expect(container.querySelectorAll('button')).toHaveLength(0)
    expect(container.textContent).toBe('12')
  })
})
