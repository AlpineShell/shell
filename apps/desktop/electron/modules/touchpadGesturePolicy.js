const SWIPE_FINGER_COUNT = 3
const ENGAGE_DISTANCE = 0.05
const STEP_DISTANCE = 0.12
const HORIZONTAL_DOMINANCE = 1.2

const IDLE_GESTURE = Object.freeze({ phase: 'idle' })

function createFrameAssembler() {
  let expected = 0
  let collected = []

  return function pushReport(report) {
    if (report.contactCount > 0) {
      expected = report.contactCount
      collected = []
    }
    if (expected === 0) return null
    collected.push(...report.contacts.slice(0, expected - collected.length))
    if (collected.length < expected) return null
    const frame = collected.filter((contact) => contact.touching)
    expected = 0
    collected = []
    return frame
  }
}

function centroid(contacts) {
  const sum = contacts.reduce((total, contact) => ({ x: total.x + contact.x, y: total.y + contact.y }), { x: 0, y: 0 })
  return { x: sum.x / contacts.length, y: sum.y / contacts.length }
}

function trackingStep(state, touching) {
  if (touching.length !== SWIPE_FINGER_COUNT) return { state: { phase: 'ignored' }, events: [] }
  const center = centroid(touching)
  const dx = center.x - state.anchor.x
  const dy = center.y - state.anchor.y
  if (Math.abs(dx) >= ENGAGE_DISTANCE && Math.abs(dx) >= Math.abs(dy) * HORIZONTAL_DOMINANCE) {
    return { state: { phase: 'swiping', anchor: center, steps: 0 }, events: [{ type: 'begin' }] }
  }
  if (Math.abs(dy) >= ENGAGE_DISTANCE) return { state: { phase: 'ignored' }, events: [] }
  return { state, events: [] }
}

function swipingStep(state, touching) {
  if (touching.length !== SWIPE_FINGER_COUNT) return { state: { phase: 'ignored' }, events: [{ type: 'end' }] }
  const steps = Math.trunc((centroid(touching).x - state.anchor.x) / STEP_DISTANCE)
  if (steps === state.steps) return { state, events: [] }
  return { state: { ...state, steps }, events: [{ type: 'step', delta: steps - state.steps }] }
}

function nextGesture(state, touching) {
  if (touching.length === 0) {
    return { state: IDLE_GESTURE, events: state.phase === 'swiping' ? [{ type: 'end' }] : [] }
  }
  if (state.phase === 'idle') {
    if (touching.length !== SWIPE_FINGER_COUNT) return { state, events: [] }
    return { state: { phase: 'tracking', anchor: centroid(touching) }, events: [] }
  }
  if (state.phase === 'tracking') return trackingStep(state, touching)
  if (state.phase === 'swiping') return swipingStep(state, touching)
  return { state, events: [] }
}

module.exports = {
  ENGAGE_DISTANCE,
  STEP_DISTANCE,
  IDLE_GESTURE,
  createFrameAssembler,
  nextGesture,
}
