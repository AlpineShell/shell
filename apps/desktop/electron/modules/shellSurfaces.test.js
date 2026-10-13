import { describe, it, expect, beforeEach } from 'vitest'
import shellSurfaces from './shellSurfaces.js'

const { setShells, isShellSurface, topBarForDisplay } = shellSurfaces

const PRIMARY = 1
const SECONDARY = 2

function fakeWindow(hwnd, { destroyed = false } = {}) {
  const handle = Buffer.alloc(8)
  handle.writeUInt32LE(hwnd, 0)
  return { isDestroyed: () => destroyed, getNativeWindowHandle: () => handle }
}

function shellsOf(entries) {
  return new Map(entries.map(([displayId, shell]) => [displayId, shell]))
}

describe('shellSurfaces', () => {
  beforeEach(() => setShells(null))

  it('knows no surfaces before the shell has started', () => {
    expect(isShellSurface(0x10)).toBe(false)
    expect(topBarForDisplay(PRIMARY)).toBe(null)
  })

  it("recognises every display's topbar and desktop window", () => {
    setShells(shellsOf([
      [PRIMARY, { topBar: fakeWindow(0x10), desktop: fakeWindow(0x11) }],
      [SECONDARY, { topBar: fakeWindow(0x20), desktop: fakeWindow(0x21) }],
    ]))
    for (const hwnd of [0x10, 0x11, 0x20, 0x21]) expect(isShellSurface(hwnd)).toBe(true)
  })

  it('does not claim app windows or a missing handle', () => {
    setShells(shellsOf([[PRIMARY, { topBar: fakeWindow(0x10), desktop: fakeWindow(0x11) }]]))
    expect(isShellSurface(0x99)).toBe(false)
    expect(isShellSurface(0)).toBe(false)
  })

  it('ignores surfaces that were destroyed when their display went away', () => {
    setShells(shellsOf([[PRIMARY, { topBar: fakeWindow(0x10, { destroyed: true }), desktop: fakeWindow(0x11) }]]))
    expect(isShellSurface(0x10)).toBe(false)
    expect(isShellSurface(0x11)).toBe(true)
  })

  it("returns a display's live topbar and nothing for a destroyed or unknown one", () => {
    const topBar = fakeWindow(0x10)
    setShells(shellsOf([
      [PRIMARY, { topBar, desktop: fakeWindow(0x11) }],
      [SECONDARY, { topBar: fakeWindow(0x20, { destroyed: true }), desktop: fakeWindow(0x21) }],
    ]))
    expect(topBarForDisplay(PRIMARY)).toBe(topBar)
    expect(topBarForDisplay(SECONDARY)).toBe(null)
    expect(topBarForDisplay(3)).toBe(null)
  })
})
