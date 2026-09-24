import { describe, expect, it } from 'vitest'
import { brightnessNeedsSubmenu, monitorBrightnessLabel } from './brightnessPresentation'

function monitor(over: Partial<MonitorInfo> = {}): MonitorInfo {
  return { id: 'internal', name: 'Built-in display', type: 'internal', brightness: 60, brightnessWritable: true, ...over }
}

describe('brightnessNeedsSubmenu', () => {
  it('keeps a single display as one slider', () => {
    expect(brightnessNeedsSubmenu([])).toBe(false)
    expect(brightnessNeedsSubmenu([monitor()])).toBe(false)
  })

  it('groups two or more displays behind one Brightness entry', () => {
    expect(brightnessNeedsSubmenu([monitor(), monitor({ id: 'dell', name: 'DELL U2720Q', type: 'external' })])).toBe(true)
  })
})

describe('monitorBrightnessLabel', () => {
  it('names the display', () => {
    expect(monitorBrightnessLabel(monitor({ name: 'DELL U2720Q' }))).toBe('DELL U2720Q')
  })

  it('says when a display does not respond to brightness changes', () => {
    expect(monitorBrightnessLabel(monitor({ name: 'DELL U2720Q', brightnessWritable: false }))).toBe('DELL U2720Q (not responding)')
  })
})
