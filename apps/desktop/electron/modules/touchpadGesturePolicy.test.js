import { describe, it, expect } from 'vitest'
import touchpadGesturePolicy from './touchpadGesturePolicy.js'

const { ENGAGE_DISTANCE, STEP_DISTANCE, IDLE_GESTURE, nextGesture } = touchpadGesturePolicy

function fingers(count, x, y = 0.5) {
  return Array.from({ length: count }, (_, index) => ({ id: index, x: x + index * 0.01, y }))
}

function runFrames(frames) {
  let state = IDLE_GESTURE
  const events = []
  for (const frame of frames) {
    const outcome = nextGesture(state, frame)
    state = outcome.state
    events.push(...outcome.events)
  }
  return { state, events }
}

describe('nextGesture', () => {
  it('begins a swipe once three fingers travel sideways', () => {
    const { state, events } = runFrames([fingers(3, 0.3), fingers(3, 0.3 + ENGAGE_DISTANCE)])
    expect(state.phase).toBe('swiping')
    expect(events).toEqual([{ type: 'begin' }])
  })

  it('steps once per step distance in either direction', () => {
    const start = 0.3 + ENGAGE_DISTANCE
    const { events } = runFrames([
      fingers(3, 0.3),
      fingers(3, start),
      fingers(3, start + STEP_DISTANCE * 2.5),
      fingers(3, start - STEP_DISTANCE * 1.5),
    ])
    expect(events).toEqual([{ type: 'begin' }, { type: 'step', delta: 2 }, { type: 'step', delta: -3 }])
  })

  it('ends the swipe when a finger lifts and waits for the rest', () => {
    const { state, events } = runFrames([
      fingers(3, 0.3),
      fingers(3, 0.3 + ENGAGE_DISTANCE),
      fingers(2, 0.3 + ENGAGE_DISTANCE),
      fingers(3, 0.9),
    ])
    expect(events).toEqual([{ type: 'begin' }, { type: 'end' }])
    expect(state.phase).toBe('ignored')
  })

  it('ends the swipe when every finger lifts at once', () => {
    const { state, events } = runFrames([fingers(3, 0.3), fingers(3, 0.3 + ENGAGE_DISTANCE), []])
    expect(events).toEqual([{ type: 'begin' }, { type: 'end' }])
    expect(state).toBe(IDLE_GESTURE)
  })

  it('leaves vertical three-finger swipes alone', () => {
    const { state, events } = runFrames([fingers(3, 0.3, 0.5), fingers(3, 0.31, 0.5 + ENGAGE_DISTANCE * 2)])
    expect(events).toEqual([])
    expect(state.phase).toBe('ignored')
  })

  it('leaves two- and four-finger movement alone', () => {
    expect(runFrames([fingers(2, 0.3), fingers(2, 0.6)]).events).toEqual([])
    expect(runFrames([fingers(4, 0.3), fingers(4, 0.6)]).events).toEqual([])
    expect(runFrames([fingers(3, 0.3), fingers(4, 0.6)]).events).toEqual([])
  })
})
