import { describe, expect, it } from 'vitest'
import { monitorForDisplay } from './displayBrightness'

function display(id: string, overrides: Partial<DisplayInfo> = {}): DisplayInfo {
  return {
    id,
    name: id,
    x: 0,
    y: 0,
    width: 1920,
    height: 1080,
    orientation: 0,
    refreshRate: 60,
    primary: false,
    ...overrides,
  }
}

function monitor(id: string, overrides: Partial<MonitorInfo> = {}): MonitorInfo {
  return {
    id,
    name: id,
    type: 'external',
    brightness: 50,
    brightnessWritable: true,
    ...overrides,
  }
}

describe('monitorForDisplay', () => {
  it('matches a monitor whose id is the same adapter device name', () => {
    const displays = [display('\\\\.\\DISPLAY1'), display('\\\\.\\DISPLAY2')]
    const monitors = [monitor('\\\\.\\DISPLAY2')]
    expect(monitorForDisplay(monitors, displays[1], displays)).toBe(monitors[0])
  })

  it('returns null for a display no monitor reports brightness for', () => {
    const displays = [display('\\\\.\\DISPLAY1'), display('\\\\.\\DISPLAY2')]
    const monitors = [monitor('\\\\.\\DISPLAY2')]
    expect(monitorForDisplay(monitors, displays[0], displays)).toBeNull()
  })

  it('pairs the built-in panel when exactly one display and one monitor are left over', () => {
    const displays = [display('\\\\.\\DISPLAY1'), display('\\\\.\\DISPLAY2')]
    const monitors = [monitor('\\\\.\\DISPLAY2'), monitor('internal', { type: 'internal' })]
    expect(monitorForDisplay(monitors, displays[0], displays)).toBe(monitors[1])
  })

  it('refuses to guess when more than one display is unmatched', () => {
    const displays = [display('\\\\.\\DISPLAY1'), display('\\\\.\\DISPLAY2')]
    const monitors = [monitor('internal', { type: 'internal' })]
    expect(monitorForDisplay(monitors, displays[0], displays)).toBeNull()
    expect(monitorForDisplay(monitors, displays[1], displays)).toBeNull()
  })

  it('refuses to guess when more than one monitor is unmatched', () => {
    const displays = [display('\\\\.\\DISPLAY1')]
    const monitors = [monitor('ddc-0'), monitor('ddc-1')]
    expect(monitorForDisplay(monitors, displays[0], displays)).toBeNull()
  })

  it('returns null when no monitors report brightness at all', () => {
    const displays = [display('\\\\.\\DISPLAY1')]
    expect(monitorForDisplay([], displays[0], displays)).toBeNull()
  })
})
