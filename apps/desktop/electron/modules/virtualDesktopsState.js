const MAX_DESKTOPS = 9
const MAX_NAME_LENGTH = 32
const DEFAULT_NAME_PREFIX = 'Desktop'

const NO_CHANGE = null

function defaultName(number) {
  return `${DEFAULT_NAME_PREFIX} ${number}`
}

function createDesktopsState(saved) {
  const savedDesktops = Array.isArray(saved?.desktops) ? saved.desktops.filter(isSavedDesktop).slice(0, MAX_DESKTOPS) : []
  const desktops = savedDesktops.length > 0 ? savedDesktops.map(({ id, name }) => ({ id, name })) : [{ id: 'desktop-1', name: defaultName(1) }]
  const highestNumber = Math.max(0, ...desktops.map((desktop) => desktopNumber(desktop.id)))
  return {
    desktops,
    currentId: desktops[0].id,
    nextNumber: Math.max(highestNumber + 1, Number.isInteger(saved?.nextNumber) ? saved.nextNumber : 0),
    assignments: {},
    lastFocus: {},
  }
}

function isSavedDesktop(value) {
  return value !== null && typeof value === 'object' && typeof value.id === 'string' && value.id.length > 0 && typeof value.name === 'string'
}

function desktopNumber(id) {
  const match = /^desktop-(\d+)$/.exec(id)
  return match ? Number(match[1]) : 0
}

function savedDesktops(state) {
  return { desktops: state.desktops, nextNumber: state.nextNumber }
}

function hasDesktop(state, id) {
  return state.desktops.some((desktop) => desktop.id === id)
}

function indexOfDesktop(state, id) {
  return state.desktops.findIndex((desktop) => desktop.id === id)
}

function adjacentDesktopId(state, direction) {
  const index = indexOfDesktop(state, state.currentId) + (direction === 'next' ? 1 : -1)
  return state.desktops[index]?.id ?? null
}

function windowsOn(assignments, desktopId) {
  return Object.keys(assignments)
    .filter((hwnd) => assignments[hwnd] === desktopId)
    .map(Number)
}

function hiddenWindows(state) {
  return Object.keys(state.assignments)
    .filter((hwnd) => state.assignments[hwnd] !== state.currentId)
    .map(Number)
}

function focusTarget(lastFocus, desktopId, shown) {
  const remembered = lastFocus[desktopId]
  return shown.includes(remembered) ? remembered : (shown[0] ?? null)
}

function withoutWindowsTheirAppHid(state, visibleWindows) {
  const assignments = {}
  for (const [hwnd, desktopId] of Object.entries(state.assignments)) {
    if (desktopId !== state.currentId || visibleWindows.includes(Number(hwnd))) assignments[hwnd] = desktopId
  }
  return assignments
}

function planSwitch(state, targetId, visibleWindows, foregroundWindow) {
  if (targetId === state.currentId || !hasDesktop(state, targetId)) return NO_CHANGE
  const assignments = withoutWindowsTheirAppHid(state, visibleWindows)
  for (const hwnd of visibleWindows) assignments[hwnd] = state.currentId
  const lastFocus = { ...state.lastFocus }
  if (visibleWindows.includes(foregroundWindow)) lastFocus[state.currentId] = foregroundWindow
  const show = windowsOn(assignments, targetId)
  return {
    state: { ...state, assignments, lastFocus, currentId: targetId },
    hide: [...visibleWindows],
    show,
    focus: focusTarget(lastFocus, targetId, show),
  }
}

function planCreate(state) {
  if (state.desktops.length >= MAX_DESKTOPS) return NO_CHANGE
  const id = `desktop-${state.nextNumber}`
  const name = defaultName(state.desktops.length + 1)
  return { state: { ...state, desktops: [...state.desktops, { id, name }], nextNumber: state.nextNumber + 1 }, id }
}

function planRemove(state, id, visibleWindows, foregroundWindow) {
  const index = indexOfDesktop(state, id)
  if (index < 0 || state.desktops.length <= 1) return NO_CHANGE
  const neighbourId = (state.desktops[index - 1] ?? state.desktops[index + 1]).id
  const switched = id === state.currentId
    ? planSwitch(state, neighbourId, visibleWindows, foregroundWindow)
    : { state, hide: [], show: [], focus: null }
  const assignments = { ...switched.state.assignments }
  const moved = windowsOn(assignments, id)
  for (const hwnd of moved) assignments[hwnd] = neighbourId
  const lastFocus = { ...switched.state.lastFocus }
  delete lastFocus[id]
  const showsMoved = neighbourId === switched.state.currentId
  return {
    state: { ...switched.state, assignments, lastFocus, desktops: state.desktops.filter((desktop) => desktop.id !== id) },
    hide: switched.hide,
    show: showsMoved ? [...switched.show, ...moved] : switched.show,
    focus: switched.focus,
  }
}

function planMoveWindow(state, hwnd, targetId) {
  if (!hwnd || targetId === state.currentId || !hasDesktop(state, targetId)) return NO_CHANGE
  return {
    state: { ...state, assignments: { ...state.assignments, [hwnd]: targetId }, lastFocus: { ...state.lastFocus, [targetId]: hwnd } },
    hide: [hwnd],
    show: [],
    focus: null,
  }
}

function renameDesktop(state, id, name) {
  if (!hasDesktop(state, id) || typeof name !== 'string') return NO_CHANGE
  const trimmed = name.trim().slice(0, MAX_NAME_LENGTH)
  const fallback = defaultName(indexOfDesktop(state, id) + 1)
  return { ...state, desktops: state.desktops.map((desktop) => (desktop.id === id ? { ...desktop, name: trimmed || fallback } : desktop)) }
}

function forgetClosedWindows(state, isWindow) {
  const assignments = {}
  for (const [hwnd, desktopId] of Object.entries(state.assignments)) {
    if (isWindow(Number(hwnd)) && hasDesktop(state, desktopId)) assignments[hwnd] = desktopId
  }
  return { ...state, assignments }
}

function summarizeDesktops(state, visibleWindowCount) {
  return {
    currentId: state.currentId,
    canCreate: state.desktops.length < MAX_DESKTOPS,
    desktops: state.desktops.map((desktop) => ({
      id: desktop.id,
      name: desktop.name,
      windowCount: desktop.id === state.currentId ? visibleWindowCount : windowsOn(state.assignments, desktop.id).length,
    })),
  }
}

module.exports = {
  MAX_DESKTOPS,
  MAX_NAME_LENGTH,
  createDesktopsState,
  savedDesktops,
  adjacentDesktopId,
  hiddenWindows,
  planSwitch,
  planCreate,
  planRemove,
  planMoveWindow,
  renameDesktop,
  forgetClosedWindows,
  summarizeDesktops,
}
