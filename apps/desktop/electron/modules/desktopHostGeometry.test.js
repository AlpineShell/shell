import { describe, it, expect } from 'vitest'
import desktopHostGeometry from './desktopHostGeometry.js'

const { rectInsideShellWindow, displayCenter } = desktopHostGeometry

describe('rectInsideShellWindow', () => {
  it('keeps a lone monitor at the origin', () => {
    const monitor = { left: 0, top: 0, right: 1440, bottom: 900 }
    expect(rectInsideShellWindow(monitor, { x: 0, y: 0 })).toEqual({ x: 0, y: 0, width: 1440, height: 900 })
  })

  it('places a monitor right of the primary at its own offset', () => {
    const secondary = { left: 2560, top: 0, right: 4480, bottom: 1080 }
    expect(rectInsideShellWindow(secondary, { x: 0, y: 0 })).toEqual({ x: 2560, y: 0, width: 1920, height: 1080 })
  })

  it('moves a monitor left of and above the primary into positive coordinates', () => {
    const leftMonitor = { left: -1920, top: -200, right: 0, bottom: 880 }
    expect(rectInsideShellWindow(leftMonitor, { x: -1920, y: -200 })).toEqual({ x: 0, y: 0, width: 1920, height: 1080 })
  })

  it('places the primary after a monitor that sits to its left', () => {
    const primary = { left: 0, top: 0, right: 3840, bottom: 2160 }
    expect(rectInsideShellWindow(primary, { x: -1920, y: -200 })).toEqual({ x: 1920, y: 200, width: 3840, height: 2160 })
  })
})

describe('displayCenter', () => {
  it('finds the middle of a display', () => {
    expect(displayCenter({ x: 0, y: 0, width: 1440, height: 900 })).toEqual({ x: 720, y: 450 })
  })

  it('rounds the middle of an odd-sized display left of the primary to whole pixels', () => {
    expect(displayCenter({ x: -1281, y: -1, width: 1281, height: 721 })).toEqual({ x: -640, y: 360 })
  })
})
