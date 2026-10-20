const fs = require('fs')
const path = require('path')
const shellHotkeys = require('./shellHotkeys')
const {
  buildShellShortcuts,
  createShortcutRecorder,
  effectiveChords,
  isDefaultChord,
  sanitizeOverrides,
  shortcutListing,
  validateChord,
} = require('./shellShortcutBindings')

const STORE_FILE = 'shell-shortcuts.json'
const RECORDING_TIMEOUT_MS = 15000
const MAPVK_VK_TO_CHAR = 2
const DEAD_KEY_BIT = 0x80000000

const recorder = createShortcutRecorder()
let overrides = {}
let recording = null
let broadcast = null
let mapVirtualKey = null

function storePath() {
  const { app } = require('electron')
  return path.join(app.getPath('userData'), STORE_FILE)
}

function load() {
  try {
    const file = storePath()
    if (fs.existsSync(file)) overrides = sanitizeOverrides(JSON.parse(fs.readFileSync(file, 'utf8')).bindings)
  } catch (e) {
    console.error('[shellShortcuts] load error:', e.message)
  }
}

function save() {
  try {
    fs.writeFileSync(storePath(), JSON.stringify({ bindings: overrides }, null, 2))
  } catch (e) {
    console.error('[shellShortcuts] save error:', e.message)
  }
}

function charOfKey(vkCode) {
  try {
    if (!mapVirtualKey) {
      const koffi = require('koffi')
      mapVirtualKey = koffi.load('user32.dll').func('__stdcall', 'MapVirtualKeyW', 'uint32', ['uint32', 'uint32'])
    }
    const mapped = mapVirtualKey(vkCode, MAPVK_VK_TO_CHAR)
    if (!mapped) return null
    return String.fromCharCode((mapped & ~DEAD_KEY_BIT) & 0xffff)
  } catch {
    return null
  }
}

function listing() {
  return shortcutListing(overrides, charOfKey)
}

function apply() {
  shellHotkeys.setShortcuts(buildShellShortcuts(effectiveChords(overrides)))
  if (broadcast) broadcast('shortcuts/changed', listing())
}

function finishRecording(result) {
  if (!recording) return
  const { resolve, timer } = recording
  recording = null
  clearTimeout(timer)
  recorder.stop()
  resolve(result)
}

function adoptChord(id, chord) {
  const verdict = validateChord(id, chord, effectiveChords(overrides))
  if (!verdict.ok) return verdict
  if (isDefaultChord(id, verdict.chord)) delete overrides[id]
  else overrides[id] = verdict.chord
  save()
  apply()
  return { ok: true }
}

function settleRecording(outcome) {
  if (!recording) return
  if (outcome.kind === 'cancelled') return finishRecording({ ok: false, reason: 'cancelled' })
  finishRecording(adoptChord(recording.id, outcome.chord))
}

function handleRecordingKey(keyEvent) {
  const { swallow, outcome } = recorder.handleKey(keyEvent)
  if (outcome) setImmediate(() => settleRecording(outcome))
  return swallow
}

function record(id) {
  finishRecording({ ok: false, reason: 'cancelled' })
  return new Promise((resolve) => {
    const timer = setTimeout(() => finishRecording({ ok: false, reason: 'timeout' }), RECORDING_TIMEOUT_MS)
    recording = { id, resolve, timer }
    recorder.start()
  })
}

function reset(id) {
  if (Object.hasOwn(overrides, id)) {
    delete overrides[id]
    save()
    apply()
  }
  return listing()
}

module.exports = {
  handlers: {
    'shortcuts/list': () => listing(),
    'shortcuts/record': (_event, id) => record(id),
    'shortcuts/cancel-record': () => finishRecording({ ok: false, reason: 'cancelled' }),
    'shortcuts/reset': (_event, id) => reset(id),
  },
  handleRecordingKey,
  start(broadcastFn) {
    broadcast = broadcastFn
    load()
    apply()
  },
}
