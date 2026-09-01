const koffi = require('koffi')

const PDH_FMT_DOUBLE = 0x00000200
const PDH_SUCCESS = 0

const MEMORYSTATUSEX_SIZE = 64
const MEMORYSTATUSEX_TOTAL_PAGEFILE_OFFSET = 24
const MEMORYSTATUSEX_AVAIL_PAGEFILE_OFFSET = 32

const DWM_TIMING_INFO_SIZE = 320
const DWM_RATE_REFRESH_NUMERATOR_OFFSET = 4
const DWM_RATE_REFRESH_DENOMINATOR_OFFSET = 8
const DWM_FRAMES_LATE_OFFSET = 136
const DWM_FRAMES_DISPLAYED_OFFSET = 208
const DWM_FRAMES_DROPPED_OFFSET = 240

const PLAUSIBLE_MIN_REFRESH_HZ = 20
const PLAUSIBLE_MAX_REFRESH_HZ = 1000
const PLAUSIBLE_MAX_FRAMES_PER_SECOND = 2000
const PROCESS_ID_CAPACITY = 4096

const COUNTER_PATHS = {
  pageReadsPerSec: '\\Memory\\Page Reads/sec',
  pagesInputPerSec: '\\Memory\\Pages Input/sec',
  availableMBytes: '\\Memory\\Available MBytes',
  standbyNormalBytes: '\\Memory\\Standby Cache Normal Priority Bytes',
  standbyReserveBytes: '\\Memory\\Standby Cache Reserve Bytes',
  standbyCoreBytes: '\\Memory\\Standby Cache Core Bytes',
}

let bindings = null
let query = 0
let counters = null
let lastSystemTimes = null
let lastFrameSample = null
let frameCountersUsable = null

function loadBindings() {
  if (bindings !== null) return bindings
  bindings = { pdh: null, kernel32: null, dwmapi: null }
  try {
    const pdh = koffi.load('pdh.dll')
    bindings.pdh = {
      PdhOpenQueryW: pdh.func('__stdcall', 'PdhOpenQueryW', 'int32', ['void *', 'uintptr_t', koffi.out(koffi.pointer('uintptr_t'))]),
      PdhAddEnglishCounterW: pdh.func('__stdcall', 'PdhAddEnglishCounterW', 'int32', ['uintptr_t', 'str16', 'uintptr_t', koffi.out(koffi.pointer('uintptr_t'))]),
      PdhCollectQueryData: pdh.func('__stdcall', 'PdhCollectQueryData', 'int32', ['uintptr_t']),
      PdhGetFormattedCounterValue: pdh.func('__stdcall', 'PdhGetFormattedCounterValue', 'int32', ['uintptr_t', 'uint32', 'void *', 'void *']),
      PdhCloseQuery: pdh.func('__stdcall', 'PdhCloseQuery', 'int32', ['uintptr_t']),
    }
  } catch (e) {
    console.error('[perfProbeCounters] pdh.dll unavailable:', e?.message ?? e)
  }
  try {
    const kernel32 = koffi.load('kernel32.dll')
    bindings.kernel32 = {
      GlobalMemoryStatusEx: kernel32.func('__stdcall', 'GlobalMemoryStatusEx', 'int', ['void *']),
      GetSystemTimes: kernel32.func('__stdcall', 'GetSystemTimes', 'int', ['void *', 'void *', 'void *']),
      K32EnumProcesses: kernel32.func('__stdcall', 'K32EnumProcesses', 'int', ['void *', 'uint32', 'void *']),
    }
  } catch (e) {
    console.error('[perfProbeCounters] kernel32 bind failed:', e?.message ?? e)
  }
  try {
    const dwmapi = koffi.load('dwmapi.dll')
    bindings.dwmapi = {
      DwmGetCompositionTimingInfo: dwmapi.func('__stdcall', 'DwmGetCompositionTimingInfo', 'long', ['uintptr_t', 'void *']),
    }
  } catch (e) {
    console.error('[perfProbeCounters] dwmapi unavailable:', e?.message ?? e)
  }
  return bindings
}

function toNum(value) {
  return typeof value === 'bigint' ? Number(value) : value
}

function addCounter(pdh, path) {
  const handle = [0]
  const status = pdh.PdhAddEnglishCounterW(query, path, 0, handle)
  if (status !== PDH_SUCCESS) {
    console.error('[perfProbeCounters] counter unavailable:', path, status)
    return 0
  }
  return toNum(handle[0])
}

function openCounters() {
  const { pdh } = loadBindings()
  if (!pdh || query) return Boolean(query)
  const handle = [0]
  if (pdh.PdhOpenQueryW(null, 0, handle) !== PDH_SUCCESS) {
    console.error('[perfProbeCounters] PdhOpenQueryW failed')
    return false
  }
  query = toNum(handle[0])
  counters = {}
  for (const [field, path] of Object.entries(COUNTER_PATHS)) counters[field] = addCounter(pdh, path)
  pdh.PdhCollectQueryData(query)
  return true
}

function readCounter(handle) {
  const { pdh } = loadBindings()
  if (!pdh || !handle) return null
  const value = Buffer.alloc(16)
  if (pdh.PdhGetFormattedCounterValue(handle, PDH_FMT_DOUBLE, null, value) !== PDH_SUCCESS) return null
  if (value.readUInt32LE(0) !== PDH_SUCCESS) return null
  return value.readDoubleLE(8)
}

function readCommittedPercent() {
  const { kernel32 } = loadBindings()
  if (!kernel32) return null
  const status = Buffer.alloc(MEMORYSTATUSEX_SIZE)
  status.writeUInt32LE(MEMORYSTATUSEX_SIZE, 0)
  if (!kernel32.GlobalMemoryStatusEx(status)) return null
  const commitLimit = Number(status.readBigUInt64LE(MEMORYSTATUSEX_TOTAL_PAGEFILE_OFFSET))
  const commitAvailable = Number(status.readBigUInt64LE(MEMORYSTATUSEX_AVAIL_PAGEFILE_OFFSET))
  if (!commitLimit) return null
  return ((commitLimit - commitAvailable) / commitLimit) * 100
}

function sumStandbyBytes(values) {
  const parts = [values.standbyNormalBytes, values.standbyReserveBytes, values.standbyCoreBytes]
  const present = parts.filter((part) => typeof part === 'number' && Number.isFinite(part))
  if (present.length === 0) return null
  return present.reduce((total, part) => total + part, 0)
}

function sampleCounters() {
  const { pdh } = loadBindings()
  if (!pdh || !query || !counters) return null
  if (pdh.PdhCollectQueryData(query) !== PDH_SUCCESS) return null
  const raw = {}
  for (const field of Object.keys(COUNTER_PATHS)) raw[field] = readCounter(counters[field])
  return {
    pageReadsPerSec: raw.pageReadsPerSec,
    pagesInputPerSec: raw.pagesInputPerSec,
    availableMBytes: raw.availableMBytes,
    standbyBytes: sumStandbyBytes(raw),
    committedPercent: readCommittedPercent(),
  }
}

function readFileTime(buffer) {
  return Number(buffer.readBigUInt64LE(0))
}

function sampleCpuPercent() {
  const { kernel32 } = loadBindings()
  if (!kernel32) return null
  const idle = Buffer.alloc(8)
  const kernel = Buffer.alloc(8)
  const user = Buffer.alloc(8)
  if (!kernel32.GetSystemTimes(idle, kernel, user)) return null
  const current = { idle: readFileTime(idle), kernel: readFileTime(kernel), user: readFileTime(user) }
  const previous = lastSystemTimes
  lastSystemTimes = current
  if (!previous) return null
  const busyDelta = current.kernel - previous.kernel + (current.user - previous.user)
  const idleDelta = current.idle - previous.idle
  if (busyDelta <= 0) return null
  return Math.max(0, Math.min(100, ((busyDelta - idleDelta) / busyDelta) * 100))
}

function sampleProcessCount() {
  const { kernel32 } = loadBindings()
  if (!kernel32) return null
  const identifiers = Buffer.alloc(PROCESS_ID_CAPACITY * 4)
  const bytesReturned = Buffer.alloc(4)
  if (!kernel32.K32EnumProcesses(identifiers, identifiers.length, bytesReturned)) return null
  return bytesReturned.readUInt32LE(0) / 4
}

function readTimingInfo() {
  const { dwmapi } = loadBindings()
  if (!dwmapi) return null
  const info = Buffer.alloc(DWM_TIMING_INFO_SIZE)
  info.writeUInt32LE(DWM_TIMING_INFO_SIZE, 0)
  if (dwmapi.DwmGetCompositionTimingInfo(0, info) !== 0) return null
  const numerator = info.readUInt32LE(DWM_RATE_REFRESH_NUMERATOR_OFFSET)
  const denominator = info.readUInt32LE(DWM_RATE_REFRESH_DENOMINATOR_OFFSET)
  if (!denominator) return null
  const refreshHz = numerator / denominator
  if (refreshHz < PLAUSIBLE_MIN_REFRESH_HZ || refreshHz > PLAUSIBLE_MAX_REFRESH_HZ) return null
  return {
    refreshHz,
    displayed: Number(info.readBigUInt64LE(DWM_FRAMES_DISPLAYED_OFFSET)),
    dropped: Number(info.readBigUInt64LE(DWM_FRAMES_DROPPED_OFFSET)),
    late: Number(info.readBigUInt64LE(DWM_FRAMES_LATE_OFFSET)),
  }
}

function isPlausibleFrameDelta(delta, elapsedMs) {
  if (!Number.isFinite(delta) || delta < 0) return false
  const seconds = Math.max(elapsedMs, 1) / 1000
  return delta <= PLAUSIBLE_MAX_FRAMES_PER_SECOND * seconds
}

function sampleFrameDeltas(nowMs) {
  const current = readTimingInfo()
  if (!current) {
    frameCountersUsable = false
    return null
  }
  const previous = lastFrameSample
  lastFrameSample = { ...current, at: nowMs }
  if (!previous) return null
  const elapsedMs = nowMs - previous.at
  const deltas = {
    displayed: current.displayed - previous.displayed,
    dropped: current.dropped - previous.dropped,
    late: current.late - previous.late,
  }
  for (const delta of Object.values(deltas)) {
    if (!isPlausibleFrameDelta(delta, elapsedMs)) {
      frameCountersUsable = false
      return null
    }
  }
  if (deltas.displayed > 0) frameCountersUsable = true
  return deltas
}

function frameCountersAvailable() {
  return frameCountersUsable === true
}

function refreshHz() {
  return lastFrameSample ? lastFrameSample.refreshHz : null
}

function close() {
  const { pdh } = loadBindings()
  if (pdh && query) {
    try { pdh.PdhCloseQuery(query) } catch (_) {}
  }
  query = 0
  counters = null
  lastSystemTimes = null
  lastFrameSample = null
}

module.exports = {
  COUNTER_PATHS,
  openCounters,
  sampleCounters,
  sampleCpuPercent,
  sampleProcessCount,
  sampleFrameDeltas,
  frameCountersAvailable,
  refreshHz,
  close,
}
