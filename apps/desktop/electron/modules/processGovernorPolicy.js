const occlusion = require('./occlusionPolicy')

const STATE_INTERACTIVE = 'interactive'
const STATE_VISIBLE = 'visible'
const STATE_OCCLUDED = 'occluded'
const STATE_NAPPING = 'napping'

const STATE_RANK = {
  [STATE_NAPPING]: 0,
  [STATE_OCCLUDED]: 1,
  [STATE_VISIBLE]: 2,
  [STATE_INTERACTIVE]: 3,
}

const EXCLUSION_SHELL = 'shell'
const EXCLUSION_AUDIO = 'audio'
const EXCLUSION_PINNED = 'pinned'
const EXCLUSION_UNTOUCHABLE = 'untouchable'
const EXCLUSION_BUSY_IO = 'busy-io'
const EXCLUSION_BUSY_CPU = 'busy-cpu'
const EXCLUSION_FULLSCREEN = 'fullscreen'

const EXCLUSION_DESCRIPTIONS = {
  [EXCLUSION_SHELL]: 'Alpine Shell and the shell it replaced are never governed',
  [EXCLUSION_AUDIO]: 'playing or capturing audio',
  [EXCLUSION_PINNED]: 'pinned by you',
  [EXCLUSION_UNTOUCHABLE]: 'the system does not allow Alpine to change this process',
  [EXCLUSION_BUSY_IO]: 'busy reading or writing',
  [EXCLUSION_BUSY_CPU]: 'still working hard in the background',
  [EXCLUSION_FULLSCREEN]: 'running full screen',
}

const MEMORY_PRIORITY_NORMAL = 5
const MEMORY_PRIORITY_BELOW_NORMAL = 4
const MEMORY_PRIORITY_MEDIUM = 3
const MEMORY_PRIORITY_FLOOR = MEMORY_PRIORITY_MEDIUM

const DEFAULT_CONFIG = {
  enabled: false,
  deepNap: false,
  lowerMemoryPriority: false,
  interactiveGraceMs: 5000,
  occludedDwellMs: 20000,
  nappingDwellMs: 60000,
  audioHoldMs: 15000,
  busyIoBytesPerSec: 512 * 1024,
  busyCpuPercent: 15,
  busyHoldMs: 20000,
  memoryPressurePercent: 75,
}

const CONFIG_LIMITS = {
  interactiveGraceMs: [1000, 60000],
  occludedDwellMs: [5000, 600000],
  nappingDwellMs: [10000, 1800000],
  audioHoldMs: [5000, 120000],
  busyIoBytesPerSec: [64 * 1024, 1024 * 1024 * 1024],
  busyCpuPercent: [1, 100],
  busyHoldMs: [5000, 300000],
  memoryPressurePercent: [0, 100],
}

function clampNumber(value, [min, max], fallback) {
  if (typeof value !== 'number' && typeof value !== 'string') return fallback
  if (typeof value === 'string' && value.trim().length === 0) return fallback
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.max(min, Math.min(max, Math.round(numeric)))
}

function mergeConfig(current, partial) {
  const merged = { ...DEFAULT_CONFIG, ...current }
  if (!partial || typeof partial !== 'object') return merged
  for (const key of ['enabled', 'deepNap', 'lowerMemoryPriority']) {
    if (typeof partial[key] === 'boolean') merged[key] = partial[key]
  }
  for (const [key, limits] of Object.entries(CONFIG_LIMITS)) {
    if (partial[key] !== undefined) merged[key] = clampNumber(partial[key], limits, DEFAULT_CONFIG[key])
  }
  return merged
}

function rankOf(state) {
  return STATE_RANK[state] ?? STATE_RANK[STATE_VISIBLE]
}

function highestState(states) {
  let best = null
  for (const state of states) {
    if (best === null || rankOf(state) > rankOf(best)) best = state
  }
  return best
}

function windowState(window, context) {
  if (window.pid === context.foregroundPid) return STATE_INTERACTIVE
  if (window.visibility === occlusion.VISIBILITY_VISIBLE) return STATE_VISIBLE
  if (window.visibility === occlusion.VISIBILITY_OCCLUDED) return STATE_OCCLUDED
  return STATE_NAPPING
}

function elapsedSince(stamp, now) {
  if (!Number.isFinite(stamp) || !Number.isFinite(now)) return null
  const elapsed = now - stamp
  return elapsed < 0 ? null : elapsed
}

function withinInteractiveGrace(pid, context, config) {
  const elapsed = elapsedSince(context.lastForegroundAt?.get?.(pid), context.now)
  return elapsed !== null && elapsed < config.interactiveGraceMs
}

function rawStateForProcess(windows, pid, context, config) {
  const base = highestState(windows.map((window) => windowState(window, context))) ?? STATE_NAPPING
  if (rankOf(base) === rankOf(STATE_INTERACTIVE)) return STATE_INTERACTIVE
  if (withinInteractiveGrace(pid, context, config)) return STATE_INTERACTIVE
  return base
}

function configuredDwell(value, fallback) {
  return Number.isFinite(value) ? value : fallback
}

function dwellForState(state, config) {
  if (state === STATE_OCCLUDED) return configuredDwell(config?.occludedDwellMs, DEFAULT_CONFIG.occludedDwellMs)
  if (state === STATE_NAPPING) return configuredDwell(config?.nappingDwellMs, DEFAULT_CONFIG.nappingDwellMs)
  return 0
}

function firstSightingState(rawState) {
  return rankOf(rawState) >= rankOf(STATE_VISIBLE) ? rawState : STATE_VISIBLE
}

function settleState(previous, rawState, now, config) {
  if (!previous) {
    return { state: firstSightingState(rawState), rawState, rawSince: now, since: now }
  }
  const rawSince = previous.rawState === rawState ? previous.rawSince : now
  const settled = previous.state
  if (rankOf(rawState) >= rankOf(settled)) {
    return { state: rawState, rawState, rawSince, since: rawState === settled ? previous.since : now }
  }
  const elapsed = elapsedSince(rawSince, now)
  if (elapsed !== null && elapsed >= dwellForState(rawState, config)) {
    return { state: rawState, rawState, rawSince, since: now }
  }
  return { state: settled, rawState, rawSince, since: previous.since }
}

function heldRecently(pid, holds, now, holdMs) {
  const elapsed = elapsedSince(holds?.get?.(pid), now)
  return elapsed !== null && elapsed <= holdMs
}

function isBusyWithIo(pid, context, config) {
  const rate = context.ioRates?.get?.(pid)
  if (Number.isFinite(rate) && rate >= config.busyIoBytesPerSec) return true
  return heldRecently(pid, context.lastBusyIoAt, context.now, config.busyHoldMs)
}

function isBusyOnCpu(pid, context, config) {
  const percent = context.cpuPercents?.get?.(pid)
  if (Number.isFinite(percent) && percent >= config.busyCpuPercent) return true
  return heldRecently(pid, context.lastBusyCpuAt, context.now, config.busyHoldMs)
}

function holdsAudio(pid, context, config) {
  return heldRecently(pid, context.lastAudioAt, context.now, config.audioHoldMs + (context.audioScanIntervalMs ?? 0))
}

function isFullscreen(pid, context) {
  if (pid === context.fullscreenPid) return true
  return Boolean(context.fullscreenPids?.has?.(pid))
}

function exclusionReason(pid, context, config) {
  if (context.shellPids?.has?.(pid)) return EXCLUSION_SHELL
  if (context.pinnedPids?.has?.(pid)) return EXCLUSION_PINNED
  if (context.untouchablePids?.has?.(pid)) return EXCLUSION_UNTOUCHABLE
  if (holdsAudio(pid, context, config)) return EXCLUSION_AUDIO
  if (isFullscreen(pid, context)) return EXCLUSION_FULLSCREEN
  if (isBusyWithIo(pid, context, config)) return EXCLUSION_BUSY_IO
  if (isBusyOnCpu(pid, context, config)) return EXCLUSION_BUSY_CPU
  return null
}

function memoryPriorityForState(state, config, memoryPressurePercent) {
  if (!config.lowerMemoryPriority) return null
  if (state === STATE_INTERACTIVE) return MEMORY_PRIORITY_NORMAL
  const pressure = Number(memoryPressurePercent)
  if (!Number.isFinite(pressure) || pressure <= config.memoryPressurePercent) return null
  if (state === STATE_OCCLUDED) return MEMORY_PRIORITY_BELOW_NORMAL
  if (state === STATE_NAPPING) return Math.max(MEMORY_PRIORITY_FLOOR, MEMORY_PRIORITY_MEDIUM)
  return null
}

function leversForState(state, config, memoryPressurePercent) {
  const levers = {
    ecoQos: state === STATE_OCCLUDED || state === STATE_NAPPING,
    ignoreTimerResolution: state === STATE_OCCLUDED || state === STATE_NAPPING,
    memoryPriority: memoryPriorityForState(state, config, memoryPressurePercent),
    efficientCpuSet: false,
    belowNormalPriority: false,
    lowIoPriority: false,
  }
  if (config.deepNap && state === STATE_NAPPING) {
    levers.efficientCpuSet = true
    levers.belowNormalPriority = true
    levers.lowIoPriority = true
  }
  return levers
}

const NEUTRAL_LEVERS = {
  ecoQos: false,
  ignoreTimerResolution: false,
  memoryPriority: null,
  efficientCpuSet: false,
  belowNormalPriority: false,
  lowIoPriority: false,
}

function groupWindowsByProcess(windows) {
  const grouped = new Map()
  for (const window of windows ?? []) {
    if (!Number.isFinite(window?.pid) || window.pid <= 0) continue
    if (!grouped.has(window.pid)) grouped.set(window.pid, [])
    grouped.get(window.pid).push(window)
  }
  return grouped
}

function describeState(state, reason) {
  if (reason) return `Left alone - ${EXCLUSION_DESCRIPTIONS[reason] ?? reason}`
  if (state === STATE_INTERACTIVE) return 'In use right now'
  if (state === STATE_VISIBLE) return 'On screen'
  if (state === STATE_OCCLUDED) return 'Fully covered by other windows'
  return 'Every window minimised, parked or on another desktop'
}

function survivingPreviousState(pid, context, previousStates) {
  const previous = previousStates?.get?.(pid)
  if (!previous) return null
  const identity = context.startTimes?.get?.(pid)
  if (identity !== undefined && previous.identity !== undefined && previous.identity !== identity) return null
  return previous
}

function resolveGovernedProcesses(windows, context, config, previousStates) {
  const grouped = groupWindowsByProcess(windows)
  const decisions = []
  for (const [pid, processWindows] of grouped) {
    const rawState = rawStateForProcess(processWindows, pid, context, config)
    const settled = settleState(survivingPreviousState(pid, context, previousStates), rawState, context.now, config)
    const reason = exclusionReason(pid, context, config)
    const governed = config.enabled && !reason
    decisions.push({
      pid,
      identity: context.startTimes?.get?.(pid) ?? null,
      windowCount: processWindows.length,
      state: settled.state,
      rawState: settled.rawState,
      since: settled.since,
      rawSince: settled.rawSince,
      excluded: Boolean(reason),
      reason,
      explanation: describeState(settled.state, reason),
      levers: governed ? leversForState(settled.state, config, context.memoryPressurePercent) : { ...NEUTRAL_LEVERS },
    })
  }
  decisions.sort((a, b) => a.pid - b.pid)
  return decisions
}

function nextStateMap(decisions) {
  const next = new Map()
  for (const decision of decisions) {
    next.set(decision.pid, {
      state: decision.state,
      rawState: decision.rawState,
      rawSince: decision.rawSince,
      since: decision.since,
      identity: decision.identity,
    })
  }
  return next
}

const LEVER_NAMES = Object.freeze(['ecoQos', 'ignoreTimerResolution', 'memoryPriority', 'efficientCpuSet', 'belowNormalPriority', 'lowIoPriority'])

function leversDiffer(a, b) {
  if (!a || !b) return true
  return LEVER_NAMES
    .some((lever) => a[lever] !== b[lever])
}

function pendingLeverChanges(decisions, appliedLevers) {
  const changes = []
  for (const decision of decisions) {
    const applied = appliedLevers?.get?.(decision.pid)
    if (!applied && isNeutral(decision.levers)) continue
    if (leversDiffer(applied, decision.levers)) {
      changes.push({ pid: decision.pid, levers: decision.levers, previous: applied ?? null })
    }
  }
  return changes
}

function orphanedPids(appliedLevers, decisions) {
  const live = new Set(decisions.map((decision) => decision.pid))
  const orphans = []
  for (const pid of appliedLevers?.keys?.() ?? []) {
    if (!live.has(pid)) orphans.push(pid)
  }
  return orphans
}

function isNeutral(levers) {
  return !leversDiffer(levers, NEUTRAL_LEVERS)
}

module.exports = {
  STATE_INTERACTIVE,
  STATE_VISIBLE,
  STATE_OCCLUDED,
  STATE_NAPPING,
  STATE_RANK,
  EXCLUSION_SHELL,
  EXCLUSION_AUDIO,
  EXCLUSION_PINNED,
  EXCLUSION_UNTOUCHABLE,
  EXCLUSION_BUSY_IO,
  EXCLUSION_BUSY_CPU,
  EXCLUSION_FULLSCREEN,
  EXCLUSION_DESCRIPTIONS,
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
  isBusyWithIo,
  isBusyOnCpu,
  isFullscreen,
  holdsAudio,
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
}
