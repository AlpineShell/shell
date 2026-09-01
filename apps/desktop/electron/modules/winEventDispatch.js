const EVENT_SYSTEM_FOREGROUND = 0x0003
const EVENT_SYSTEM_MINIMIZEEND = 0x0017
const EVENT_OBJECT_DESTROY = 0x8001
const EVENT_OBJECT_SHOW = 0x8002
const EVENT_OBJECT_HIDE = 0x8003

const OBJECT_WINDOW_EVENTS = Object.freeze([EVENT_OBJECT_DESTROY, EVENT_OBJECT_SHOW, EVENT_OBJECT_HIDE])
const OBJID_WINDOW = 0
const CHILDID_SELF = 0

const SYSTEM_WINDOW_EVENTS = Object.freeze(
  Array.from(
    { length: EVENT_SYSTEM_MINIMIZEEND - EVENT_SYSTEM_FOREGROUND + 1 },
    (_unused, offset) => EVENT_SYSTEM_FOREGROUND + offset
  )
)

const DISPATCH_ORDER = Object.freeze(['perfProbe', 'processGovernor', 'tiling', 'windowCorners', 'minimizeToTopbar'])

function dispatchPriority(name) {
  const index = DISPATCH_ORDER.indexOf(name)
  return index === -1 ? DISPATCH_ORDER.length : index
}

function addSubscriber(subscribers, name, eventIds, listener) {
  const subscriber = { name, events: new Set(eventIds), listener }
  subscribers.push(subscriber)
  subscribers.sort((a, b) => dispatchPriority(a.name) - dispatchPriority(b.name))
  return subscriber
}

function removeSubscriber(subscribers, subscriber) {
  const index = subscribers.indexOf(subscriber)
  if (index === -1) return false
  subscribers.splice(index, 1)
  return true
}

function isWindowItself(idObject, idChild) {
  return idObject === OBJID_WINDOW && idChild === CHILDID_SELF
}

function dispatchWinEvent(subscribers, event, hwnd, idObject, idChild) {
  if (!isWindowItself(idObject, idChild)) return
  if (!hwnd) return
  for (const subscriber of [...subscribers]) {
    if (!subscriber.events.has(event)) continue
    if (!subscribers.includes(subscriber)) continue
    try {
      subscriber.listener(hwnd, event)
    } catch (e) {
      console.error(`[winEvents] ${subscriber.name} listener error:`, e.message)
    }
  }
}

function needsSystemRangeHook(subscribers) {
  return subscribers.some((subscriber) => SYSTEM_WINDOW_EVENTS.some((event) => subscriber.events.has(event)))
}

function needsObjectRangeHook(subscribers) {
  return subscribers.some((subscriber) => OBJECT_WINDOW_EVENTS.some((event) => subscriber.events.has(event)))
}

module.exports = {
  EVENT_SYSTEM_FOREGROUND,
  EVENT_SYSTEM_MINIMIZEEND,
  EVENT_OBJECT_DESTROY,
  EVENT_OBJECT_SHOW,
  EVENT_OBJECT_HIDE,
  OBJECT_WINDOW_EVENTS,
  SYSTEM_WINDOW_EVENTS,
  DISPATCH_ORDER,
  dispatchPriority,
  addSubscriber,
  removeSubscriber,
  dispatchWinEvent,
  needsSystemRangeHook,
  needsObjectRangeHook,
}
