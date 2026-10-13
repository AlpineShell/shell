import { describe, it, expect } from 'vitest'
import keyboardHookPolicy from './keyboardHookPolicy.js'

const {
  HOOK_REFRESH_TICK_MS,
  HOOK_STALL_MS,
  HOOK_RETRY_MS,
  WM_KEYDOWN,
  WM_KEYUP,
  WM_SYSKEYDOWN,
  WM_SYSKEYUP,
  LLKHF_INJECTED,
  KEY_STRUCT_BYTES,
  hookRefreshDue,
  keyEventFromHookStruct,
  routeKeyEvent,
} = keyboardHookPolicy

const VK_M = 0x4D
const SCAN_M = 0x32

function hookStruct({ vkCode = VK_M, scanCode = SCAN_M, flags = 0 } = {}) {
  const keyStruct = Buffer.alloc(KEY_STRUCT_BYTES)
  keyStruct.writeUInt32LE(vkCode, 0)
  keyStruct.writeUInt32LE(scanCode, 4)
  keyStruct.writeUInt32LE(flags, 8)
  return keyStruct
}

const START = 50_000
const SHORTEST_STALL_THAT_TIMES_OUT_A_KEY_MS = 300
const STALL_OFFSETS_MS = Array.from({ length: HOOK_REFRESH_TICK_MS / 5 }, (_, i) => i * 5)

function tick(overrides) {
  return { hooked: true, now: START + HOOK_REFRESH_TICK_MS, lastTickAt: START, lastRefreshAt: START, ...overrides }
}

function tickAfterStall(stallMs, stallStartsAfterLastTickMs) {
  const scheduledAt = START + HOOK_REFRESH_TICK_MS
  const stallEndsAt = START + stallStartsAfterLastTickMs + stallMs
  return tick({ now: Math.max(scheduledAt, stallEndsAt) })
}

describe('hookRefreshDue', () => {
  it('leaves a healthy hook alone on an on-time tick', () => {
    expect(hookRefreshDue(tick())).toBe(false)
  })

  it('tolerates ordinary timer jitter', () => {
    expect(hookRefreshDue(tick({ now: START + HOOK_REFRESH_TICK_MS + HOOK_STALL_MS - 1 }))).toBe(false)
  })

  it('never reinstalls a healthy hook just because time has passed', () => {
    const now = START + 10 * 60_000
    expect(hookRefreshDue(tick({ now, lastTickAt: now - HOOK_REFRESH_TICK_MS }))).toBe(false)
  })

  it('refreshes after every stall long enough to time a key out, wherever it starts in the tick', () => {
    for (const stallMs of [SHORTEST_STALL_THAT_TIMES_OUT_A_KEY_MS, 400, 800, 1250, 5000]) {
      for (const offsetMs of STALL_OFFSETS_MS) {
        expect(hookRefreshDue(tickAfterStall(stallMs, offsetMs)), `${stallMs} ms stall starting ${offsetMs} ms after a tick`).toBe(true)
      }
    }
  })

  it('leaves the hook alone after a hitch no longer than the stall threshold', () => {
    for (const stallMs of [50, 150, HOOK_STALL_MS]) {
      for (const offsetMs of STALL_OFFSETS_MS) {
        expect(hookRefreshDue(tickAfterStall(stallMs, offsetMs)), `${stallMs} ms stall starting ${offsetMs} ms after a tick`).toBe(false)
      }
    }
  })

  it('retries a failed install once a second, not on every tick', () => {
    expect(hookRefreshDue(tick({ hooked: false }))).toBe(false)
    expect(hookRefreshDue(tick({ hooked: false, now: START + HOOK_RETRY_MS - 1 }))).toBe(false)
    expect(hookRefreshDue(tick({ hooked: false, now: START + HOOK_RETRY_MS }))).toBe(true)
  })
})

describe('keyEventFromHookStruct', () => {
  it('reads the key, scan code and direction of a key press', () => {
    expect(keyEventFromHookStruct(WM_KEYDOWN, hookStruct())).toEqual({
      vkCode: VK_M,
      scanCode: SCAN_M,
      injected: false,
      isKeyDown: true,
      isKeyUp: false,
    })
  })

  it('treats a release as a key up', () => {
    expect(keyEventFromHookStruct(WM_KEYUP, hookStruct())).toMatchObject({ isKeyDown: false, isKeyUp: true })
  })

  it('treats the system variants sent while Alt is held the same way', () => {
    expect(keyEventFromHookStruct(WM_SYSKEYDOWN, hookStruct())).toMatchObject({ isKeyDown: true, isKeyUp: false })
    expect(keyEventFromHookStruct(WM_SYSKEYUP, hookStruct())).toMatchObject({ isKeyDown: false, isKeyUp: true })
  })

  it('flags keys that software injected, such as the shell releasing Win', () => {
    expect(keyEventFromHookStruct(WM_KEYDOWN, hookStruct({ flags: LLKHF_INJECTED })).injected).toBe(true)
    expect(keyEventFromHookStruct(WM_KEYDOWN, hookStruct({ flags: 0x01 })).injected).toBe(false)
  })
})

describe('routeKeyEvent', () => {
  const keyEvent = { vkCode: VK_M, scanCode: SCAN_M, injected: false, isKeyDown: true, isKeyUp: false }
  const ignoreErrors = () => {}

  it('passes the key on when no handler claims it', () => {
    expect(routeKeyEvent([() => false, () => false], keyEvent, ignoreErrors)).toBe(false)
    expect(routeKeyEvent([], keyEvent, ignoreErrors)).toBe(false)
  })

  it('swallows the key at the first handler that claims it and asks no one after', () => {
    const asked = []
    const handlers = [
      () => { asked.push('first'); return false },
      () => { asked.push('second'); return true },
      () => { asked.push('third'); return true },
    ]
    expect(routeKeyEvent(handlers, keyEvent, ignoreErrors)).toBe(true)
    expect(asked).toEqual(['first', 'second'])
  })

  it('hands every handler the same key event', () => {
    const seen = []
    routeKeyEvent([(event) => { seen.push(event); return false }, (event) => { seen.push(event); return false }], keyEvent, ignoreErrors)
    expect(seen).toEqual([keyEvent, keyEvent])
  })

  it('reports a handler that throws and keeps asking the rest', () => {
    const failure = new Error('boom')
    const broken = () => { throw failure }
    const reported = []
    const swallowed = routeKeyEvent([broken, () => true], keyEvent, (handler, error) => reported.push([handler, error]))
    expect(swallowed).toBe(true)
    expect(reported).toEqual([[broken, failure]])
  })
})
