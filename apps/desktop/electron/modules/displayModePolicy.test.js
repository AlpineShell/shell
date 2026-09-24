import { describe, expect, it } from 'vitest'
import displayModePolicy from './displayModePolicy.js'

const {
  DISPLAY_MODES,
  PATH_INFO_SIZE,
  modeForTopologyId,
  topologyFlagForMode,
  countConnectedTargets,
  planDisplayModeOptions,
  initialDisplayMode,
  stepDisplayMode,
  shouldApplyDisplayMode,
  displayModeKeyAction,
} = displayModePolicy

function pathBuffer(paths) {
  const buffer = Buffer.alloc(paths.length * PATH_INFO_SIZE)
  paths.forEach(({ adapterLow = 0x1234, adapterHigh = 0, targetId, available }, index) => {
    const base = index * PATH_INFO_SIZE
    buffer.writeUInt32LE(adapterLow, base + 20)
    buffer.writeInt32LE(adapterHigh, base + 24)
    buffer.writeUInt32LE(targetId, base + 28)
    buffer.writeUInt32LE(available ? 1 : 0, base + 60)
  })
  return buffer
}

function options(availableModes) {
  return DISPLAY_MODES.map(mode => ({ mode, available: availableModes.includes(mode) }))
}

describe('topology ids', () => {
  it('maps every Windows topology to its mode and back', () => {
    for (const mode of DISPLAY_MODES) expect(modeForTopologyId(topologyFlagForMode(mode))).toBe(mode)
    expect(topologyFlagForMode('internal')).toBe(0x1)
    expect(topologyFlagForMode('clone')).toBe(0x2)
    expect(topologyFlagForMode('extend')).toBe(0x4)
    expect(topologyFlagForMode('external')).toBe(0x8)
  })

  it('reports no mode for a topology it does not know', () => {
    expect(modeForTopologyId(0)).toBe(null)
    expect(modeForTopologyId(0x10)).toBe(null)
    expect(topologyFlagForMode('mirror')).toBe(null)
  })
})

describe('countConnectedTargets', () => {
  it('counts each connected screen once although every source lists it', () => {
    const paths = pathBuffer([
      { targetId: 1, available: true },
      { targetId: 2, available: true },
      { targetId: 1, available: true },
      { targetId: 2, available: true },
    ])
    expect(countConnectedTargets(paths, 4)).toBe(2)
  })

  it('leaves out outputs with nothing plugged in', () => {
    const paths = pathBuffer([
      { targetId: 1, available: true },
      { targetId: 2, available: false },
      { targetId: 3, available: false },
    ])
    expect(countConnectedTargets(paths, 3)).toBe(1)
  })

  it('tells screens on different adapters apart', () => {
    const paths = pathBuffer([
      { adapterLow: 0x10, targetId: 1, available: true },
      { adapterLow: 0x20, targetId: 1, available: true },
    ])
    expect(countConnectedTargets(paths, 2)).toBe(2)
  })

  it('never reads past the buffer when the count is larger than what was filled', () => {
    expect(countConnectedTargets(pathBuffer([{ targetId: 1, available: true }]), 5)).toBe(1)
  })
})

describe('planDisplayModeOptions', () => {
  it('offers every mode with a second screen connected', () => {
    expect(planDisplayModeOptions({ connectedTargets: 2, currentMode: 'extend' }).every(option => option.available)).toBe(true)
  })

  it('offers only the current mode with a single screen', () => {
    expect(planDisplayModeOptions({ connectedTargets: 1, currentMode: 'internal' })).toEqual(options(['internal']))
  })

  it('keeps the modes in the order Windows shows them', () => {
    expect(planDisplayModeOptions({ connectedTargets: 2, currentMode: null }).map(option => option.mode))
      .toEqual(['internal', 'clone', 'extend', 'external'])
  })
})

describe('initialDisplayMode', () => {
  it('starts on the mode the screens are in', () => {
    expect(initialDisplayMode(options(DISPLAY_MODES), 'extend')).toBe('extend')
  })

  it('starts on the first available mode when the current one is unknown', () => {
    expect(initialDisplayMode(options(['clone', 'extend']), null)).toBe('clone')
  })
})

describe('stepDisplayMode', () => {
  it('moves forward and wraps around', () => {
    const all = options(DISPLAY_MODES)
    expect(stepDisplayMode(all, 'internal', 1)).toBe('clone')
    expect(stepDisplayMode(all, 'external', 1)).toBe('internal')
  })

  it('moves backward and wraps around', () => {
    const all = options(DISPLAY_MODES)
    expect(stepDisplayMode(all, 'clone', -1)).toBe('internal')
    expect(stepDisplayMode(all, 'internal', -1)).toBe('external')
  })

  it('skips modes that are unavailable', () => {
    const some = options(['internal', 'extend'])
    expect(stepDisplayMode(some, 'internal', 1)).toBe('extend')
    expect(stepDisplayMode(some, 'extend', 1)).toBe('internal')
    expect(stepDisplayMode(some, 'internal', -1)).toBe('extend')
  })

  it('stays put when nothing else is available', () => {
    expect(stepDisplayMode(options(['internal']), 'internal', 1)).toBe('internal')
  })
})

describe('shouldApplyDisplayMode', () => {
  it('applies an available mode that differs from the current one', () => {
    expect(shouldApplyDisplayMode(options(DISPLAY_MODES), 'extend', 'clone')).toBe(true)
  })

  it('leaves the screens alone when the chosen mode is already current', () => {
    expect(shouldApplyDisplayMode(options(DISPLAY_MODES), 'extend', 'extend')).toBe(false)
  })

  it('never applies an unavailable or unknown mode', () => {
    expect(shouldApplyDisplayMode(options(['internal']), 'internal', 'extend')).toBe(false)
    expect(shouldApplyDisplayMode(options(DISPLAY_MODES), 'extend', 'mirror')).toBe(false)
  })
})

describe('displayModeKeyAction', () => {
  it('cycles with P like Windows, backwards with Shift+P', () => {
    expect(displayModeKeyAction(0x50, false)).toEqual({ action: 'next', swallow: true })
    expect(displayModeKeyAction(0x50, true)).toEqual({ action: 'previous', swallow: true })
  })

  it('cycles with the arrow keys', () => {
    expect(displayModeKeyAction(0x27, false).action).toBe('next')
    expect(displayModeKeyAction(0x28, false).action).toBe('next')
    expect(displayModeKeyAction(0x25, false).action).toBe('previous')
    expect(displayModeKeyAction(0x26, false).action).toBe('previous')
  })

  it('applies with Enter or Space and closes with Esc, keeping those keys from the app underneath', () => {
    expect(displayModeKeyAction(0x0D, false)).toEqual({ action: 'apply', swallow: true })
    expect(displayModeKeyAction(0x20, false)).toEqual({ action: 'apply', swallow: true })
    expect(displayModeKeyAction(0x1B, false)).toEqual({ action: 'dismiss', swallow: true })
  })

  it('lets modifiers through so Win+P can be pressed again', () => {
    for (const modifier of [0x10, 0x11, 0x12, 0x5B, 0x5C, 0xA0, 0xA1, 0xA2, 0xA3, 0xA4, 0xA5]) {
      expect(displayModeKeyAction(modifier, false)).toEqual({ action: 'ignore', swallow: false })
    }
  })

  it('closes on any other key and lets it through to its target', () => {
    expect(displayModeKeyAction(0x41, false)).toEqual({ action: 'dismiss', swallow: false })
    expect(displayModeKeyAction(0x09, false)).toEqual({ action: 'dismiss', swallow: false })
  })
})
