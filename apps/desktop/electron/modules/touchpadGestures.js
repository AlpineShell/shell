const windowSwitcher = require('./windowSwitcher')
const { loadNativeTouchpad } = require('./touchpadNative')
const { IDLE_GESTURE, createFrameAssembler, nextGesture } = require('./touchpadGesturePolicy')

const SILENT_TOUCHPAD_MS = 1000

let gesture = IDLE_GESTURE
let silenceTimer = null
const pushReport = createFrameAssembler()

const GESTURE_ACTIONS = {
  begin: () => windowSwitcher.beginGesture(),
  step: ({ delta }) => windowSwitcher.stepGesture(delta),
  end: () => windowSwitcher.endGesture(),
}

function applyFrame(touching) {
  const outcome = nextGesture(gesture, touching)
  gesture = outcome.state
  for (const event of outcome.events) GESTURE_ACTIONS[event.type](event)
}

function endSilentGesture() {
  silenceTimer = null
  applyFrame([])
}

function rearmSilenceTimer() {
  if (silenceTimer) clearTimeout(silenceTimer)
  silenceTimer = gesture.phase === 'swiping' ? setTimeout(endSilentGesture, SILENT_TOUCHPAD_MS) : null
}

function handleReport(report) {
  try {
    const frame = pushReport(report)
    if (!frame) return
    applyFrame(frame)
    rearmSilenceTimer()
  } catch (e) {
    console.error('[touchpad] gesture error:', e?.message ?? e)
  }
}

function reportFailure(error) {
  console.error('[touchpad] touchpad watch failed:', error?.message ?? error)
}

module.exports = {
  handlers: {},

  start() {
    loadNativeTouchpad()?.watch(handleReport, reportFailure)
  },
}
