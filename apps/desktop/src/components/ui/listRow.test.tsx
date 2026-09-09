import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

import ListRow from './listRow'

describe('ListRow', () => {
  it('renders the title, the detail line and the action cluster', () => {
    render(<ListRow title="Weather" detail="Live weather in your topbar." actions={<button>Remove</button>} />)
    expect(screen.getByText('Weather')).toBeTruthy()
    expect(screen.getByText('Live weather in your topbar.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Remove' })).toBeTruthy()
  })

  it('stays a plain row when there is nothing to activate', () => {
    const { container } = render(<ListRow title="Weather" actions={<button>Remove</button>} />)
    expect(container.querySelectorAll('button').length).toBe(1)
  })

  it('keeps the action cluster outside the activate button so nested buttons stay valid', () => {
    const { container } = render(
      <ListRow title="Weather" onActivate={() => undefined} actions={<button>Remove</button>} />,
    )
    const activate = container.querySelector('button')!
    expect(activate.querySelector('button')).toBeNull()
    expect(container.querySelectorAll('button').length).toBe(2)
  })

  it('calls onActivate when the row body is clicked', () => {
    const onActivate = vi.fn()
    render(<ListRow title="Weather" onActivate={onActivate} activateLabel="Open Weather" />)
    screen.getByRole('button', { name: 'Open Weather' }).click()
    expect(onActivate).toHaveBeenCalledOnce()
  })

  it('reports its expanded state only when it can expand', () => {
    const { container, rerender } = render(<ListRow title="Weather" onActivate={() => undefined} />)
    expect(container.querySelector('button')!.getAttribute('aria-expanded')).toBeNull()

    rerender(<ListRow title="Weather" onActivate={() => undefined} expanded={false} />)
    expect(container.querySelector('button')!.getAttribute('aria-expanded')).toBe('false')

    rerender(<ListRow title="Weather" onActivate={() => undefined} expanded />)
    expect(container.querySelector('button')!.getAttribute('aria-expanded')).toBe('true')
  })

  it('renders its children as a panel under the row', () => {
    const { container } = render(
      <ListRow title="Weather" actions={<button>Remove</button>}>
        <p>Cannot load this plugin.</p>
      </ListRow>,
    )
    const card = container.firstElementChild!
    expect(card.children.length).toBe(2)
    expect(card.lastElementChild!.textContent).toBe('Cannot load this plugin.')
  })
})
