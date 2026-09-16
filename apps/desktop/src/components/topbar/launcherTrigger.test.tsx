import { describe, it, expect, vi } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import type { ReactElement } from 'react'
import { ThemeProvider } from '../themeContext'
import LauncherFace from './faces/launcherFace'
import LauncherTrigger from './launcherTrigger'

type SearchIconListener = (visible: boolean) => void

let pushSearchIcon: SearchIconListener = () => {}
let removeSearchIconListener: ReturnType<typeof vi.fn>
let showLauncher: ReturnType<typeof vi.fn>

function stubBridges(searchIconShown: boolean) {
  removeSearchIconListener = vi.fn()
  showLauncher = vi.fn()
  Object.assign(window, {
    topbar: {
      searchIcon: vi.fn(() => Promise.resolve(searchIconShown)),
      onSearchIconChanged: vi.fn((listener: SearchIconListener) => {
        pushSearchIcon = listener
        return removeSearchIconListener
      }),
    },
    launcher: { show: showLauncher },
  })
}

function onBar(ui: ReactElement, darkText = false) {
  return (
    <ThemeProvider value={{ darkText, bg: 'rgb(31,32,32)', onMenuOpenChange: () => {} }}>
      {ui}
    </ThemeProvider>
  )
}

const searchButton = () => screen.queryByRole('button', { name: 'Search' })

describe('LauncherTrigger', () => {
  it('stays off the bar until the search icon flag turns on', async () => {
    stubBridges(false)
    render(onBar(<LauncherTrigger />))
    await act(async () => {})
    expect(searchButton()).toBeNull()

    act(() => pushSearchIcon(true))
    expect(searchButton()).not.toBeNull()
  })

  it('leaves the bar when the flag turns off', async () => {
    stubBridges(true)
    render(onBar(<LauncherTrigger />))
    await screen.findByRole('button', { name: 'Search' })

    act(() => pushSearchIcon(false))
    expect(searchButton()).toBeNull()
  })

  it.each([true, false])('wraps exactly the launcher face when darkText is %s', async (darkText) => {
    stubBridges(true)
    render(onBar(<LauncherTrigger />, darkText))
    const button = await screen.findByRole('button', { name: 'Search' })
    const face = render(<LauncherFace darkText={darkText} />).container
    expect(button.innerHTML).toBe(face.innerHTML)
  })

  it('opens the launcher when the pointer reaches it', async () => {
    stubBridges(true)
    render(onBar(<LauncherTrigger />))
    fireEvent.mouseEnter(await screen.findByRole('button', { name: 'Search' }))
    expect(showLauncher).toHaveBeenCalledTimes(1)
  })

  it('removes its flag listener when it unmounts', async () => {
    stubBridges(true)
    const { unmount } = render(onBar(<LauncherTrigger />))
    await screen.findByRole('button', { name: 'Search' })
    expect(removeSearchIconListener).not.toHaveBeenCalled()

    unmount()
    expect(removeSearchIconListener).toHaveBeenCalledTimes(1)
  })
})
