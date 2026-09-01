import { describe, it, expect } from 'vitest'
import processGovernorPolicy from './processGovernorPolicy.js'
import occlusionPolicy from './occlusionPolicy.js'

const {
  STATE_INTERACTIVE,
  STATE_VISIBLE,
  STATE_OCCLUDED,
  STATE_NAPPING,
  EXCLUSION_SHELL,
  EXCLUSION_AUDIO,
  EXCLUSION_PINNED,
  EXCLUSION_UNTOUCHABLE,
  EXCLUSION_BUSY_IO,
  EXCLUSION_FULLSCREEN,
  MEMORY_PRIORITY_NORMAL,
  MEMORY_PRIORITY_BELOW_NORMAL,
  MEMORY_PRIORITY_MEDIUM,
  MEMORY_PRIORITY_FLOOR,
  LEVER_NAMES,
  DEFAULT_CONFIG,
  CONFIG_LIMITS,
  NEUTRAL_LEVERS,
  mergeConfig,
  rankOf,
  highestState,
  windowState,
  rawStateForProcess,
  dwellForState,
  settleState,
  exclusionReason,
  elapsedSince,
  firstSightingState,
  survivingPreviousState,
  heldRecently,
  memoryPriorityForState,
  leversForState,
  groupWindowsByProcess,
  describeState,
  resolveGovernedProcesses,
  nextStateMap,
  leversDiffer,
  pendingLeverChanges,
  orphanedPids,
  isNeutral,
} = processGovernorPolicy

const {
  VISIBILITY_VISIBLE,
  VISIBILITY_OCCLUDED,
  VISIBILITY_HIDDEN,
  VISIBILITY_OFFSCREEN,
} = occlusionPolicy

const NOW = 1000000

const EVERY_STATE = [STATE_INTERACTIVE, STATE_VISIBLE, STATE_OCCLUDED, STATE_NAPPING]
const EVERY_REASON = [
  EXCLUSION_SHELL,
  EXCLUSION_PINNED,
  EXCLUSION_UNTOUCHABLE,
  EXCLUSION_AUDIO,
  EXCLUSION_FULLSCREEN,
  EXCLUSION_BUSY_IO,
]

const defaults = mergeConfig(null, null)
const enabledConfig = mergeConfig(null, { enabled: true })

function windowFor(pid, visibility) {
  return { pid, visibility }
}

function contextWith(overrides) {
  return {
    now: NOW,
    foregroundPid: -1,
    fullscreenPid: -1,
    memoryPressurePercent: 0,
    lastForegroundAt: new Map(),
    lastAudioAt: new Map(),
    ioRates: new Map(),
    shellPids: new Set(),
    pinnedPids: new Set(),
    untouchablePids: new Set(),
    ...overrides,
  }
}

describe('mergeConfig', () => {
  it('returns the defaults when nothing is supplied', () => {
    expect(mergeConfig(null, null)).toEqual(DEFAULT_CONFIG)
  })

  it('ships the governor switched off', () => {
    expect(DEFAULT_CONFIG.enabled).toBe(false)
    expect(mergeConfig(null, null).enabled).toBe(false)
    expect(mergeConfig(null, {}).enabled).toBe(false)
  })

  it('defaults the other switches off too', () => {
    expect(defaults.deepNap).toBe(false)
    expect(defaults.lowerMemoryPriority).toBe(false)
  })

  it('accepts each boolean field', () => {
    const merged = mergeConfig(null, { enabled: true, deepNap: true, lowerMemoryPriority: true })
    expect(merged.enabled).toBe(true)
    expect(merged.deepNap).toBe(true)
    expect(merged.lowerMemoryPriority).toBe(true)
  })

  it('ignores a non-boolean written into a boolean field', () => {
    expect(mergeConfig(null, { enabled: 'yes' }).enabled).toBe(false)
    expect(mergeConfig(null, { deepNap: 1 }).deepNap).toBe(false)
    expect(mergeConfig({ enabled: true }, { enabled: null }).enabled).toBe(true)
  })

  it('keeps every default inside its own limits', () => {
    for (const [key, [min, max]] of Object.entries(CONFIG_LIMITS)) {
      expect(DEFAULT_CONFIG[key]).toBeGreaterThanOrEqual(min)
      expect(DEFAULT_CONFIG[key]).toBeLessThanOrEqual(max)
    }
  })

  it('clamps every numeric field at both ends', () => {
    for (const [key, [min, max]] of Object.entries(CONFIG_LIMITS)) {
      expect(mergeConfig(null, { [key]: min - 1 })[key]).toBe(min)
      expect(mergeConfig(null, { [key]: max + 1 })[key]).toBe(max)
      expect(mergeConfig(null, { [key]: min })[key]).toBe(min)
      expect(mergeConfig(null, { [key]: max })[key]).toBe(max)
    }
  })

  it('falls back to the default for a non-numeric value', () => {
    for (const key of Object.keys(CONFIG_LIMITS)) {
      expect(mergeConfig(null, { [key]: 'soon' })[key]).toBe(DEFAULT_CONFIG[key])
      expect(mergeConfig(null, { [key]: Number.NaN })[key]).toBe(DEFAULT_CONFIG[key])
    }
  })

  it('treats null, false and an empty string as absent rather than as zero', () => {
    expect(mergeConfig(null, { memoryPressurePercent: null }).memoryPressurePercent).toBe(DEFAULT_CONFIG.memoryPressurePercent)
    expect(mergeConfig(null, { memoryPressurePercent: false }).memoryPressurePercent).toBe(DEFAULT_CONFIG.memoryPressurePercent)
    expect(mergeConfig(null, { memoryPressurePercent: [] }).memoryPressurePercent).toBe(DEFAULT_CONFIG.memoryPressurePercent)
    expect(mergeConfig(null, { occludedDwellMs: null }).occludedDwellMs).toBe(DEFAULT_CONFIG.occludedDwellMs)
    expect(mergeConfig(null, { occludedDwellMs: '  ' }).occludedDwellMs).toBe(DEFAULT_CONFIG.occludedDwellMs)
  })

  it('rounds a fractional value', () => {
    expect(mergeConfig(null, { audioHoldMs: 15000.6 }).audioHoldMs).toBe(15001)
    expect(mergeConfig(null, { memoryPressurePercent: 80.4 }).memoryPressurePercent).toBe(80)
  })

  it('tolerates a missing or non-object partial', () => {
    expect(mergeConfig(null, undefined)).toEqual(DEFAULT_CONFIG)
    expect(mergeConfig(null, 42)).toEqual(DEFAULT_CONFIG)
    expect(mergeConfig(null, 'enabled')).toEqual(DEFAULT_CONFIG)
    expect(mergeConfig(undefined, undefined)).toEqual(DEFAULT_CONFIG)
  })

  it('carries the current config forward when the partial says nothing', () => {
    expect(mergeConfig({ enabled: true, occludedDwellMs: 9000 }, {}).enabled).toBe(true)
    expect(mergeConfig({ enabled: true, occludedDwellMs: 9000 }, {}).occludedDwellMs).toBe(9000)
  })

  it('does not mutate the shared defaults', () => {
    mergeConfig(null, { enabled: true, nappingDwellMs: 12345 })
    expect(DEFAULT_CONFIG.enabled).toBe(false)
    expect(DEFAULT_CONFIG.nappingDwellMs).toBe(60000)
  })
})

describe('rankOf and highestState', () => {
  it('orders the four rungs from napping up to interactive', () => {
    expect(rankOf(STATE_NAPPING)).toBeLessThan(rankOf(STATE_OCCLUDED))
    expect(rankOf(STATE_OCCLUDED)).toBeLessThan(rankOf(STATE_VISIBLE))
    expect(rankOf(STATE_VISIBLE)).toBeLessThan(rankOf(STATE_INTERACTIVE))
  })

  it('treats an unknown state as visible', () => {
    expect(rankOf('bogus')).toBe(rankOf(STATE_VISIBLE))
    expect(rankOf(undefined)).toBe(rankOf(STATE_VISIBLE))
  })

  it('returns null for an empty list', () => {
    expect(highestState([])).toBe(null)
  })

  it('picks the highest rung present', () => {
    expect(highestState([STATE_NAPPING, STATE_VISIBLE, STATE_OCCLUDED])).toBe(STATE_VISIBLE)
    expect(highestState([STATE_OCCLUDED, STATE_INTERACTIVE])).toBe(STATE_INTERACTIVE)
    expect(highestState([STATE_NAPPING, STATE_NAPPING])).toBe(STATE_NAPPING)
    expect(highestState([STATE_OCCLUDED])).toBe(STATE_OCCLUDED)
  })
})

describe('windowState', () => {
  it('calls the foreground process interactive whatever its window looks like', () => {
    const context = contextWith({ foregroundPid: 10 })
    expect(windowState(windowFor(10, VISIBILITY_HIDDEN), context)).toBe(STATE_INTERACTIVE)
    expect(windowState(windowFor(10, VISIBILITY_OCCLUDED), context)).toBe(STATE_INTERACTIVE)
    expect(windowState(windowFor(10, VISIBILITY_VISIBLE), context)).toBe(STATE_INTERACTIVE)
  })

  it('maps each visibility onto its rung', () => {
    const context = contextWith({})
    expect(windowState(windowFor(10, VISIBILITY_VISIBLE), context)).toBe(STATE_VISIBLE)
    expect(windowState(windowFor(10, VISIBILITY_OCCLUDED), context)).toBe(STATE_OCCLUDED)
    expect(windowState(windowFor(10, VISIBILITY_HIDDEN), context)).toBe(STATE_NAPPING)
    expect(windowState(windowFor(10, VISIBILITY_OFFSCREEN), context)).toBe(STATE_NAPPING)
  })
})

describe('elapsedSince', () => {
  it('measures a forward run of the clock', () => {
    expect(elapsedSince(1000, 1500)).toBe(500)
    expect(elapsedSince(1000, 1000)).toBe(0)
  })

  it('refuses a stamp that is missing or not a finite number', () => {
    expect(elapsedSince(undefined, 1000)).toBe(null)
    expect(elapsedSince(null, 1000)).toBe(null)
    expect(elapsedSince('soon', 1000)).toBe(null)
    expect(elapsedSince(Number.NaN, 1000)).toBe(null)
    expect(elapsedSince(Number.POSITIVE_INFINITY, 1000)).toBe(null)
  })

  it('refuses a clock reading that is missing or not a finite number', () => {
    expect(elapsedSince(1000, undefined)).toBe(null)
    expect(elapsedSince(1000, null)).toBe(null)
    expect(elapsedSince(1000, Number.NaN)).toBe(null)
  })

  it('credits nothing when the wall clock has stepped backwards past the stamp', () => {
    expect(elapsedSince(2000, 1999)).toBe(null)
    expect(elapsedSince(2000, 0)).toBe(null)
    expect(elapsedSince(NOW, NOW - 3600000)).toBe(null)
  })
})

describe('heldRecently', () => {
  it('holds while the stamp is still inside the window', () => {
    expect(heldRecently(7, new Map([[7, 900]]), 1000, 100)).toBe(true)
    expect(heldRecently(7, new Map([[7, 1000]]), 1000, 100)).toBe(true)
  })

  it('lets go once the window has passed', () => {
    expect(heldRecently(7, new Map([[7, 899]]), 1000, 100)).toBe(false)
  })

  it('lets go of a stamp from the future rather than holding forever', () => {
    expect(heldRecently(7, new Map([[7, 1001]]), 1000, 100)).toBe(false)
    expect(heldRecently(7, new Map([[7, 1000000]]), 1000, 100)).toBe(false)
  })

  it('tolerates a missing map, an unknown process and an unusable stamp', () => {
    expect(heldRecently(7, undefined, 1000, 100)).toBe(false)
    expect(heldRecently(7, new Map(), 1000, 100)).toBe(false)
    expect(heldRecently(7, new Map([[7, 'now']]), 1000, 100)).toBe(false)
  })
})

describe('rawStateForProcess', () => {
  it('lets the highest rung of any one window carry the whole process', () => {
    const windows = [windowFor(10, VISIBILITY_OCCLUDED), windowFor(10, VISIBILITY_VISIBLE)]
    expect(rawStateForProcess(windows, 10, contextWith({}), defaults)).toBe(STATE_VISIBLE)
  })

  it('naps a process whose every window is hidden', () => {
    const windows = [windowFor(10, VISIBILITY_HIDDEN), windowFor(10, VISIBILITY_OFFSCREEN)]
    expect(rawStateForProcess(windows, 10, contextWith({}), defaults)).toBe(STATE_NAPPING)
  })

  it('naps a process that has no windows left', () => {
    expect(rawStateForProcess([], 10, contextWith({}), defaults)).toBe(STATE_NAPPING)
  })

  it('promotes a process still inside the interactive grace window', () => {
    const context = contextWith({
      lastForegroundAt: new Map([[10, NOW - (defaults.interactiveGraceMs - 1)]]),
    })
    expect(rawStateForProcess([windowFor(10, VISIBILITY_HIDDEN)], 10, context, defaults)).toBe(STATE_INTERACTIVE)
  })

  it('stops promoting once the grace window has elapsed', () => {
    const context = contextWith({
      lastForegroundAt: new Map([[10, NOW - defaults.interactiveGraceMs]]),
    })
    expect(rawStateForProcess([windowFor(10, VISIBILITY_OCCLUDED)], 10, context, defaults)).toBe(STATE_OCCLUDED)
  })

  it('refuses a foreground stamp from the future instead of pinning the process at interactive', () => {
    const context = contextWith({ lastForegroundAt: new Map([[10, NOW + 1]]) })
    expect(rawStateForProcess([windowFor(10, VISIBILITY_OCCLUDED)], 10, context, defaults)).toBe(STATE_OCCLUDED)
    const stepped = contextWith({ lastForegroundAt: new Map([[10, NOW + 3600000]]) })
    expect(rawStateForProcess([windowFor(10, VISIBILITY_HIDDEN)], 10, stepped, defaults)).toBe(STATE_NAPPING)
  })

  it('leaves a process with no foreground history on its window rung', () => {
    const context = contextWith({ lastForegroundAt: new Map([[99, NOW]]) })
    expect(rawStateForProcess([windowFor(10, VISIBILITY_VISIBLE)], 10, context, defaults)).toBe(STATE_VISIBLE)
  })

  it('reports the foreground process as interactive without consulting the grace window', () => {
    const context = contextWith({ foregroundPid: 10 })
    expect(rawStateForProcess([windowFor(10, VISIBILITY_HIDDEN)], 10, context, defaults)).toBe(STATE_INTERACTIVE)
  })
})

describe('dwellForState', () => {
  it('waits out the configured dwell before stepping down', () => {
    expect(dwellForState(STATE_OCCLUDED, defaults)).toBe(defaults.occludedDwellMs)
    expect(dwellForState(STATE_NAPPING, defaults)).toBe(defaults.nappingDwellMs)
  })

  it('asks no dwell of the upper rungs', () => {
    expect(dwellForState(STATE_VISIBLE, defaults)).toBe(0)
    expect(dwellForState(STATE_INTERACTIVE, defaults)).toBe(0)
  })

  it('falls back to the shipped dwell when the config carries no dwell at all', () => {
    expect(dwellForState(STATE_OCCLUDED, {})).toBe(DEFAULT_CONFIG.occludedDwellMs)
    expect(dwellForState(STATE_NAPPING, {})).toBe(DEFAULT_CONFIG.nappingDwellMs)
    expect(dwellForState(STATE_OCCLUDED, undefined)).toBe(DEFAULT_CONFIG.occludedDwellMs)
    expect(dwellForState(STATE_NAPPING, null)).toBe(DEFAULT_CONFIG.nappingDwellMs)
  })

  it('falls back to the shipped dwell for a value that is not a finite number', () => {
    expect(dwellForState(STATE_OCCLUDED, { occludedDwellMs: Number.NaN })).toBe(DEFAULT_CONFIG.occludedDwellMs)
    expect(dwellForState(STATE_OCCLUDED, { occludedDwellMs: null })).toBe(DEFAULT_CONFIG.occludedDwellMs)
    expect(dwellForState(STATE_OCCLUDED, { occludedDwellMs: '20000' })).toBe(DEFAULT_CONFIG.occludedDwellMs)
    expect(dwellForState(STATE_NAPPING, { nappingDwellMs: Number.POSITIVE_INFINITY }))
      .toBe(DEFAULT_CONFIG.nappingDwellMs)
  })

  it('never hands back a dwell that would switch demotion off altogether', () => {
    for (const config of [{}, undefined, null, { occludedDwellMs: Number.NaN, nappingDwellMs: null }]) {
      for (const state of EVERY_STATE) {
        expect(Number.isFinite(dwellForState(state, config))).toBe(true)
      }
    }
  })
})

describe('firstSightingState', () => {
  it('clamps a first sighting up to visible so nothing is throttled on sight', () => {
    expect(firstSightingState(STATE_NAPPING)).toBe(STATE_VISIBLE)
    expect(firstSightingState(STATE_OCCLUDED)).toBe(STATE_VISIBLE)
  })

  it('leaves a first sighting that is already visible or above where it stands', () => {
    expect(firstSightingState(STATE_VISIBLE)).toBe(STATE_VISIBLE)
    expect(firstSightingState(STATE_INTERACTIVE)).toBe(STATE_INTERACTIVE)
  })
})

describe('settleState', () => {
  it('starts a first sighting at visible while recording the raw rung it was seen on', () => {
    expect(settleState(null, STATE_OCCLUDED, 500, defaults)).toEqual({
      state: STATE_VISIBLE,
      rawState: STATE_OCCLUDED,
      rawSince: 500,
      since: 500,
    })
    expect(settleState(null, STATE_NAPPING, 500, defaults)).toEqual({
      state: STATE_VISIBLE,
      rawState: STATE_NAPPING,
      rawSince: 500,
      since: 500,
    })
  })

  it('takes a first sighting at its own rung when it is already visible or above', () => {
    expect(settleState(null, STATE_VISIBLE, 500, defaults)).toEqual({
      state: STATE_VISIBLE,
      rawState: STATE_VISIBLE,
      rawSince: 500,
      since: 500,
    })
    expect(settleState(null, STATE_INTERACTIVE, 500, defaults)).toEqual({
      state: STATE_INTERACTIVE,
      rawState: STATE_INTERACTIVE,
      rawSince: 500,
      since: 500,
    })
  })

  it('makes a brand new process seen napping serve the napping dwell before it naps', () => {
    const firstSighting = settleState(null, STATE_NAPPING, 0, defaults)
    expect(firstSighting.state).toBe(STATE_VISIBLE)
    expect(settleState(firstSighting, STATE_NAPPING, defaults.nappingDwellMs - 1, defaults).state).toBe(STATE_VISIBLE)
    expect(settleState(firstSighting, STATE_NAPPING, defaults.nappingDwellMs, defaults).state).toBe(STATE_NAPPING)
  })

  it('makes a brand new process seen covered serve the occluded dwell before it is covered', () => {
    const firstSighting = settleState(null, STATE_OCCLUDED, 0, defaults)
    expect(firstSighting.state).toBe(STATE_VISIBLE)
    expect(settleState(firstSighting, STATE_OCCLUDED, defaults.occludedDwellMs - 1, defaults).state)
      .toBe(STATE_VISIBLE)
    expect(settleState(firstSighting, STATE_OCCLUDED, defaults.occludedDwellMs, defaults).state).toBe(STATE_OCCLUDED)
  })

  it('does not demote against a raw stamp that sits in the future', () => {
    const previous = { state: STATE_VISIBLE, rawState: STATE_OCCLUDED, rawSince: NOW + 3600000, since: 0 }
    const held = settleState(previous, STATE_OCCLUDED, NOW, defaults)
    expect(held.state).toBe(STATE_VISIBLE)
    expect(held.rawSince).toBe(NOW + 3600000)
  })

  it('demotes on the shipped dwell when the config is missing its dwell fields', () => {
    const partial = { interactiveGraceMs: 5000 }
    const seen = settleState(null, STATE_VISIBLE, 0, partial)
    const covered = settleState(seen, STATE_OCCLUDED, 0, partial)
    expect(covered.state).toBe(STATE_VISIBLE)
    expect(settleState(covered, STATE_OCCLUDED, DEFAULT_CONFIG.occludedDwellMs - 1, partial).state)
      .toBe(STATE_VISIBLE)
    expect(settleState(covered, STATE_OCCLUDED, DEFAULT_CONFIG.occludedDwellMs, partial).state).toBe(STATE_OCCLUDED)
  })

  it('applies an upgrade immediately even in the middle of a dwell', () => {
    const held = settleState(settleState(null, STATE_VISIBLE, 0, defaults), STATE_OCCLUDED, 1000, defaults)
    expect(held.state).toBe(STATE_VISIBLE)
    const upgraded = settleState(held, STATE_INTERACTIVE, 1500, defaults)
    expect(upgraded.state).toBe(STATE_INTERACTIVE)
    expect(upgraded.since).toBe(1500)
  })

  it('holds a downgrade until the dwell has elapsed', () => {
    const settled = settleState(null, STATE_VISIBLE, 0, defaults)
    const first = settleState(settled, STATE_OCCLUDED, 1000, defaults)
    expect(first.state).toBe(STATE_VISIBLE)
    expect(first.rawState).toBe(STATE_OCCLUDED)
    expect(first.rawSince).toBe(1000)
    const stillHeld = settleState(first, STATE_OCCLUDED, 1000 + defaults.occludedDwellMs - 1, defaults)
    expect(stillHeld.state).toBe(STATE_VISIBLE)
  })

  it('applies the downgrade exactly at the dwell boundary', () => {
    const settled = settleState(null, STATE_VISIBLE, 0, defaults)
    const first = settleState(settled, STATE_OCCLUDED, 1000, defaults)
    const atBoundary = settleState(first, STATE_OCCLUDED, 1000 + defaults.occludedDwellMs, defaults)
    expect(atBoundary.state).toBe(STATE_OCCLUDED)
    expect(atBoundary.since).toBe(1000 + defaults.occludedDwellMs)
  })

  it('steps down a rung with no dwell straight away', () => {
    const settled = settleState(null, STATE_INTERACTIVE, 0, defaults)
    expect(settleState(settled, STATE_VISIBLE, 0, defaults).state).toBe(STATE_VISIBLE)
  })

  it('resets the raw stamp whenever the raw state changes, so a flap never accumulates dwell', () => {
    const settled = settleState(null, STATE_VISIBLE, 0, defaults)
    const covered = settleState(settled, STATE_OCCLUDED, 1000, defaults)
    expect(covered.rawSince).toBe(1000)
    const uncovered = settleState(covered, STATE_VISIBLE, 15000, defaults)
    expect(uncovered.rawState).toBe(STATE_VISIBLE)
    expect(uncovered.rawSince).toBe(15000)
    const coveredAgain = settleState(uncovered, STATE_OCCLUDED, 16000, defaults)
    expect(coveredAgain.rawSince).toBe(16000)
    expect(coveredAgain.state).toBe(STATE_VISIBLE)
    const pastTheFirstCover = settleState(coveredAgain, STATE_OCCLUDED, 16000 + defaults.occludedDwellMs - 1, defaults)
    expect(pastTheFirstCover.state).toBe(STATE_VISIBLE)
  })

  it('moves the settled stamp only when the settled state itself changes', () => {
    const settled = settleState(null, STATE_VISIBLE, 0, defaults)
    const heldOnce = settleState(settled, STATE_OCCLUDED, 1000, defaults)
    expect(heldOnce.since).toBe(0)
    const stillVisible = settleState(heldOnce, STATE_VISIBLE, 5000, defaults)
    expect(stillVisible.state).toBe(STATE_VISIBLE)
    expect(stillVisible.since).toBe(0)
  })

  it('holds a nap for the longer napping dwell', () => {
    const seen = settleState(null, STATE_VISIBLE, 0, defaults)
    const covering = settleState(seen, STATE_OCCLUDED, 0, defaults)
    const covered = settleState(covering, STATE_OCCLUDED, defaults.occludedDwellMs, defaults)
    expect(covered.state).toBe(STATE_OCCLUDED)
    const held = settleState(covered, STATE_NAPPING, defaults.occludedDwellMs, defaults)
    expect(held.state).toBe(STATE_OCCLUDED)
    const dwellEnds = defaults.occludedDwellMs + defaults.nappingDwellMs
    expect(settleState(held, STATE_NAPPING, dwellEnds - 1, defaults).state).toBe(STATE_OCCLUDED)
    expect(settleState(held, STATE_NAPPING, dwellEnds, defaults).state).toBe(STATE_NAPPING)
  })
})

describe('exclusionReason', () => {
  it('finds no reason to leave an ordinary process alone', () => {
    expect(exclusionReason(10, contextWith({}), defaults)).toBe(null)
  })

  it('names each reason on its own', () => {
    expect(exclusionReason(10, contextWith({ shellPids: new Set([10]) }), defaults)).toBe(EXCLUSION_SHELL)
    expect(exclusionReason(10, contextWith({ pinnedPids: new Set([10]) }), defaults)).toBe(EXCLUSION_PINNED)
    expect(exclusionReason(10, contextWith({ untouchablePids: new Set([10]) }), defaults)).toBe(EXCLUSION_UNTOUCHABLE)
    expect(exclusionReason(10, contextWith({ lastAudioAt: new Map([[10, NOW]]) }), defaults)).toBe(EXCLUSION_AUDIO)
    expect(exclusionReason(10, contextWith({ fullscreenPid: 10 }), defaults)).toBe(EXCLUSION_FULLSCREEN)
    expect(exclusionReason(10, contextWith({ ioRates: new Map([[10, defaults.busyIoBytesPerSec]]) }), defaults))
      .toBe(EXCLUSION_BUSY_IO)
  })

  it('reports the shell ahead of a pin', () => {
    const context = contextWith({ shellPids: new Set([10]), pinnedPids: new Set([10]) })
    expect(exclusionReason(10, context, defaults)).toBe(EXCLUSION_SHELL)
  })

  it('reports a pin ahead of untouchable', () => {
    const context = contextWith({ pinnedPids: new Set([10]), untouchablePids: new Set([10]) })
    expect(exclusionReason(10, context, defaults)).toBe(EXCLUSION_PINNED)
  })

  it('reports untouchable ahead of audio', () => {
    const context = contextWith({ untouchablePids: new Set([10]), lastAudioAt: new Map([[10, NOW]]) })
    expect(exclusionReason(10, context, defaults)).toBe(EXCLUSION_UNTOUCHABLE)
  })

  it('reports audio ahead of full screen', () => {
    const context = contextWith({ lastAudioAt: new Map([[10, NOW]]), fullscreenPid: 10 })
    expect(exclusionReason(10, context, defaults)).toBe(EXCLUSION_AUDIO)
  })

  it('reports full screen ahead of busy io', () => {
    const context = contextWith({ fullscreenPid: 10, ioRates: new Map([[10, defaults.busyIoBytesPerSec * 4]]) })
    expect(exclusionReason(10, context, defaults)).toBe(EXCLUSION_FULLSCREEN)
  })

  it('holds audio open to the end of the hold window', () => {
    const inside = contextWith({ lastAudioAt: new Map([[10, NOW - defaults.audioHoldMs]]) })
    expect(exclusionReason(10, inside, defaults)).toBe(EXCLUSION_AUDIO)
    const outside = contextWith({ lastAudioAt: new Map([[10, NOW - defaults.audioHoldMs - 1]]) })
    expect(exclusionReason(10, outside, defaults)).toBe(null)
  })

  it('counts an io rate sitting exactly on the threshold as busy', () => {
    const atThreshold = contextWith({ ioRates: new Map([[10, defaults.busyIoBytesPerSec]]) })
    expect(exclusionReason(10, atThreshold, defaults)).toBe(EXCLUSION_BUSY_IO)
    const belowThreshold = contextWith({ ioRates: new Map([[10, defaults.busyIoBytesPerSec - 1]]) })
    expect(exclusionReason(10, belowThreshold, defaults)).toBe(null)
  })

  it('ignores a rate or stamp that is not a number', () => {
    expect(exclusionReason(10, contextWith({ ioRates: new Map([[10, null]]) }), defaults)).toBe(null)
    expect(exclusionReason(10, contextWith({ lastAudioAt: new Map([[10, 'now']]) }), defaults)).toBe(null)
  })

  it('survives a context with none of the lookup maps', () => {
    expect(exclusionReason(10, { now: NOW }, defaults)).toBe(null)
    expect(exclusionReason(10, {}, defaults)).toBe(null)
  })
})

describe('survivingPreviousState', () => {
  const settledYesterday = { state: STATE_NAPPING, rawState: STATE_NAPPING, rawSince: 0, since: 0, identity: 'boot' }
  const previousStates = new Map([[10, settledYesterday]])

  it('returns nothing for a process it has never seen', () => {
    expect(survivingPreviousState(99, contextWith({}), previousStates)).toBe(null)
    expect(survivingPreviousState(10, contextWith({}), null)).toBe(null)
    expect(survivingPreviousState(10, contextWith({}), undefined)).toBe(null)
  })

  it('keeps the previous state while the process identity still matches', () => {
    const context = contextWith({ startTimes: new Map([[10, 'boot']]) })
    expect(survivingPreviousState(10, context, previousStates)).toBe(settledYesterday)
  })

  it('drops the previous state once the process id has been recycled by another process', () => {
    const context = contextWith({ startTimes: new Map([[10, 'relaunch']]) })
    expect(survivingPreviousState(10, context, previousStates)).toBe(null)
  })

  it('keeps the previous state when no identity is on offer either side', () => {
    expect(survivingPreviousState(10, contextWith({}), previousStates)).toBe(settledYesterday)
    expect(survivingPreviousState(10, contextWith({ startTimes: new Map() }), previousStates)).toBe(settledYesterday)
    const unidentified = new Map([[10, { state: STATE_NAPPING, rawState: STATE_NAPPING, rawSince: 0, since: 0 }]])
    const context = contextWith({ startTimes: new Map([[10, 'boot']]) })
    expect(survivingPreviousState(10, context, unidentified)).toBe(unidentified.get(10))
  })
})

describe('memoryPriorityForState', () => {
  const lowering = mergeConfig(null, { lowerMemoryPriority: true })

  it('pins an interactive process to normal memory priority once the lever is on', () => {
    expect(memoryPriorityForState(STATE_INTERACTIVE, lowering, 99)).toBe(MEMORY_PRIORITY_NORMAL)
    expect(memoryPriorityForState(STATE_INTERACTIVE, lowering, null)).toBe(MEMORY_PRIORITY_NORMAL)
  })

  it('touches nothing at all while the memory lever is off, interactive included', () => {
    expect(memoryPriorityForState(STATE_INTERACTIVE, defaults, 0)).toBe(null)
    expect(memoryPriorityForState(STATE_INTERACTIVE, defaults, 99)).toBe(null)
  })

  it('leaves memory alone while the lever is switched off', () => {
    expect(memoryPriorityForState(STATE_OCCLUDED, defaults, 99)).toBe(null)
    expect(memoryPriorityForState(STATE_NAPPING, defaults, 99)).toBe(null)
  })

  it('leaves memory alone until pressure passes the threshold', () => {
    expect(memoryPriorityForState(STATE_NAPPING, lowering, lowering.memoryPressurePercent)).toBe(null)
    expect(memoryPriorityForState(STATE_NAPPING, lowering, lowering.memoryPressurePercent - 1)).toBe(null)
    expect(memoryPriorityForState(STATE_NAPPING, lowering, lowering.memoryPressurePercent + 1))
      .toBe(MEMORY_PRIORITY_MEDIUM)
  })

  it('trims a covered process one notch and a napping process two', () => {
    expect(memoryPriorityForState(STATE_OCCLUDED, lowering, 99)).toBe(MEMORY_PRIORITY_BELOW_NORMAL)
    expect(memoryPriorityForState(STATE_NAPPING, lowering, 99)).toBe(MEMORY_PRIORITY_MEDIUM)
  })

  it('leaves an on-screen process alone even under pressure', () => {
    expect(memoryPriorityForState(STATE_VISIBLE, lowering, 99)).toBe(null)
  })

  it('leaves memory alone when the pressure reading is unusable', () => {
    expect(memoryPriorityForState(STATE_NAPPING, lowering, null)).toBe(null)
    expect(memoryPriorityForState(STATE_NAPPING, lowering, Number.NaN)).toBe(null)
    expect(memoryPriorityForState(STATE_NAPPING, lowering, 'lots')).toBe(null)
  })

  it('never drops below the memory priority floor for any state or configuration', () => {
    expect(MEMORY_PRIORITY_FLOOR).toBe(MEMORY_PRIORITY_MEDIUM)
    const configs = [defaults, lowering, mergeConfig(null, { lowerMemoryPriority: true, memoryPressurePercent: 0 })]
    for (const config of configs) {
      for (const state of EVERY_STATE) {
        for (const pressure of [0, 50, 75, 100]) {
          const priority = memoryPriorityForState(state, config, pressure)
          if (priority !== null) expect(priority).toBeGreaterThanOrEqual(MEMORY_PRIORITY_FLOOR)
        }
      }
    }
  })
})

describe('leversForState', () => {
  const deep = mergeConfig(null, { enabled: true, deepNap: true })

  it('parks a covered process in eco quality of service', () => {
    const levers = leversForState(STATE_OCCLUDED, enabledConfig, 0)
    expect(levers.ecoQos).toBe(true)
    expect(levers.ignoreTimerResolution).toBe(true)
  })

  it('parks a napping process in eco quality of service', () => {
    expect(leversForState(STATE_NAPPING, enabledConfig, 0).ecoQos).toBe(true)
    expect(leversForState(STATE_NAPPING, enabledConfig, 0).ignoreTimerResolution).toBe(true)
  })

  it('leaves the two upper rungs at full speed', () => {
    expect(leversForState(STATE_INTERACTIVE, enabledConfig, 0).ecoQos).toBe(false)
    expect(leversForState(STATE_VISIBLE, enabledConfig, 0).ecoQos).toBe(false)
    expect(leversForState(STATE_INTERACTIVE, enabledConfig, 0).ignoreTimerResolution).toBe(false)
    expect(leversForState(STATE_VISIBLE, enabledConfig, 0).ignoreTimerResolution).toBe(false)
  })

  it('holds the deeper levers back while deep nap is off', () => {
    const levers = leversForState(STATE_NAPPING, enabledConfig, 0)
    expect(levers.efficientCpuSet).toBe(false)
    expect(levers.belowNormalPriority).toBe(false)
    expect(levers.lowIoPriority).toBe(false)
  })

  it('pulls all three deeper levers once a process is napping with deep nap on', () => {
    const levers = leversForState(STATE_NAPPING, deep, 0)
    expect(levers.efficientCpuSet).toBe(true)
    expect(levers.belowNormalPriority).toBe(true)
    expect(levers.lowIoPriority).toBe(true)
  })

  it('does not reach for the deeper levers on a merely covered process', () => {
    const levers = leversForState(STATE_OCCLUDED, deep, 0)
    expect(levers.efficientCpuSet).toBe(false)
    expect(levers.belowNormalPriority).toBe(false)
    expect(levers.lowIoPriority).toBe(false)
    expect(levers.ecoQos).toBe(true)
  })

  it('names every lever it sets', () => {
    expect([...LEVER_NAMES].sort()).toEqual(Object.keys(NEUTRAL_LEVERS).sort())
    expect(Object.keys(leversForState(STATE_NAPPING, deep, 0)).sort()).toEqual([...LEVER_NAMES].sort())
  })

  it('carries the memory priority decision through', () => {
    const lowering = mergeConfig(null, { enabled: true, lowerMemoryPriority: true })
    expect(leversForState(STATE_INTERACTIVE, lowering, 0).memoryPriority).toBe(MEMORY_PRIORITY_NORMAL)
    expect(leversForState(STATE_INTERACTIVE, enabledConfig, 0).memoryPriority).toBe(null)
    expect(leversForState(STATE_OCCLUDED, lowering, 99).memoryPriority).toBe(MEMORY_PRIORITY_BELOW_NORMAL)
    expect(leversForState(STATE_OCCLUDED, enabledConfig, 99).memoryPriority).toBe(null)
  })
})

describe('groupWindowsByProcess', () => {
  it('gathers the windows of one process together', () => {
    const grouped = groupWindowsByProcess([
      windowFor(10, VISIBILITY_VISIBLE),
      windowFor(20, VISIBILITY_HIDDEN),
      windowFor(10, VISIBILITY_OCCLUDED),
    ])
    expect(grouped.size).toBe(2)
    expect(grouped.get(10).length).toBe(2)
    expect(grouped.get(20).length).toBe(1)
  })

  it('drops windows with no usable process id', () => {
    const grouped = groupWindowsByProcess([
      { visibility: VISIBILITY_VISIBLE },
      windowFor(0, VISIBILITY_VISIBLE),
      windowFor(-3, VISIBILITY_VISIBLE),
      windowFor(Number.NaN, VISIBILITY_VISIBLE),
      null,
      windowFor(10, VISIBILITY_VISIBLE),
    ])
    expect([...grouped.keys()]).toEqual([10])
  })

  it('tolerates a missing window list', () => {
    expect(groupWindowsByProcess(null).size).toBe(0)
  })
})

describe('describeState', () => {
  it('explains every state in plain words', () => {
    for (const state of EVERY_STATE) {
      expect(typeof describeState(state, null)).toBe('string')
      expect(describeState(state, null).length).toBeGreaterThan(0)
    }
  })

  it('explains every exclusion as being left alone', () => {
    for (const reason of EVERY_REASON) {
      expect(describeState(STATE_NAPPING, reason).startsWith('Left alone')).toBe(true)
    }
  })

  it('falls back to the raw reason when it has no description', () => {
    expect(describeState(STATE_NAPPING, 'mystery')).toBe('Left alone - mystery')
  })
})

describe('resolveGovernedProcesses', () => {
  const windows = [
    windowFor(30, VISIBILITY_HIDDEN),
    windowFor(10, VISIBILITY_OCCLUDED),
    windowFor(10, VISIBILITY_VISIBLE),
    windowFor(20, VISIBILITY_OCCLUDED),
  ]

  const napping = new Map([[30, { state: STATE_NAPPING, rawState: STATE_NAPPING, rawSince: 0, since: 0 }]])

  it('groups windows by process and counts them', () => {
    const decisions = resolveGovernedProcesses(windows, contextWith({}), enabledConfig, null)
    expect(decisions.length).toBe(3)
    expect(decisions.find((decision) => decision.pid === 10).windowCount).toBe(2)
    expect(decisions.find((decision) => decision.pid === 10).state).toBe(STATE_VISIBLE)
    expect(decisions.find((decision) => decision.pid === 30).windowCount).toBe(1)
    expect(decisions.find((decision) => decision.pid === 30).rawState).toBe(STATE_NAPPING)
  })

  it('starts every process it has never seen before at visible, whatever rung it was found on', () => {
    const decisions = resolveGovernedProcesses(windows, contextWith({}), enabledConfig, null)
    for (const decision of decisions) {
      expect(decision.state).toBe(STATE_VISIBLE)
      expect(decision.since).toBe(NOW)
      expect(decision.rawSince).toBe(NOW)
      expect(isNeutral(decision.levers)).toBe(true)
    }
  })

  it('returns the processes sorted by process id', () => {
    const decisions = resolveGovernedProcesses(windows, contextWith({}), enabledConfig, null)
    expect(decisions.map((decision) => decision.pid)).toEqual([10, 20, 30])
  })

  it('drops windows carrying no usable process id', () => {
    const decisions = resolveGovernedProcesses(
      [windowFor(0, VISIBILITY_VISIBLE), windowFor(-1, VISIBILITY_VISIBLE), { visibility: VISIBILITY_VISIBLE }],
      contextWith({}),
      enabledConfig,
      null
    )
    expect(decisions).toEqual([])
  })

  it('leaves an excluded process on neutral levers even with the governor enabled', () => {
    const context = contextWith({ pinnedPids: new Set([20]) })
    const decisions = resolveGovernedProcesses(windows, context, enabledConfig, napping)
    const pinned = decisions.find((decision) => decision.pid === 20)
    expect(pinned.excluded).toBe(true)
    expect(pinned.reason).toBe(EXCLUSION_PINNED)
    expect(pinned.levers).toEqual(NEUTRAL_LEVERS)
    expect(isNeutral(pinned.levers)).toBe(true)
    const governed = decisions.find((decision) => decision.pid === 30)
    expect(governed.excluded).toBe(false)
    expect(governed.reason).toBe(null)
    expect(governed.levers.ecoQos).toBe(true)
  })

  it('leaves every process on neutral levers while the governor is disabled', () => {
    const context = contextWith({ memoryPressurePercent: 99 })
    const config = mergeConfig(null, { enabled: false, deepNap: true, lowerMemoryPriority: true })
    const decisions = resolveGovernedProcesses(windows, context, config, null)
    expect(decisions.length).toBe(3)
    for (const decision of decisions) {
      expect(decision.levers).toEqual(NEUTRAL_LEVERS)
      expect(isNeutral(decision.levers)).toBe(true)
      expect(decision.excluded).toBe(false)
    }
  })

  it('explains every decision it makes', () => {
    const context = contextWith({ shellPids: new Set([10]), fullscreenPid: 20 })
    const decisions = resolveGovernedProcesses(windows, context, enabledConfig, null)
    for (const decision of decisions) {
      expect(typeof decision.explanation).toBe('string')
      expect(decision.explanation.length).toBeGreaterThan(0)
    }
    expect(decisions.find((decision) => decision.pid === 10).reason).toBe(EXCLUSION_SHELL)
    expect(decisions.find((decision) => decision.pid === 20).reason).toBe(EXCLUSION_FULLSCREEN)
  })

  it('settles against the previous states it is handed', () => {
    const previous = new Map([[20, { state: STATE_VISIBLE, rawState: STATE_VISIBLE, rawSince: 0, since: 0 }]])
    const decisions = resolveGovernedProcesses(windows, contextWith({}), enabledConfig, previous)
    const held = decisions.find((decision) => decision.pid === 20)
    expect(held.state).toBe(STATE_VISIBLE)
    expect(held.rawState).toBe(STATE_OCCLUDED)
    expect(held.levers.ecoQos).toBe(false)
  })

  it('tolerates a missing previous state map', () => {
    expect(resolveGovernedProcesses(windows, contextWith({}), enabledConfig, undefined).length).toBe(3)
  })

  it('lets a process that is still the same one keep the state it settled into', () => {
    const previous = new Map([[10, {
      state: STATE_NAPPING,
      rawState: STATE_NAPPING,
      rawSince: NOW - defaults.nappingDwellMs,
      since: NOW - defaults.nappingDwellMs,
      identity: 'started-yesterday',
    }]])
    const context = contextWith({ startTimes: new Map([[10, 'started-yesterday']]) })
    const decisions = resolveGovernedProcesses([windowFor(10, VISIBILITY_HIDDEN)], context, enabledConfig, previous)
    expect(decisions[0].identity).toBe('started-yesterday')
    expect(decisions[0].state).toBe(STATE_NAPPING)
    expect(decisions[0].since).toBe(NOW - defaults.nappingDwellMs)
    expect(decisions[0].levers.ecoQos).toBe(true)
  })

  it('gives a recycled process id a fresh first sighting rather than the dead process settled state', () => {
    const previous = new Map([[10, {
      state: STATE_NAPPING,
      rawState: STATE_NAPPING,
      rawSince: NOW - 10 * defaults.nappingDwellMs,
      since: NOW - 10 * defaults.nappingDwellMs,
      identity: 'started-yesterday',
    }]])
    const context = contextWith({ startTimes: new Map([[10, 'started-just-now']]) })
    const decisions = resolveGovernedProcesses([windowFor(10, VISIBILITY_HIDDEN)], context, enabledConfig, previous)
    expect(decisions[0].identity).toBe('started-just-now')
    expect(decisions[0].state).toBe(STATE_VISIBLE)
    expect(decisions[0].rawSince).toBe(NOW)
    expect(decisions[0].since).toBe(NOW)
    expect(isNeutral(decisions[0].levers)).toBe(true)
  })

  it('settles against the previous state unchanged when no start times are on offer', () => {
    const previous = new Map([[10, { state: STATE_NAPPING, rawState: STATE_NAPPING, rawSince: 0, since: 0 }]])
    const decisions = resolveGovernedProcesses(
      [windowFor(10, VISIBILITY_HIDDEN)],
      contextWith({}),
      enabledConfig,
      previous
    )
    expect(decisions[0].identity).toBe(null)
    expect(decisions[0].state).toBe(STATE_NAPPING)
    expect(decisions[0].levers.ecoQos).toBe(true)
  })
})

describe('nextStateMap', () => {
  it('carries each decision forward as the next previous state', () => {
    const decisions = resolveGovernedProcesses(
      [windowFor(10, VISIBILITY_VISIBLE)],
      contextWith({}),
      enabledConfig,
      null
    )
    const next = nextStateMap(decisions)
    expect([...next.keys()]).toEqual([10])
    expect(next.get(10)).toEqual({
      state: STATE_VISIBLE,
      rawState: STATE_VISIBLE,
      rawSince: NOW,
      since: NOW,
      identity: null,
    })
  })

  it('carries the process identity forward so a recycled process id is spotted on the next tick', () => {
    const context = contextWith({ startTimes: new Map([[10, 'started-at-boot']]) })
    const decisions = resolveGovernedProcesses([windowFor(10, VISIBILITY_VISIBLE)], context, enabledConfig, null)
    const next = nextStateMap(decisions)
    expect(next.get(10).identity).toBe('started-at-boot')
    expect(survivingPreviousState(10, context, next)).toBe(next.get(10))
    expect(survivingPreviousState(10, contextWith({ startTimes: new Map([[10, 'restarted']]) }), next)).toBe(null)
  })

  it('returns an empty map for no decisions', () => {
    expect(nextStateMap([]).size).toBe(0)
  })
})

describe('leversDiffer and isNeutral', () => {
  it('treats a missing side as different', () => {
    expect(leversDiffer(null, NEUTRAL_LEVERS)).toBe(true)
    expect(leversDiffer(NEUTRAL_LEVERS, undefined)).toBe(true)
    expect(leversDiffer(null, null)).toBe(true)
  })

  it('sees no difference between two matching lever sets', () => {
    expect(leversDiffer({ ...NEUTRAL_LEVERS }, NEUTRAL_LEVERS)).toBe(false)
    expect(leversDiffer(
      leversForState(STATE_NAPPING, enabledConfig, 0),
      leversForState(STATE_NAPPING, enabledConfig, 0)
    )).toBe(false)
  })

  it('spots a single moved lever', () => {
    for (const lever of LEVER_NAMES) {
      const moved = { ...NEUTRAL_LEVERS, [lever]: lever === 'memoryPriority' ? MEMORY_PRIORITY_MEDIUM : true }
      expect(leversDiffer(moved, NEUTRAL_LEVERS)).toBe(true)
      expect(isNeutral(moved)).toBe(false)
    }
  })

  it('recognises the neutral lever set', () => {
    expect(isNeutral(NEUTRAL_LEVERS)).toBe(true)
    expect(isNeutral({ ...NEUTRAL_LEVERS })).toBe(true)
    expect(isNeutral(leversForState(STATE_OCCLUDED, enabledConfig, 0))).toBe(false)
    expect(isNeutral(leversForState(STATE_VISIBLE, enabledConfig, 0))).toBe(true)
  })

  it('leaves an interactive process neutral while the memory lever is off, so no write is issued', () => {
    const levers = leversForState(STATE_INTERACTIVE, enabledConfig, 0)
    expect(levers.memoryPriority).toBe(null)
    expect(isNeutral(levers)).toBe(true)
    expect(leversDiffer(levers, NEUTRAL_LEVERS)).toBe(false)
  })

  it('counts an interactive process as a change once the memory lever pins it to normal', () => {
    const levers = leversForState(STATE_INTERACTIVE, mergeConfig(null, { enabled: true, lowerMemoryPriority: true }), 0)
    expect(levers.memoryPriority).toBe(MEMORY_PRIORITY_NORMAL)
    expect(isNeutral(levers)).toBe(false)
  })
})

describe('pendingLeverChanges', () => {
  const settled = new Map([
    [10, { state: STATE_OCCLUDED, rawState: STATE_OCCLUDED, rawSince: 0, since: 0 }],
    [20, { state: STATE_VISIBLE, rawState: STATE_VISIBLE, rawSince: 0, since: 0 }],
  ])
  const processWindows = [windowFor(10, VISIBILITY_OCCLUDED), windowFor(20, VISIBILITY_VISIBLE)]
  const decisions = resolveGovernedProcesses(processWindows, contextWith({}), enabledConfig, settled)

  it('asks for nothing when the applied levers already match', () => {
    const applied = new Map(decisions.map((decision) => [decision.pid, { ...decision.levers }]))
    expect(pendingLeverChanges(decisions, applied)).toEqual([])
  })

  it('asks only for the processes that want a lever moved the first time round', () => {
    expect(pendingLeverChanges(decisions, new Map()).map((change) => change.pid)).toEqual([10])
    expect(pendingLeverChanges(decisions, null).map((change) => change.pid)).toEqual([10])
  })

  it('skips an untouched process that wants nothing rather than writing a no-op', () => {
    const untouched = decisions.find((decision) => decision.pid === 20)
    expect(isNeutral(untouched.levers)).toBe(true)
    expect(pendingLeverChanges([untouched], new Map())).toEqual([])
    expect(pendingLeverChanges([untouched], null)).toEqual([])
  })

  it('asks for nothing at all while the governor is switched off', () => {
    const disabled = resolveGovernedProcesses(processWindows, contextWith({}), defaults, settled)
    expect(disabled.length).toBe(2)
    expect(pendingLeverChanges(disabled, new Map())).toEqual([])
    expect(pendingLeverChanges(disabled, null)).toEqual([])
  })

  it('still asks for the revert of a process that has levers applied and now wants none', () => {
    const applied = new Map([[20, { ...leversForState(STATE_NAPPING, enabledConfig, 0) }]])
    const changes = pendingLeverChanges(decisions, applied)
    const reverted = changes.find((change) => change.pid === 20)
    expect(isNeutral(reverted.levers)).toBe(true)
    expect(reverted.previous.ecoQos).toBe(true)
  })

  it('reports the previously applied levers alongside the new ones', () => {
    const applied = new Map([[10, { ...NEUTRAL_LEVERS }]])
    const changes = pendingLeverChanges(decisions, applied)
    const covered = changes.find((change) => change.pid === 10)
    expect(covered.previous).toEqual(NEUTRAL_LEVERS)
    expect(covered.levers.ecoQos).toBe(true)
    expect(changes.map((change) => change.pid)).toEqual([10])
  })
})

describe('orphanedPids', () => {
  const decisions = resolveGovernedProcesses(
    [windowFor(10, VISIBILITY_OCCLUDED)],
    contextWith({}),
    enabledConfig,
    null
  )

  it('lists a process that has left the window list so its levers can be reverted', () => {
    const applied = new Map([[10, { ...NEUTRAL_LEVERS }], [77, { ...NEUTRAL_LEVERS }]])
    expect(orphanedPids(applied, decisions)).toEqual([77])
  })

  it('lists nothing while every applied process is still alive', () => {
    expect(orphanedPids(new Map([[10, { ...NEUTRAL_LEVERS }]]), decisions)).toEqual([])
  })

  it('tolerates a missing applied map', () => {
    expect(orphanedPids(null, decisions)).toEqual([])
    expect(orphanedPids(undefined, [])).toEqual([])
  })

  it('lists every applied process once the window list empties', () => {
    const applied = new Map([[10, { ...NEUTRAL_LEVERS }], [20, { ...NEUTRAL_LEVERS }]])
    expect(orphanedPids(applied, [])).toEqual([10, 20])
  })
})

describe('exclusion hold windows', () => {
  const held = mergeConfig(null, { enabled: true })

  function holdContext(overrides) {
    return { now: 100000, ...overrides }
  }

  it('keeps excluding a process for the hold window after its last busy sample', () => {
    const context = holdContext({ lastBusyIoAt: new Map([[7, 100000 - held.busyHoldMs + 1]]) })
    expect(processGovernorPolicy.isBusyWithIo(7, context, held)).toBe(true)
  })

  it('stops excluding once the hold window has elapsed', () => {
    const context = holdContext({ lastBusyIoAt: new Map([[7, 100000 - held.busyHoldMs - 1]]) })
    expect(processGovernorPolicy.isBusyWithIo(7, context, held)).toBe(false)
  })

  it('excludes a process burning CPU in the background', () => {
    const context = holdContext({ cpuPercents: new Map([[9, held.busyCpuPercent]]) })
    expect(processGovernorPolicy.isBusyOnCpu(9, context, held)).toBe(true)
    expect(exclusionReason(9, context, held)).toBe(processGovernorPolicy.EXCLUSION_BUSY_CPU)
  })

  it('leaves a quiet process alone', () => {
    const context = holdContext({ cpuPercents: new Map([[9, held.busyCpuPercent - 1]]) })
    expect(processGovernorPolicy.isBusyOnCpu(9, context, held)).toBe(false)
  })

  it('forgives audio scan latency so a currently playing process is never governed', () => {
    const context = holdContext({
      lastAudioAt: new Map([[3, 100000 - held.audioHoldMs - 2000]]),
      audioScanIntervalMs: 3000,
    })
    expect(processGovernorPolicy.holdsAudio(3, context, held)).toBe(true)
  })

  it('excludes a fullscreen window on any monitor, not only the foreground one', () => {
    const context = holdContext({ fullscreenPids: new Set([11]), fullscreenPid: 22 })
    expect(processGovernorPolicy.isFullscreen(11, context)).toBe(true)
    expect(processGovernorPolicy.isFullscreen(22, context)).toBe(true)
    expect(processGovernorPolicy.isFullscreen(33, context)).toBe(false)
    expect(exclusionReason(11, context, held)).toBe(processGovernorPolicy.EXCLUSION_FULLSCREEN)
  })

  it('never lets audioHoldMs be configured below one audio scan', () => {
    expect(mergeConfig(null, { audioHoldMs: 0 }).audioHoldMs).toBe(CONFIG_LIMITS.audioHoldMs[0])
    expect(CONFIG_LIMITS.audioHoldMs[0]).toBeGreaterThanOrEqual(3000)
  })

  it('ignores every hold stamp that sits in the future, so a backward clock step pins nothing', () => {
    const context = holdContext({
      lastBusyIoAt: new Map([[7, 100000 + 5000]]),
      lastBusyCpuAt: new Map([[7, 100000 + 5000]]),
      lastAudioAt: new Map([[7, 100000 + 5000]]),
    })
    expect(processGovernorPolicy.isBusyWithIo(7, context, held)).toBe(false)
    expect(processGovernorPolicy.isBusyOnCpu(7, context, held)).toBe(false)
    expect(processGovernorPolicy.holdsAudio(7, context, held)).toBe(false)
    expect(exclusionReason(7, context, held)).toBe(null)
  })

  it('tolerates a context with none of the hold maps present', () => {
    const context = holdContext({})
    expect(processGovernorPolicy.isBusyWithIo(1, context, held)).toBe(false)
    expect(processGovernorPolicy.isBusyOnCpu(1, context, held)).toBe(false)
    expect(processGovernorPolicy.holdsAudio(1, context, held)).toBe(false)
    expect(exclusionReason(1, context, held)).toBe(null)
  })
})
