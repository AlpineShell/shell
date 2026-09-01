const fs = require('fs')
const path = require('path')
const koffi = require('koffi')
const winEvents = require('./winEvents')
const windowEnum = require('./windowEnum')
const counters = require('./perfProbeCounters')
const policy = require('./perfProbePolicy')

const user32 = koffi.load('user32.dll')
const SendMessageTimeoutW = user32.func('__stdcall', 'SendMessageTimeoutW', 'intptr_t', ['uintptr_t', 'uint32', 'uintptr_t', 'intptr_t', 'uint32', 'uint32', 'void *'])
const IsHungAppWindow = user32.func('__stdcall', 'IsHungAppWindow', 'int', ['uintptr_t'])
const IsWindow = user32.func('__stdcall', 'IsWindow', 'int', ['uintptr_t'])

const EVENT_SYSTEM_FOREGROUND = 0x0003
const WM_NULL = 0x0000
const SMTO_BLOCK = 0x0001
const SMTO_ABORTIFHUNG = 0x0002

const RESPONSE_TIMEOUT_MS = 1000
const COUNTER_INTERVAL_MS = 5000
const SESSION_DIRECTORY = 'perf-probe'
const FLUSH_INTERVAL_MS = 15000
const PROCESS_NAME_CACHE_LIMIT = 256

let broadcastRef = null
let unsubscribeWinEvents = null
let counterTimer = null
let flushTimer = null
let pendingRecords = []
let session = null
const processNames = new Map()

function probeDirectory() {
  const { app } = require('electron')
  return path.join(app.getPath('userData'), SESSION_DIRECTORY)
}

function sessionFilePath(name) {
  return path.join(probeDirectory(), `${name}.jsonl`)
}

function processNameForPid(pid) {
  if (!pid) return null
  if (processNames.has(pid)) return processNames.get(pid)
  let name = null
  try {
    const imagePath = windowEnum.processImagePath(pid)
    name = imagePath ? windowEnum.processNameFromPath(imagePath) : null
  } catch (_) {
    name = null
  }
  if (processNames.size >= PROCESS_NAME_CACHE_LIMIT) processNames.clear()
  processNames.set(pid, name)
  return name
}

function measureWindowResponse(hwnd) {
  const result = Buffer.alloc(8)
  const startedAt = process.hrtime.bigint()
  const answered = SendMessageTimeoutW(hwnd, WM_NULL, 0, 0, SMTO_BLOCK | SMTO_ABORTIFHUNG, RESPONSE_TIMEOUT_MS, result)
  const elapsedNs = Number(process.hrtime.bigint() - startedAt)
  return { latencyMs: elapsedNs / 1e6, timedOut: !answered }
}

function recordForegroundSwitch(hwnd) {
  if (!session || !hwnd || !IsWindow(hwnd)) return
  const hung = IsHungAppWindow(hwnd) !== 0
  const { latencyMs, timedOut } = measureWindowResponse(hwnd)
  const pid = windowEnum.windowProcessId(hwnd)
  append({
    kind: policy.SWITCH_RECORD,
    at: Date.now(),
    hwnd,
    pid,
    process: processNameForPid(pid),
    latencyMs,
    hung,
    timedOut,
    shellOwned: pid === process.pid,
  })
}

function countTaskbarWindows() {
  try {
    return windowEnum.enumerateWindows(windowEnum.taskbarWindowPredicate).length
  } catch (_) {
    return null
  }
}

function sampleCounters() {
  if (!session) return
  const at = Date.now()
  const values = counters.sampleCounters()
  if (values) append({ kind: policy.COUNTER_RECORD, at, values })
  const frames = counters.sampleFrameDeltas(at)
  if (frames) append({ kind: policy.FRAME_RECORD, at, ...frames })
  append({
    kind: policy.LOAD_RECORD,
    at,
    cpuPercent: counters.sampleCpuPercent(),
    windowCount: countTaskbarWindows(),
    processCount: counters.sampleProcessCount(),
  })
}

function append(record) {
  if (!session) return
  session.recordCount += 1
  pendingRecords.push(record)
}

function flush() {
  if (!session || pendingRecords.length === 0) return
  const lines = pendingRecords.map((record) => JSON.stringify(record)).join('\n')
  pendingRecords = []
  try {
    fs.appendFileSync(session.file, `${lines}\n`)
  } catch (e) {
    console.error('[perfProbe] flush failed:', e?.message ?? e)
  }
}

function readSessionRecords(name) {
  let raw = ''
  try {
    raw = fs.readFileSync(sessionFilePath(name), 'utf8')
  } catch (_) {
    return null
  }
  const records = []
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    try {
      records.push(JSON.parse(line))
    } catch (_) {
      continue
    }
  }
  return records
}

function listSessions() {
  try {
    return fs.readdirSync(probeDirectory())
      .filter((name) => name.endsWith('.jsonl'))
      .map((name) => name.replace(/\.jsonl$/, ''))
  } catch (_) {
    return []
  }
}

function getState() {
  return {
    recording: Boolean(session),
    label: session ? session.label : null,
    name: session ? session.name : null,
    startedAt: session ? session.startedAt : null,
    recordCount: session ? session.recordCount : 0,
    frameStatsAvailable: counters.frameCountersAvailable(),
    sessions: listSessions(),
  }
}

function publishState() {
  if (broadcastRef) broadcastRef('perf-probe/state-changed', getState())
}

function startSession(label) {
  if (session) stopSession()
  const startedAt = Date.now()
  const name = `${policy.sanitizeLabel(label)}-${startedAt}`
  try {
    fs.mkdirSync(probeDirectory(), { recursive: true })
  } catch (e) {
    console.error('[perfProbe] cannot create probe directory:', e?.message ?? e)
    return getState()
  }
  session = { label: policy.sanitizeLabel(label), name, file: sessionFilePath(name), startedAt, recordCount: 0 }
  counters.openCounters()
  counters.sampleCpuPercent()
  counters.sampleFrameDeltas(startedAt)
  unsubscribeWinEvents = winEvents.subscribe('perfProbe', [EVENT_SYSTEM_FOREGROUND], recordForegroundSwitch)
  counterTimer = setInterval(sampleCounters, COUNTER_INTERVAL_MS)
  flushTimer = setInterval(flush, FLUSH_INTERVAL_MS)
  publishState()
  return getState()
}

function stopSession() {
  if (!session) return getState()
  if (unsubscribeWinEvents) {
    unsubscribeWinEvents()
    unsubscribeWinEvents = null
  }
  clearInterval(counterTimer)
  clearInterval(flushTimer)
  counterTimer = null
  flushTimer = null
  sampleCounters()
  flush()
  const finished = session.name
  session = null
  counters.close()
  publishState()
  return { ...getState(), lastSession: finished }
}

function summarize(name) {
  const records = readSessionRecords(name)
  if (!records) return null
  return policy.summarizeSession(records, name)
}

module.exports = {
  handlers: {
    'perf-probe/state': () => getState(),
    'perf-probe/start': (_event, label) => startSession(label),
    'perf-probe/stop': () => stopSession(),
    'perf-probe/summary': (_event, name) => summarize(name),
    'perf-probe/compare': (_event, before, after) => policy.compareSessions(summarize(before), summarize(after)),
  },

  start(broadcast) {
    const { app } = require('electron')
    broadcastRef = broadcast
    app.on('will-quit', stopSession)
    const requestedLabel = policy.labelFromCommandLine(process.argv)
    if (requestedLabel) startSession(requestedLabel)
  },
}
