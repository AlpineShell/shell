const fs = require('fs')
const path = require('path')
const winEvents = require('./winEvents')
const windowEnum = require('./windowEnum')
const windowGraph = require('./windowGraph')
const levers = require('./processGovernorLevers')
const policy = require('./processGovernorPolicy')

const CONFIG_FILE = 'process-governor.json'

const EVENT_SYSTEM_FOREGROUND = 0x0003
const EVENT_SYSTEM_MINIMIZESTART = 0x0016
const EVENT_SYSTEM_MINIMIZEEND = 0x0017
const EVENT_OBJECT_SHOW = 0x8002
const GOVERNOR_EVENTS = [EVENT_SYSTEM_FOREGROUND, EVENT_SYSTEM_MINIMIZESTART, EVENT_SYSTEM_MINIMIZEEND, EVENT_OBJECT_SHOW]

const EVALUATE_DEBOUNCE_MS = 250
const SWEEP_INTERVAL_MS = 5000
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

let previousStates = new Map()
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

function refreshIoRates(pids) {
  const now = Date.now()
  const nextSamples = new Map()
  for (const pid of pids) {
    const snapshot = levers.readProcessSnapshot(pid)
    if (!snapshot || !Number.isFinite(snapshot.ioTransferTotal)) continue
    nextSamples.set(pid, { total: snapshot.ioTransferTotal, at: now })
    const previous = ioSamples.get(pid)
    if (!previous || now <= previous.at) continue
    const delta = snapshot.ioTransferTotal - previous.total
    if (delta < 0) continue
    ioRates.set(pid, (delta * 1000) / (now - previous.at))
  }
  for (const pid of [...ioRates.keys()]) {
    if (!nextSamples.has(pid)) ioRates.delete(pid)
  }
  ioSamples = nextSamples
}

function probeUntouchable(pids) {
  for (const pid of pids) {
    if (untouchablePids.has(pid)) continue
    if (isNeverGoverned(pid) || !levers.canGovern(pid)) untouchablePids.add(pid)
  }
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
  const governablePids = new Set(graph.governable.map((window) => window.pid))
  probeUntouchable(governablePids)
  return {
    now: Date.now(),
    foregroundPid: foregroundProcessId(graph),
    lastForegroundAt,
    lastAudioAt,
    ioRates,
    shellPids,
    pinnedPids: pinnedProcessIds(governablePids),
    untouchablePids,
    fullscreenPid: windowGraph.fullscreenForegroundPid(shellPids),
    memoryPressurePercent: levers.memoryPressurePercent(),
  }
}

function forgetDeadProcesses(livePids) {
  for (const tracker of [lastForegroundAt, ioRates]) {
    for (const pid of [...tracker.keys()]) {
      if (!livePids.has(pid)) tracker.delete(pid)
    }
  }
  for (const pid of [...untouchablePids]) {
    if (!livePids.has(pid)) untouchablePids.delete(pid)
  }
}

function evaluate() {
  if (evaluating) return
  evaluating = true
  try {
    const shellPids = shellProcessIds()
    const graph = windowGraph.snapshot(shellPids)
    const context = buildContext(graph, shellPids)
    const decisions = policy.resolveGovernedProcesses(graph.governable, context, config, previousStates)
    previousStates = policy.nextStateMap(decisions)
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
  if (event === EVENT_SYSTEM_FOREGROUND) {
    const pid = windowEnum.windowProcessId(hwnd)
    if (pid) lastForegroundAt.set(pid, Date.now())
  }
  scheduleEvaluate()
}

function getState() {
  return {
    config: { ...config, pinnedPaths: [...pinnedPaths] },
    capabilities: levers.describeCapabilities(),
    processes: lastDecisions,
    governedCount: 0,
  }
}

function publishState() {
  if (broadcastRef) broadcastRef('process-governor/state-changed', getState())
}

function setConfig(partial) {
  config = policy.mergeConfig(config, partial)
  saveConfig()
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
  evaluateTimer = null
  sweepTimer = null
}

module.exports = {
  handlers: {
    'process-governor/state': () => getState(),
    'process-governor/config-set': (_event, partial) => setConfig(partial),
    'process-governor/pin': (_event, imagePath, pinned) => setPinned(imagePath, pinned),
    'process-governor/revert-all': () => getState(),
  },

  start(broadcast) {
    const { app } = require('electron')
    broadcastRef = broadcast
    loadConfig()
    unsubscribeWinEvents = winEvents.subscribe('processGovernor', GOVERNOR_EVENTS, onWindowEvent)
    sweepTimer = setInterval(() => {
      refreshIoRates(new Set(lastDecisions.map((decision) => decision.pid)))
      evaluate()
    }, SWEEP_INTERVAL_MS)
    evaluate()
    app.on('will-quit', stop)
  },
}
