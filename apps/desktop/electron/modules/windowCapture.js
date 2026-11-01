const path = require('path')

const PROCESS_ENTRY = path.join(__dirname, 'windowCaptureProcess.js')
const CAPTURE_TIMEOUT_MS = 2000
const MAX_CONSECUTIVE_FAILURES = 3
const RETRY_DELAY_MS = 60000

let captureProcess = null
let nextRequestId = 1
let consecutiveFailures = 0
let disabledUntil = 0
let quitHookInstalled = false
let queueTail = Promise.resolve()
const pending = new Map()

function settle(id, outcome) {
  const entry = pending.get(id)
  if (!entry) return
  pending.delete(id)
  clearTimeout(entry.timer)
  entry.resolve(outcome)
}

function settleAll(outcome) {
  for (const id of [...pending.keys()]) settle(id, outcome)
}

function noteFailure() {
  consecutiveFailures += 1
  if (consecutiveFailures < MAX_CONSECUTIVE_FAILURES) return
  consecutiveFailures = 0
  disabledUntil = Date.now() + RETRY_DELAY_MS
  console.error(`[windowCapture] capture process keeps failing, pausing captures for ${RETRY_DELAY_MS / 1000} s`)
}

function killProcess(proc) {
  try { proc.kill() } catch (e) { console.error('[windowCapture] kill failed:', e.message) }
}

function forgetProcess(proc) {
  if (captureProcess !== proc) return false
  captureProcess = null
  settleAll({ status: 'unavailable' })
  return true
}

function toImage({ width, height, pixels }) {
  return { width, height, pixels: Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength) }
}

function handleMessage(proc, message) {
  if (proc !== captureProcess || !message || typeof message.id !== 'number') return
  consecutiveFailures = 0
  settle(message.id, message.image ? { status: 'captured', ...toImage(message.image) } : { status: 'failed' })
}

function ensureProcess() {
  if (captureProcess) return captureProcess
  if (Date.now() < disabledUntil) return null
  const { app, utilityProcess } = require('electron')
  let proc
  try {
    proc = utilityProcess.fork(PROCESS_ENTRY, [], { serviceName: 'alpine-window-capture' })
  } catch (e) {
    console.error('[windowCapture] fork failed:', e.message)
    noteFailure()
    return null
  }
  captureProcess = proc
  proc.on('message', (message) => handleMessage(proc, message))
  proc.on('exit', () => {
    if (forgetProcess(proc)) noteFailure()
  })
  if (!quitHookInstalled) {
    quitHookInstalled = true
    app.once('will-quit', dispose)
  }
  return proc
}

function timeOut(proc, id) {
  settle(id, { status: 'timeout' })
  if (!forgetProcess(proc)) return
  noteFailure()
  killProcess(proc)
}

function send(payload) {
  const proc = ensureProcess()
  if (!proc) return Promise.resolve({ status: 'unavailable' })
  const id = nextRequestId++
  return new Promise((resolve) => {
    const timer = setTimeout(() => timeOut(proc, id), CAPTURE_TIMEOUT_MS)
    timer.unref?.()
    pending.set(id, { resolve, timer })
    try {
      proc.postMessage({ id, ...payload })
    } catch (e) {
      console.error('[windowCapture] post failed:', e.message)
      settle(id, { status: 'unavailable' })
    }
  })
}

function enqueue(payload) {
  const outcome = queueTail.then(() => send(payload))
  queueTail = outcome.catch(() => {})
  return outcome
}

function captureWindow(hwnd, { allowScreenCopy, maxWidth, maxHeight }) {
  return enqueue({ kind: 'window', hwnd, allowScreenCopy, maxWidth, maxHeight })
}

function captureScreenRect({ left, top, width, height }) {
  return enqueue({ kind: 'screen-rect', left, top, width, height })
}

function dispose() {
  const proc = captureProcess
  if (!proc) return
  forgetProcess(proc)
  killProcess(proc)
}

module.exports = { CAPTURE_TIMEOUT_MS, captureWindow, captureScreenRect, dispose }
