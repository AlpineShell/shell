const path = require('path')
const keyboardHookPolicy = require('./keyboardHookPolicy')

const WORKER_ENTRY = path.join(__dirname, '..', 'keyboardHookWorker.js')
const READY_TIMEOUT_MS = 5000
const WM_QUIT = 0x0012

let postThreadMessage = null

function postQuitToThread(threadId) {
  if (!postThreadMessage) {
    const koffi = require('koffi')
    const user32 = koffi.load('user32.dll')
    postThreadMessage = user32.func('__stdcall', 'PostThreadMessageW', 'int', ['uint32', 'uint32', 'uintptr_t', 'intptr_t'])
  }
  postThreadMessage(threadId, WM_QUIT, 0, 0)
}

function startKeyboardHookThread({ decide, onReady = () => {}, onLost, entry = WORKER_ENTRY }) {
  const { Worker } = require('worker_threads')
  const sharedBuffer = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * keyboardHookPolicy.SHARED_SLOTS)
  const shared = new Int32Array(sharedBuffer)
  const worker = new Worker(entry, { workerData: { sharedBuffer } })
  let threadId = 0
  let ended = false
  const readyTimer = setTimeout(() => lose('the hook thread did not start'), READY_TIMEOUT_MS)

  function decideSafely(request) {
    try {
      return Boolean(decide(request))
    } catch (e) {
      console.error('[keyboardHookThread] decide error:', e.message)
      return false
    }
  }

  function answer(request) {
    const late = keyboardHookPolicy.isVerdictLate(request.answerBy, keyboardHookPolicy.sharedClockNow())
    const swallow = !late && decideSafely(request)
    Atomics.store(shared, keyboardHookPolicy.VERDICT_SLOT, keyboardHookPolicy.encodeVerdict(request.seq, swallow))
    Atomics.notify(shared, keyboardHookPolicy.VERDICT_SLOT)
  }

  function end() {
    if (ended) return false
    ended = true
    clearTimeout(readyTimer)
    Atomics.store(shared, keyboardHookPolicy.CANCELLED_SLOT, 1)
    if (threadId) {
      try { postQuitToThread(threadId) } catch (e) { console.error('[keyboardHookThread] quit failed:', e.message) }
    }
    worker.terminate().catch(() => {})
    return true
  }

  function lose(reason) {
    if (end()) onLost(reason)
  }

  worker.on('message', (message) => {
    if (ended || !message) return
    if (message.type === 'key') {
      answer(message)
      return
    }
    if (message.type === 'ready') {
      clearTimeout(readyTimer)
      threadId = message.threadId
      onReady(message)
    }
  })
  worker.on('error', (e) => lose(`hook thread error: ${e && e.message}`))
  worker.on('exit', (code) => lose(`hook thread exited with code ${code}`))

  return { stop: end }
}

module.exports = { startKeyboardHookThread }
