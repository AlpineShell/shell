import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import RootErrorBoundary from './rootErrorBoundary'

const RELOAD_COUNT_KEY = 'alpine-root-reloads'

let reportRenderError: ReturnType<typeof vi.fn>
let reload: ReturnType<typeof vi.fn>

function Broken(): never {
  throw new Error('topbar exploded')
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  sessionStorage.clear()
  reportRenderError = vi.fn()
  reload = vi.fn()
  Object.assign(window, { shell: { reportRenderError } })
  vi.spyOn(window.location, 'reload').mockImplementation(reload)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  sessionStorage.clear()
})

describe('RootErrorBoundary', () => {
  it('renders its view while nothing fails', () => {
    const { getByText } = render(
      <RootErrorBoundary view="desktop">
        <p>wallpaper</p>
      </RootErrorBoundary>,
    )
    expect(getByText('wallpaper')).toBeTruthy()
  })

  it('reports a render error to the main process and lets the failure handler release the bar', () => {
    const onFailure = vi.fn()
    const { container } = render(
      <RootErrorBoundary view="topbar" onFailure={onFailure}>
        <Broken />
      </RootErrorBoundary>,
    )

    expect(container.innerHTML).toBe('')
    expect(reportRenderError).toHaveBeenCalledTimes(1)
    expect(reportRenderError.mock.calls[0][0]).toContain('topbar exploded')
    expect(onFailure).toHaveBeenCalledTimes(1)
  })

  it('reloads the window after a short delay and counts the reload', () => {
    render(
      <RootErrorBoundary view="topbar">
        <Broken />
      </RootErrorBoundary>,
    )

    expect(reload).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1000)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(sessionStorage.getItem(RELOAD_COUNT_KEY)).toBe('1')
  })

  it('stays blank instead of reloading a view that keeps failing', () => {
    sessionStorage.setItem(RELOAD_COUNT_KEY, '3')
    render(
      <RootErrorBoundary view="topbar">
        <Broken />
      </RootErrorBoundary>,
    )

    vi.advanceTimersByTime(60000)
    expect(reload).not.toHaveBeenCalled()
    expect(reportRenderError).toHaveBeenCalledTimes(1)
  })

  it('forgets earlier reloads once the view has stayed up for a minute', () => {
    sessionStorage.setItem(RELOAD_COUNT_KEY, '2')
    render(
      <RootErrorBoundary view="desktop">
        <p>wallpaper</p>
      </RootErrorBoundary>,
    )

    vi.advanceTimersByTime(60000)
    expect(sessionStorage.getItem(RELOAD_COUNT_KEY)).toBeNull()
  })
})
