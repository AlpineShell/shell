import { describe, it, expect } from 'vitest'
import topBarZOrder from './topBarZOrder.js'

const { HWND_BOTTOM, planPassiveTopBarOrder, isFullscreenForegroundForDisplay } = topBarZOrder

const PRIMARY = { left: 0, top: 0, right: 1920, bottom: 1080 }
const SECONDARY = { left: 1920, top: 0, right: 3840, bottom: 1080 }

function foreground(overrides) {
  return {
    exists: true,
    visible: true,
    minimized: false,
    shellSurface: false,
    className: 'UnrealWindow',
    bounds: PRIMARY,
    monitorBounds: PRIMARY,
    ...overrides,
  }
}

describe('planPassiveTopBarOrder', () => {
  it('sinks only the topbar when the desktop is hosted inside the shell window', () => {
    expect(planPassiveTopBarOrder({ topBarHandle: 101, desktopHandle: 202, desktopHosted: true })).toEqual([
      { hwnd: 101, insertAfter: HWND_BOTTOM },
    ])
  })

  it('sinks the unhosted desktop after the topbar so the desktop stays behind the ridge', () => {
    expect(planPassiveTopBarOrder({ topBarHandle: 101, desktopHandle: 202, desktopHosted: false })).toEqual([
      { hwnd: 101, insertAfter: HWND_BOTTOM },
      { hwnd: 202, insertAfter: HWND_BOTTOM },
    ])
  })

  it('sinks only the topbar when there is no desktop handle', () => {
    expect(planPassiveTopBarOrder({ topBarHandle: 101, desktopHandle: 0, desktopHosted: false })).toEqual([
      { hwnd: 101, insertAfter: HWND_BOTTOM },
    ])
  })

  it('sinks the shell window last so it never covers the ridge', () => {
    expect(planPassiveTopBarOrder({ topBarHandle: 101, desktopHandle: 202, desktopHosted: true, shellWindowHandle: 303 })).toEqual([
      { hwnd: 101, insertAfter: HWND_BOTTOM },
      { hwnd: 303, insertAfter: HWND_BOTTOM },
    ])
  })

  it('keeps an unhosted desktop between the ridge and the shell window', () => {
    expect(planPassiveTopBarOrder({ topBarHandle: 101, desktopHandle: 202, desktopHosted: false, shellWindowHandle: 303 })).toEqual([
      { hwnd: 101, insertAfter: HWND_BOTTOM },
      { hwnd: 202, insertAfter: HWND_BOTTOM },
      { hwnd: 303, insertAfter: HWND_BOTTOM },
    ])
  })

  it('does nothing when the topbar handle is missing', () => {
    expect(planPassiveTopBarOrder({ topBarHandle: 0, desktopHandle: 202, desktopHosted: false })).toEqual([])
  })
})

describe('isFullscreenForegroundForDisplay', () => {
  it('detects a borderless fullscreen game on the same display', () => {
    expect(isFullscreenForegroundForDisplay(foreground(), PRIMARY)).toBe(true)
  })

  it('detects an overhanging borderless fullscreen game on the same display', () => {
    expect(
      isFullscreenForegroundForDisplay(
        foreground({ bounds: { left: -8, top: -8, right: 1928, bottom: 1088 } }),
        PRIMARY
      )
    ).toBe(true)
  })

  it('does not block the ridge on a different display', () => {
    expect(isFullscreenForegroundForDisplay(foreground(), SECONDARY)).toBe(false)
  })

  it('detects a multi-monitor fullscreen game on both displays', () => {
    const spanning = foreground({ bounds: { left: 0, top: 0, right: 3840, bottom: 1080 } })
    expect(isFullscreenForegroundForDisplay(spanning, PRIMARY)).toBe(true)
    expect(isFullscreenForegroundForDisplay(spanning, SECONDARY)).toBe(true)
  })

  it('ignores a normal window filling only the work area', () => {
    expect(
      isFullscreenForegroundForDisplay(
        foreground({ bounds: { left: 0, top: 24, right: 1920, bottom: 1080 } }),
        PRIMARY
      )
    ).toBe(false)
  })

  it('ignores desktop host windows so clicking the wallpaper never blocks the ridge', () => {
    expect(isFullscreenForegroundForDisplay(foreground({ className: 'Progman' }), PRIMARY)).toBe(false)
    expect(isFullscreenForegroundForDisplay(foreground({ className: 'WorkerW' }), PRIMARY)).toBe(false)
  })

  it('ignores Alpine shell surfaces', () => {
    expect(isFullscreenForegroundForDisplay(foreground({ shellSurface: true }), PRIMARY)).toBe(false)
  })

  it('ignores hidden, minimized or missing foreground windows', () => {
    expect(isFullscreenForegroundForDisplay(foreground({ visible: false }), PRIMARY)).toBe(false)
    expect(isFullscreenForegroundForDisplay(foreground({ minimized: true }), PRIMARY)).toBe(false)
    expect(isFullscreenForegroundForDisplay(foreground({ exists: false }), PRIMARY)).toBe(false)
    expect(isFullscreenForegroundForDisplay(null, PRIMARY)).toBe(false)
  })
})
