const path = require('path')
const { Worker } = require('worker_threads')
const koffi = require('koffi')
const winEvents = require('./winEvents')
const batterySaver = require('./batterySaver')
const policy = require('./perfProbePolicy')
const { createPersistentRunner } = require('../powershell')

const EVENT_SYSTEM_FOREGROUND = 0x0003
const SAMPLE_INTERVAL_MS = 10000
const BATTERY_SAVER_SAMPLE_INTERVAL_MS = 60000
const COUNTER_COMMAND_TIMEOUT_MS = 5000
const PAGE_READS_SCALE = 100
const ACK_WORKER_ENTRY = path.join(__dirname, '..', 'perfProbeAckWorker.js')

const MEMORY_COUNTER_NAMES = {
  pageReads: 'Page Reads/sec',
  standbyNormal: 'Standby Cache Normal Priority Bytes',
  standbyReserve: 'Standby Cache Reserve Bytes',
  standbyCore: 'Standby Cache Core Bytes',
}

const COUNTER_CONSTRUCTORS = Object.entries(MEMORY_COUNTER_NAMES)
  .map(([field, counter]) => `${field} = New-Object System.Diagnostics.PerformanceCounter('Memory', '${counter}')`)
  .join('; ')

const COUNTER_INIT_SCRIPT = `$global:alpinePerfProbeCounters = $null; try { $global:alpinePerfProbeCounters = @{ ${COUNTER_CONSTRUCTORS} }; $null = $global:alpinePerfProbeCounters.pageReads.NextValue() } catch { $global:alpinePerfProbeCounters = $null }`

const COUNTER_SAMPLE_COMMAND = 'if ($global:alpinePerfProbeCounters) { $c = $global:alpinePerfProbeCounters; "$([int64]($c.pageReads.NextValue() * 100))|$([int64]($c.standbyNormal.NextValue() + $c.standbyReserve.NextValue() + $c.standbyCore.NextValue()))" }'

const counterRunner = createPersistentRunner(undefined, COUNTER_COMMAND_TIMEOUT_MS, COUNTER_INIT_SCRIPT)

let readMemoryStatus = null
let readCompositionTiming = null
let broadcastRef = null
let unsubscribeWinEvents = null
let stopPolling = null
let ackWorker = null
let ackInFlight = false
let sampling = false
let switchSamples = []
let pageReadSamples = []
let memorySamples = []
let dwmSamples = []

function loadMemoryStatusReader() {
  const kernel32 = koffi.load('kernel32.dll')
  const MEMORYSTATUSEX = koffi.struct('MEMORYSTATUSEX', {
    dwLength: 'uint32',
    dwMemoryLoad: 'uint32',
    ullTotalPhys: 'uint64',
    ullAvailPhys: 'uint64',
    ullTotalPageFile: 'uint64',
    ullAvailPageFile: 'uint64',
    ullTotalVirtual: 'uint64',
    ullAvailVirtual: 'uint64',
    ullAvailExtendedVirtual: 'uint64',
  })
  const GlobalMemoryStatusEx = kernel32.func('__stdcall', 'GlobalMemoryStatusEx', 'int', ['void *'])
  const structSize = koffi.sizeof(MEMORYSTATUSEX)
  return () => {
    const buffer = Buffer.alloc(structSize)
    buffer.writeUInt32LE(structSize, 0)
    if (!GlobalMemoryStatusEx(buffer)) return null
    const status = koffi.decode(buffer, MEMORYSTATUSEX)
    return { totalBytes: status.ullTotalPhys, availableBytes: status.ullAvailPhys }
  }
}

function loadCompositionTimingReader() {
  const dwmapi = koffi.load('dwmapi.dll')
  const DWM_TIMING_INFO = koffi.struct('DWM_TIMING_INFO', {
    cbSize: 'uint32',
    rateRefreshNumerator: 'uint32',
    rateRefreshDenominator: 'uint32',
    qpcRefreshPeriod: 'uint64',
    rateComposeNumerator: 'uint32',
    rateComposeDenominator: 'uint32',
    qpcVBlank: 'uint64',
    cRefresh: 'uint64',
    cDXRefresh: 'uint32',
    qpcCompose: 'uint64',
    cFrame: 'uint64',
    cDXPresent: 'uint32',
    cRefreshFrame: 'uint64',
    cFrameSubmitted: 'uint64',
    cDXPresentSubmitted: 'uint32',
    cFrameConfirmed: 'uint64',
    cDXPresentConfirmed: 'uint32',
    cRefreshConfirmed: 'uint64',
    cDXRefreshConfirmed: 'uint32',
    cFramesLate: 'uint64',
    cFramesOutstanding: 'uint32',
    cFrameDisplayed: 'uint64',
    qpcFrameDisplayed: 'uint64',
    cRefreshFrameDisplayed: 'uint64',
    cFrameComplete: 'uint64',
    qpcFrameComplete: 'uint64',
    cFramePending: 'uint64',
    qpcFramePending: 'uint64',
    cFramesDisplayed: 'uint64',
    cFramesComplete: 'uint64',
    cFramesPending: 'uint64',
    cFramesAvailable: 'uint64',
    cFramesDropped: 'uint64',
    cFramesMissed: 'uint64',
    cRefreshNextDisplayed: 'uint64',
    cRefreshNextPresented: 'uint64',
    cRefreshesDisplayed: 'uint64',
    cRefreshesPresented: 'uint64',
    cRefreshStarted: 'uint64',
    cPixelsReceived: 'uint64',
    cPixelsDrawn: 'uint64',
    cBuffersEmpty: 'uint64',
  })
  const DwmGetCompositionTimingInfo = dwmapi.func('__stdcall', 'DwmGetCompositionTimingInfo', 'long', ['uintptr_t', 'void *'])
  const structSize = koffi.sizeof(DWM_TIMING_INFO)
  return () => {
    const buffer = Buffer.alloc(structSize)
    buffer.writeUInt32LE(structSize, 0)
    if (DwmGetCompositionTimingInfo(0, buffer) !== 0) return null
    const timing = koffi.decode(buffer, DWM_TIMING_INFO)
    return {
      refreshRateHz: refreshRateFrom(timing.rateRefreshNumerator, timing.rateRefreshDenominator),
      framesLate: timing.cFramesLate,
      framesDropped: timing.cFramesDropped,
    }
  }
}

function refreshRateFrom(numerator, denominator) {
  if (!denominator) return null
  return Math.round((numerator / denominator) * 10) / 10
}

function loadNativeReaders() {
  try {
    readMemoryStatus = loadMemoryStatusReader()
  } catch (e) {
    console.error('[perfProbe] GlobalMemoryStatusEx load failed:', e?.message ?? e)
  }
  try {
    readCompositionTiming = loadCompositionTimingReader()
  } catch (e) {
    console.error('[perfProbe] DwmGetCompositionTimingInfo load failed:', e?.message ?? e)
  }
}

function summary() {
  return policy.summarizePerfProbe({
    nowMs: Date.now(),
    windowMs: policy.DEFAULT_WINDOW_MS,
    switches: switchSamples,
    pageReads: pageReadSamples,
    memory: memorySamples,
    dwmFrames: dwmSamples,
  })
}

function publishSummary() {
  const published = summary()
  if (broadcastRef) broadcastRef('perf-probe/summary-changed', published)
  return published
}

function onForegroundChanged(hwnd) {
  if (!ackWorker || ackInFlight) return
  ackInFlight = true
  ackWorker.postMessage({ hwnd, startedAt: process.hrtime.bigint(), timeoutMs: policy.SWITCH_ACK_TIMEOUT_MS })
}

function recordSwitchAck(reply) {
  ackInFlight = false
  if (!reply || reply.failed) return
  const at = Date.now()
  switchSamples = policy.appendSample(switchSamples, { at, latencyMs: reply.latencyMs, timedOut: reply.timedOut }, at, policy.DEFAULT_WINDOW_MS)
}

function forgetAckWorker() {
  ackWorker = null
  ackInFlight = false
}

function startAckWorker() {
  try {
    const worker = new Worker(ACK_WORKER_ENTRY)
    worker.on('message', recordSwitchAck)
    worker.on('error', (e) => {
      console.error('[perfProbe] foreground ack worker failed:', e?.message ?? e)
      forgetAckWorker()
    })
    worker.on('exit', forgetAckWorker)
    worker.unref()
    ackWorker = worker
  } catch (e) {
    console.error('[perfProbe] foreground ack worker unavailable:', e?.message ?? e)
  }
}

function parseCounterSample(raw) {
  const [scaledPageReads, standbyBytes] = String(raw ?? '').trim().split('|')
  if (!scaledPageReads || !standbyBytes) return null
  const pageReads = Number(scaledPageReads)
  const standby = Number(standbyBytes)
  if (!Number.isFinite(pageReads) || !Number.isFinite(standby)) return null
  return { pageReadsPerSecond: pageReads / PAGE_READS_SCALE, standbyBytes: standby }
}

function readNative(read, label) {
  if (!read) return null
  try {
    return read()
  } catch (e) {
    console.error(`[perfProbe] ${label} read failed:`, e?.message ?? e)
    return null
  }
}

async function recordSample() {
  const counters = parseCounterSample(await counterRunner.run(COUNTER_SAMPLE_COMMAND))
  const memory = readNative(readMemoryStatus, 'memory status')
  const timing = readNative(readCompositionTiming, 'composition timing')
  const at = Date.now()
  const sampleWindowMs = policy.DEFAULT_WINDOW_MS
  if (counters) {
    pageReadSamples = policy.appendSample(pageReadSamples, { at, pageReadsPerSecond: counters.pageReadsPerSecond }, at, sampleWindowMs)
  }
  if (counters || memory) {
    const sample = { at, totalBytes: memory?.totalBytes ?? null, availableBytes: memory?.availableBytes ?? null, standbyBytes: counters?.standbyBytes ?? null }
    memorySamples = policy.appendSample(memorySamples, sample, at, sampleWindowMs)
  }
  if (timing) {
    dwmSamples = policy.appendSample(dwmSamples, { at, supported: true, ...timing }, at, sampleWindowMs)
  }
  publishSummary()
}

async function recordSampleUnlessBusy() {
  if (sampling) return
  sampling = true
  try {
    await recordSample()
  } catch (e) {
    console.error('[perfProbe] sample failed:', e?.message ?? e)
  } finally {
    sampling = false
  }
}

function stop() {
  if (unsubscribeWinEvents) {
    unsubscribeWinEvents()
    unsubscribeWinEvents = null
  }
  if (stopPolling) {
    stopPolling()
    stopPolling = null
  }
  counterRunner.dispose()
  if (ackWorker) ackWorker.terminate()
}

module.exports = {
  handlers: {
    'perf-probe/summary-get': () => summary(),
    'perf-probe/reset': () => {
      switchSamples = []
      pageReadSamples = []
      memorySamples = []
      dwmSamples = []
      return publishSummary()
    },
  },

  start(broadcast) {
    const { app } = require('electron')
    broadcastRef = broadcast
    loadNativeReaders()
    startAckWorker()
    unsubscribeWinEvents = winEvents.subscribe('perfProbe', [EVENT_SYSTEM_FOREGROUND], onForegroundChanged)
    counterRunner.warm()
    stopPolling = batterySaver.startAdaptivePolling(recordSampleUnlessBusy, SAMPLE_INTERVAL_MS, BATTERY_SAVER_SAMPLE_INTERVAL_MS)
    app.on('will-quit', stop)
  },
}
