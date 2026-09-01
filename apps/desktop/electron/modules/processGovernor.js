const fs = require('fs')
const path = require('path')
const winEvents = require('./winEvents')
const windowEnum = require('./windowEnum')
const windowGraph = require('./windowGraph')
const levers = require('./processGovernorLevers')
const journalPolicy = require('./processGovernorJournal')
const policy = require('./processGovernorPolicy')
const audioSessions = require('./audioSessions')

const CONFIG_FILE = 'process-governor.json'
const JOURNAL_FILE = 'process-governor-journal.json'

const EVENT_SYSTEM_FOREGROUND = 0x0003
const EVENT_SYSTEM_MINIMIZESTART = 0x0016
const EVENT_SYSTEM_MINIMIZEEND = 0x0017
const EVENT_SYSTEM_MOVESIZEEND = 0x000b
const EVENT_OBJECT_DESTROY = 0x8001
const EVENT_OBJECT_SHOW = 0x8002
const EVENT_OBJECT_HIDE = 0x8003
const GOVERNOR_EVENTS = [
  EVENT_SYSTEM_FOREGROUND,
  EVENT_SYSTEM_MOVESIZEEND,
  EVENT_SYSTEM_MINIMIZESTART,
  EVENT_SYSTEM_MINIMIZEEND,
  EVENT_OBJECT_DESTROY,
  EVENT_OBJECT_SHOW,
  EVENT_OBJECT_HIDE,
]

const EVALUATE_DEBOUNCE_MS = 250
const SWEEP_INTERVAL_MS = 5000
const AUDIO_SCAN_INTERVAL_MS = 3000
const IMAGE_CACHE_LIMIT = 512

const NEVER_GOVERNED_IMAGE_NAMES = new Set([
  'explorer',
  'audiodg',
  'audiosrv',
  'audioendpointbuilder',
  'dwm',
  'csrss',
  'winlogon',
  'wininit',
  'lsass',
  'services',
  'smss',
  'sihost',
  'ctfmon',
  'textinputhost',
])

let broadcastRef = null
let config = { ...policy.DEFAULT_CONFIG }
let configPath = null

let unsubscribeWinEvents = null
let evaluateTimer = null
let sweepTimer = null

let journalPath = null
let journal = journalPolicy.createJournal()
let audioTimer = null
let previousStates = new Map()
const appliedLevers = new Map()
const originals = new Map()
const selfManagedPids = new Set()
const lastBusyIoAt = new Map()
const lastBusyCpuAt = new Map()
const cpuPercents = new Map()
let cpuSamples = new Map()
const startTimes = new Map()
let untouchablePids = new Set()
let lastForegroundAt = new Map()
const lastAudioAt = new Map()
let ioRates = new Map()
let ioSamples = new Map()
let pinnedPaths = new Set()
let imagePaths = new Map()
let lastDecisions = []
let evaluating = false

function userDataFile(name) {
  const { app } = require('electron')
  return path.join(app.getPath('userData'), name)
}

function readJsonFile(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (e) {
    console.error('[processGovernor] cannot read', file, '-', e?.message ?? e)
    return fallback
  }
}

function writeFileSafely(file, contents) {
  try {
    fs.writeFileSync(file, contents)
  } catch (e) {
    console.error('[processGovernor] cannot write', file, '-', e?.message ?? e)
  }
}

function loadConfig() {
  configPath = userDataFile(CONFIG_FILE)
  const stored = readJsonFile(configPath, null)
  config = policy.mergeConfig(policy.DEFAULT_CONFIG, stored)
  pinnedPaths = new Set(Array.isArray(stored?.pinnedPaths) ? stored.pinnedPaths : [])
}

function saveConfig() {
  writeFileSafely(configPath, JSON.stringify({ ...config, pinnedPaths: [...pinnedPaths] }, null, 2))
}

function readTextFile(file) {
  try {
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
  } catch (e) {
    console.error('[processGovernor] cannot read', file, '-', e?.message ?? e)
    return ''
  }
}

function persistJournal() {
  if (!journalPath) return
  writeFileSafely(journalPath, journalPolicy.serializeJournal(journal))
}

function rememberTouchedProcess(pid) {
  const startTime = startTimes.get(pid)
  if (!startTime) return
  const next = journalPolicy.withEntry(journal, { pid, startTime, name: imageNameForPid(pid)?.name ?? null })
  if (next === journal) return
  journal = next
  persistJournal()
}

function forgetTouchedProcess(pid) {
  const next = journalPolicy.withoutPid(journal, pid)
  if (next === journal) return
  journal = next
  persistJournal()
}

function recoverFromPreviousRun() {
  journalPath = userDataFile(JOURNAL_FILE)
  journal = journalPolicy.parseJournal(readTextFile(journalPath))
  if (journal.entries.length === 0) return
  const live = new Map()
  for (const entry of journal.entries) {
    const snapshot = levers.readProcessSnapshot(entry.pid)
    if (snapshot?.startTime) live.set(entry.pid, { pid: entry.pid, startTime: snapshot.startTime })
  }
  const recoverable = journalPolicy.recoverableEntries(journal, live)
  for (const entry of recoverable) {
    try {
      levers.restoreOriginal(entry.pid, null)
    } catch (e) {
      console.error('[processGovernor] could not clear leftover levers for pid', entry.pid, '-', e?.message ?? e)
    }
  }
  console.log('[processGovernor] cleared levers left by a previous run:', recoverable.length, 'of', journal.entries.length, 'still running')
  journal = journalPolicy.createJournal()
  persistJournal()
}

function imageNameForPid(pid) {
  if (imagePaths.has(pid)) return imagePaths.get(pid)
  let described = null
  try {
    const imagePath = windowEnum.processImagePath(pid)
    described = imagePath ? { name: windowEnum.processNameFromPath(imagePath).toLowerCase(), path: imagePath } : null
  } catch (_) {
    described = null
  }
  if (imagePaths.size >= IMAGE_CACHE_LIMIT) imagePaths.clear()
  imagePaths.set(pid, described)
  return described
}

function shellProcessIds() {
  const pids = new Set([process.pid])
  try {
    const { app } = require('electron')
    for (const metric of app.getAppMetrics()) pids.add(metric.pid)
  } catch (_) {
    return pids
  }
  return pids
}

function isNeverGoverned(pid) {
  const image = imageNameForPid(pid)
  return Boolean(image) && NEVER_GOVERNED_IMAGE_NAMES.has(image.name)
}

function sampleRate(previous, total, now) {
  if (!previous || now <= previous.at || total < previous.total) return null
  return { delta: total - previous.total, elapsedMs: now - previous.at }
}

function refreshActivityRates(pids) {
  const now = Date.now()
  const nextIoSamples = new Map()
  const nextCpuSamples = new Map()
  for (const pid of pids) {
    const snapshot = levers.readProcessSnapshot(pid)
    if (!snapshot) continue
    if (snapshot.startTime) startTimes.set(pid, snapshot.startTime)
    if (Number.isFinite(snapshot.ioTransferTotal)) {
      nextIoSamples.set(pid, { total: snapshot.ioTransferTotal, at: now })
      const moved = sampleRate(ioSamples.get(pid), snapshot.ioTransferTotal, now)
      if (moved) {
        const rate = (moved.delta * 1000) / moved.elapsedMs
        ioRates.set(pid, rate)
        if (rate >= config.busyIoBytesPerSec) lastBusyIoAt.set(pid, now)
      }
    }
    if (Number.isFinite(snapshot.cpuTimeMs)) {
      nextCpuSamples.set(pid, { total: snapshot.cpuTimeMs, at: now })
      const burned = sampleRate(cpuSamples.get(pid), snapshot.cpuTimeMs, now)
      if (burned) {
        const percent = (burned.delta * 100) / burned.elapsedMs
        cpuPercents.set(pid, percent)
        if (percent >= config.busyCpuPercent) lastBusyCpuAt.set(pid, now)
      }
    }
  }
  ioSamples = nextIoSamples
  cpuSamples = nextCpuSamples
}

function probeUntouchable(pids) {
  for (const pid of pids) {
    if (untouchablePids.has(pid) || originals.has(pid)) continue
    if (isNeverGoverned(pid) || !levers.canGovern(pid)) untouchablePids.add(pid)
  }
}

function audioSiblingPids(governablePids, now) {
  const holders = new Set()
  const audioImagePaths = new Set()
  for (const [pid, seenAt] of lastAudioAt) {
    if (now - seenAt > config.audioHoldMs) continue
    holders.add(pid)
    const image = imageNameForPid(pid)
    if (image?.path) audioImagePaths.add(image.path.toLowerCase())
  }
  if (audioImagePaths.size === 0) return holders
  for (const pid of governablePids) {
    const image = imageNameForPid(pid)
    if (image?.path && audioImagePaths.has(image.path.toLowerCase())) holders.add(pid)
  }
  return holders
}

function pinnedProcessIds(pids) {
  const pinned = new Set()
  if (pinnedPaths.size === 0) return pinned
  for (const pid of pids) {
    const image = imageNameForPid(pid)
    if (image?.path && pinnedPaths.has(image.path)) pinned.add(pid)
  }
  return pinned
}

function foregroundProcessId(graph) {
  const hwnd = windowGraph.foregroundWindow()
  if (!hwnd) return null
  const match = graph.windows.find((window) => window.hwnd === hwnd)
  const pid = match ? match.pid : windowEnum.windowProcessId(hwnd)
  if (pid) lastForegroundAt.set(pid, Date.now())
  return pid || null
}

function buildContext(graph, shellPids) {
  const now = Date.now()
  const governablePids = new Set(graph.governable.map((window) => window.pid))
  probeUntouchable(governablePids)
  const audioHolds = new Map(lastAudioAt)
  for (const pid of audioSiblingPids(governablePids, now)) audioHolds.set(pid, now)
  return {
    now,
    foregroundPid: foregroundProcessId(graph),
    lastForegroundAt,
    lastAudioAt: audioHolds,
    audioScanIntervalMs: AUDIO_SCAN_INTERVAL_MS,
    ioRates,
    lastBusyIoAt,
    cpuPercents,
    lastBusyCpuAt,
    startTimes,
    shellPids,
    pinnedPids: pinnedProcessIds(governablePids),
    untouchablePids: new Set([...untouchablePids, ...selfManagedPids]),
    fullscreenPids: windowGraph.fullscreenPids(graph, shellPids),
    memoryPressurePercent: levers.memoryPressurePercent(),
  }
}

function forgetDeadProcesses(livePids) {
  for (const tracker of [lastForegroundAt, ioRates, cpuPercents, lastBusyIoAt, lastBusyCpuAt, startTimes]) {
    for (const pid of [...tracker.keys()]) {
      if (!livePids.has(pid) && !appliedLevers.has(pid)) tracker.delete(pid)
    }
  }
  for (const set of [untouchablePids, selfManagedPids]) {
    for (const pid of [...set]) {
      if (!livePids.has(pid)) set.delete(pid)
    }
  }
  for (const pid of [...originals.keys()]) {
    if (!livePids.has(pid) && !appliedLevers.has(pid)) originals.delete(pid)
  }
}

function captureOriginalFor(pid) {
  if (originals.has(pid)) return originals.get(pid)
  const captured = levers.captureOriginal(pid)
  if (!captured) {
    untouchablePids.add(pid)
    return null
  }
  if (captured.selfManaged?.executionSpeed) selfManagedPids.add(pid)
  originals.set(pid, captured)
  return captured
}

function applyDecision(pid, targetLevers) {
  const original = captureOriginalFor(pid)
  if (!original) return
  if (policy.isNeutral(targetLevers)) {
    levers.restoreOriginal(pid, original)
    appliedLevers.delete(pid)
    forgetTouchedProcess(pid)
    return
  }
  rememberTouchedProcess(pid)
  levers.applyLevers(pid, targetLevers, original)
  appliedLevers.set(pid, targetLevers)
}

function revertProcess(pid) {
  if (!appliedLevers.has(pid)) return
  levers.restoreOriginal(pid, originals.get(pid))
  appliedLevers.delete(pid)
  forgetTouchedProcess(pid)
}

function markSettledAsInteractive(pid, now) {
  previousStates.set(pid, {
    state: policy.STATE_INTERACTIVE,
    rawState: policy.STATE_INTERACTIVE,
    rawSince: now,
    since: now,
    identity: startTimes.get(pid) ?? null,
  })
}

function revertEverything() {
  const now = Date.now()
  for (const pid of [...appliedLevers.keys()]) {
    revertProcess(pid)
    markSettledAsInteractive(pid, now)
  }
  originals.clear()
  journal = journalPolicy.createJournal()
  persistJournal()
}

function restartEveryDwell() {
  const now = Date.now()
  for (const [pid, previous] of previousStates) {
    previousStates.set(pid, { ...previous, rawSince: now, since: now })
  }
  for (const holds of [lastAudioAt, lastBusyIoAt, lastBusyCpuAt, lastForegroundAt]) {
    for (const pid of [...holds.keys()]) holds.set(pid, now)
  }
  ioSamples = new Map()
  cpuSamples = new Map()
}

function wake(pid) {
  if (!Number.isFinite(pid) || pid <= 0) return
  const now = Date.now()
  lastForegroundAt.set(pid, now)
  if (appliedLevers.has(pid)) revertProcess(pid)
  markSettledAsInteractive(pid, now)
}

function evaluate() {
  if (evaluating) return
  evaluating = true
  try {
    const shellPids = shellProcessIds()
    const graph = windowGraph.snapshot(shellPids)
    if (graph.monitors.length === 0) return
    const context = buildContext(graph, shellPids)
    const decisions = policy.resolveGovernedProcesses(graph.governable, context, config, previousStates)
    previousStates = policy.nextStateMap(decisions)

    for (const change of policy.pendingLeverChanges(decisions, appliedLevers)) {
      applyDecision(change.pid, change.levers)
    }
    for (const pid of policy.orphanedPids(appliedLevers, decisions)) {
      revertProcess(pid)
      originals.delete(pid)
    }
    forgetDeadProcesses(new Set(decisions.map((decision) => decision.pid)))

    lastDecisions = decisions.map((decision) => ({
      ...decision,
      name: imageNameForPid(decision.pid)?.name ?? null,
      path: imageNameForPid(decision.pid)?.path ?? null,
    }))
    publishState()
  } catch (e) {
    console.error('[processGovernor] evaluation failed:', e?.message ?? e)
  } finally {
    evaluating = false
  }
}

function scheduleEvaluate() {
  if (evaluateTimer) return
  evaluateTimer = setTimeout(() => {
    evaluateTimer = null
    evaluate()
  }, EVALUATE_DEBOUNCE_MS)
}

function onWindowEvent(hwnd, event) {
  if (event === EVENT_SYSTEM_FOREGROUND) wake(windowEnum.windowProcessId(hwnd))
  scheduleEvaluate()
}

async function scanAudioSessions() {
  const pids = await audioSessions.readActiveAudioPids()
  const now = Date.now()
  let wokeSomething = false
  for (const pid of pids) {
    if (appliedLevers.has(pid)) {
      revertProcess(pid)
      wokeSomething = true
    }
    lastAudioAt.set(pid, now)
  }
  for (const [pid, seenAt] of [...lastAudioAt]) {
    if (now - seenAt > config.audioHoldMs * 4 && !pids.includes(pid)) lastAudioAt.delete(pid)
  }
  if (wokeSomething) evaluate()
}

function getState() {
  return {
    config: { ...config, pinnedPaths: [...pinnedPaths] },
    capabilities: levers.describeCapabilities(),
    processes: lastDecisions,
    governedCount: appliedLevers.size,
  }
}

function publishState() {
  if (broadcastRef) broadcastRef('process-governor/state-changed', getState())
}

function setConfig(partial) {
  const wasEnabled = config.enabled
  config = policy.mergeConfig(config, partial)
  saveConfig()
  if (wasEnabled && !config.enabled) revertEverything()
  evaluate()
  return getState()
}

function setPinned(imagePath, pinned) {
  if (typeof imagePath !== 'string' || imagePath.length === 0) return getState()
  if (pinned) pinnedPaths.add(imagePath)
  else pinnedPaths.delete(imagePath)
  saveConfig()
  evaluate()
  return getState()
}

function stop() {
  if (unsubscribeWinEvents) {
    unsubscribeWinEvents()
    unsubscribeWinEvents = null
  }
  clearTimeout(evaluateTimer)
  clearInterval(sweepTimer)
  clearInterval(audioTimer)
  evaluateTimer = null
  sweepTimer = null
  audioTimer = null
  revertEverything()
  audioSessions.dispose()
}

module.exports = {
  wake,

  handlers: {
    'process-governor/state': () => getState(),
    'process-governor/config-set': (_event, partial) => setConfig(partial),
    'process-governor/pin': (_event, imagePath, pinned) => setPinned(imagePath, pinned),
    'process-governor/revert-all': () => {
      revertEverything()
      evaluate()
      return getState()
    },
  },

  start(broadcast) {
    const { app, powerMonitor } = require('electron')
    broadcastRef = broadcast
    loadConfig()
    recoverFromPreviousRun()
    audioSessions.warm()
    unsubscribeWinEvents = winEvents.subscribe('processGovernor', GOVERNOR_EVENTS, onWindowEvent)
    sweepTimer = setInterval(() => {
      refreshActivityRates(new Set(lastDecisions.map((decision) => decision.pid)))
      evaluate()
    }, SWEEP_INTERVAL_MS)
    audioTimer = setInterval(() => {
      scanAudioSessions().catch((e) => console.error('[processGovernor] audio scan failed:', e?.message ?? e))
    }, AUDIO_SCAN_INTERVAL_MS)
    scanAudioSessions().catch(() => {})
    for (const event of ['resume', 'unlock-screen']) {
      try {
        powerMonitor.on(event, restartEveryDwell)
      } catch (e) {
        console.error('[processGovernor] cannot subscribe to', event, '-', e?.message ?? e)
      }
    }
    evaluate()
    app.on('will-quit', stop)
  },
}
