import { describe, it, expect, vi } from 'vitest'
import winEventDispatch from './winEventDispatch.js'

const {
  EVENT_SYSTEM_FOREGROUND,
  EVENT_SYSTEM_MINIMIZEEND,
  EVENT_OBJECT_SHOW,
  SYSTEM_WINDOW_EVENTS,
  DISPATCH_ORDER,
  dispatchPriority,
  addSubscriber,
  removeSubscriber,
  dispatchWinEvent,
  needsSystemRangeHook,
  needsObjectShowHook,
} = winEventDispatch

const OBJID_WINDOW = 0
const CHILDID_SELF = 0
const OBJID_CURSOR = -9
const EVENT_SYSTEM_MOVESIZEEND = 0x000b
const EVENT_SYSTEM_MENUPOPUPSTART = 0x0006
const HWND = 0x000a1234

describe('SYSTEM_WINDOW_EVENTS', () => {
  it('covers every id from foreground to minimize end', () => {
    expect(SYSTEM_WINDOW_EVENTS[0]).toBe(EVENT_SYSTEM_FOREGROUND)
    expect(SYSTEM_WINDOW_EVENTS[SYSTEM_WINDOW_EVENTS.length - 1]).toBe(EVENT_SYSTEM_MINIMIZEEND)
    expect(SYSTEM_WINDOW_EVENTS).toHaveLength(21)
    expect(SYSTEM_WINDOW_EVENTS).toContain(EVENT_SYSTEM_MENUPOPUPSTART)
  })

  it('excludes object events', () => {
    expect(SYSTEM_WINDOW_EVENTS).not.toContain(EVENT_OBJECT_SHOW)
  })
})

describe('dispatchPriority', () => {
  it('ranks tiling ahead of windowCorners so corners read repositioned bounds', () => {
    expect(dispatchPriority('tiling')).toBeLessThan(dispatchPriority('windowCorners'))
  })

  it('sends unknown subscribers last', () => {
    expect(dispatchPriority('somethingElse')).toBe(DISPATCH_ORDER.length)
  })

  it('ranks perfProbe first so it stamps the event before other subscribers do native work', () => {
    expect(dispatchPriority('perfProbe')).toBeLessThan(dispatchPriority('tiling'))
  })
})

describe('addSubscriber', () => {
  it('keeps subscribers in the pinned dispatch order regardless of registration order', () => {
    const subscribers = []
    addSubscriber(subscribers, 'minimizeToTopbar', [EVENT_SYSTEM_FOREGROUND], () => {})
    addSubscriber(subscribers, 'windowCorners', SYSTEM_WINDOW_EVENTS, () => {})
    addSubscriber(subscribers, 'tiling', [EVENT_SYSTEM_FOREGROUND], () => {})
    expect(subscribers.map((s) => s.name)).toEqual(['tiling', 'windowCorners', 'minimizeToTopbar'])
  })
})

describe('removeSubscriber', () => {
  it('drops a subscriber once and reports whether it was present', () => {
    const subscribers = []
    const subscriber = addSubscriber(subscribers, 'tiling', [EVENT_SYSTEM_FOREGROUND], () => {})
    expect(removeSubscriber(subscribers, subscriber)).toBe(true)
    expect(removeSubscriber(subscribers, subscriber)).toBe(false)
    expect(subscribers).toHaveLength(0)
  })
})

describe('dispatchWinEvent', () => {
  it('delivers one system event to every subscriber that asked for it, in dispatch order', () => {
    const calls = []
    const subscribers = []
    addSubscriber(subscribers, 'minimizeToTopbar', [EVENT_SYSTEM_FOREGROUND], (hwnd, event) => calls.push(['minimizeToTopbar', hwnd, event]))
    addSubscriber(subscribers, 'tiling', [EVENT_SYSTEM_FOREGROUND], (hwnd, event) => calls.push(['tiling', hwnd, event]))
    dispatchWinEvent(subscribers, EVENT_SYSTEM_FOREGROUND, HWND, OBJID_WINDOW, CHILDID_SELF)
    expect(calls).toEqual([
      ['tiling', HWND, EVENT_SYSTEM_FOREGROUND],
      ['minimizeToTopbar', HWND, EVENT_SYSTEM_FOREGROUND],
    ])
  })

  it('skips subscribers that did not ask for the event id', () => {
    const listener = vi.fn()
    const subscribers = []
    addSubscriber(subscribers, 'minimizeToTopbar', [EVENT_SYSTEM_FOREGROUND, EVENT_SYSTEM_MOVESIZEEND], listener)
    dispatchWinEvent(subscribers, EVENT_SYSTEM_MENUPOPUPSTART, HWND, OBJID_WINDOW, CHILDID_SELF)
    expect(listener).not.toHaveBeenCalled()
    dispatchWinEvent(subscribers, EVENT_SYSTEM_MOVESIZEEND, HWND, OBJID_WINDOW, CHILDID_SELF)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('rejects events that are not about the window itself', () => {
    const listener = vi.fn()
    const subscribers = []
    addSubscriber(subscribers, 'windowCorners', SYSTEM_WINDOW_EVENTS, listener)
    dispatchWinEvent(subscribers, EVENT_SYSTEM_FOREGROUND, HWND, OBJID_CURSOR, CHILDID_SELF)
    dispatchWinEvent(subscribers, EVENT_SYSTEM_FOREGROUND, HWND, OBJID_WINDOW, 3)
    dispatchWinEvent(subscribers, EVENT_SYSTEM_FOREGROUND, 0, OBJID_WINDOW, CHILDID_SELF)
    expect(listener).not.toHaveBeenCalled()
  })

  it('keeps delivering after a listener throws', () => {
    const survivor = vi.fn()
    const subscribers = []
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    addSubscriber(subscribers, 'tiling', [EVENT_SYSTEM_FOREGROUND], () => { throw new Error('boom') })
    addSubscriber(subscribers, 'windowCorners', [EVENT_SYSTEM_FOREGROUND], survivor)
    dispatchWinEvent(subscribers, EVENT_SYSTEM_FOREGROUND, HWND, OBJID_WINDOW, CHILDID_SELF)
    expect(survivor).toHaveBeenCalledTimes(1)
    consoleError.mockRestore()
  })

  it('tolerates a listener unsubscribing during dispatch', () => {
    const subscribers = []
    const later = vi.fn()
    const first = addSubscriber(subscribers, 'tiling', [EVENT_SYSTEM_FOREGROUND], () => removeSubscriber(subscribers, first))
    addSubscriber(subscribers, 'windowCorners', [EVENT_SYSTEM_FOREGROUND], later)
    dispatchWinEvent(subscribers, EVENT_SYSTEM_FOREGROUND, HWND, OBJID_WINDOW, CHILDID_SELF)
    expect(later).toHaveBeenCalledTimes(1)
    expect(subscribers).toHaveLength(1)
  })

  it('still reaches the remaining subscribers when a listener removes an earlier one', () => {
    const subscribers = []
    const last = vi.fn()
    const first = addSubscriber(subscribers, 'tiling', [EVENT_SYSTEM_FOREGROUND], vi.fn())
    addSubscriber(subscribers, 'windowCorners', [EVENT_SYSTEM_FOREGROUND], () => removeSubscriber(subscribers, first))
    addSubscriber(subscribers, 'minimizeToTopbar', [EVENT_SYSTEM_FOREGROUND], last)
    dispatchWinEvent(subscribers, EVENT_SYSTEM_FOREGROUND, HWND, OBJID_WINDOW, CHILDID_SELF)
    expect(last).toHaveBeenCalledTimes(1)
    expect(subscribers.map((s) => s.name)).toEqual(['windowCorners', 'minimizeToTopbar'])
  })

  it('still reaches the last subscriber when a listener removes two earlier ones', () => {
    const subscribers = []
    const last = vi.fn()
    const first = addSubscriber(subscribers, 'tiling', [EVENT_SYSTEM_FOREGROUND], vi.fn())
    const second = addSubscriber(subscribers, 'windowCorners', [EVENT_SYSTEM_FOREGROUND], () => {
      removeSubscriber(subscribers, first)
      removeSubscriber(subscribers, second)
    })
    addSubscriber(subscribers, 'minimizeToTopbar', [EVENT_SYSTEM_FOREGROUND], last)
    dispatchWinEvent(subscribers, EVENT_SYSTEM_FOREGROUND, HWND, OBJID_WINDOW, CHILDID_SELF)
    expect(last).toHaveBeenCalledTimes(1)
    expect(subscribers.map((s) => s.name)).toEqual(['minimizeToTopbar'])
  })

  it('does not call a subscriber a listener removed before it ran', () => {
    const subscribers = []
    const removed = vi.fn()
    const later = addSubscriber(subscribers, 'minimizeToTopbar', [EVENT_SYSTEM_FOREGROUND], removed)
    addSubscriber(subscribers, 'tiling', [EVENT_SYSTEM_FOREGROUND], () => removeSubscriber(subscribers, later))
    dispatchWinEvent(subscribers, EVENT_SYSTEM_FOREGROUND, HWND, OBJID_WINDOW, CHILDID_SELF)
    expect(removed).not.toHaveBeenCalled()
  })
})

describe('hook requirements', () => {
  it('asks for the system range only while a subscriber wants one of its ids', () => {
    const subscribers = []
    expect(needsSystemRangeHook(subscribers)).toBe(false)
    const subscriber = addSubscriber(subscribers, 'tiling', [EVENT_SYSTEM_MINIMIZEEND], () => {})
    expect(needsSystemRangeHook(subscribers)).toBe(true)
    removeSubscriber(subscribers, subscriber)
    expect(needsSystemRangeHook(subscribers)).toBe(false)
  })

  it('asks for the object-show hook only when that id is subscribed', () => {
    const subscribers = []
    addSubscriber(subscribers, 'windowCorners', SYSTEM_WINDOW_EVENTS, () => {})
    expect(needsObjectShowHook(subscribers)).toBe(false)
    addSubscriber(subscribers, 'tiling', [EVENT_OBJECT_SHOW], () => {})
    expect(needsObjectShowHook(subscribers)).toBe(true)
  })
})
