const MAX_DESKTOPS = 9

function initialDesktops() {
  return { stashed: [[]], current: 0 }
}

function desktopsSummary(state) {
  return { count: state.stashed.length, current: state.current }
}

function withoutWindows(windows, handles) {
  return windows.filter((window) => !handles.has(window.hwnd))
}

function forgetVisibleAndClosed(stashed, visibleTopFirst, isAlive) {
  const visible = new Set(visibleTopFirst.map((window) => window.hwnd))
  return stashed.map((windows) => withoutWindows(windows, visible).filter((window) => isAlive(window)))
}

function adjacentDesktop(state, direction) {
  const target = state.current + (direction === 'left' ? -1 : 1)
  return target >= 0 && target < state.stashed.length ? target : null
}

function planSwitch(state, target, visibleTopFirst, isAlive) {
  if (!Number.isInteger(target) || target < 0 || target >= state.stashed.length || target === state.current) return null
  const stashed = forgetVisibleAndClosed(state.stashed, visibleTopFirst, isAlive)
  const reveal = stashed[target]
  stashed[state.current] = visibleTopFirst.slice()
  stashed[target] = []
  return {
    state: { stashed, current: target },
    hide: visibleTopFirst.map((window) => window.hwnd),
    show: reveal.map((window) => window.hwnd).reverse(),
    activate: reveal.length > 0 ? reveal[0].hwnd : null,
  }
}

function planAddDesktop(state) {
  if (state.stashed.length >= MAX_DESKTOPS) return null
  return { stashed: [...state.stashed, []], current: state.current }
}

function neighbourOf(index) {
  return index > 0 ? index - 1 : 1
}

function planCloseCurrentDesktop(state, visibleTopFirst, isAlive) {
  const neighbour = neighbourOf(state.current)
  const stashed = forgetVisibleAndClosed(state.stashed, visibleTopFirst, isAlive)
  const reveal = stashed[neighbour]
  stashed[neighbour] = []
  stashed.splice(state.current, 1)
  return {
    state: { stashed, current: state.current > 0 ? state.current - 1 : 0 },
    hide: [],
    show: reveal.map((window) => window.hwnd).reverse(),
    activate: visibleTopFirst.length > 0 ? visibleTopFirst[0].hwnd : (reveal.length > 0 ? reveal[0].hwnd : null),
  }
}

function planCloseOtherDesktop(state, index, visibleTopFirst, isAlive) {
  const neighbour = neighbourOf(index)
  const stashed = forgetVisibleAndClosed(state.stashed, visibleTopFirst, isAlive)
  const leaving = stashed[index]
  const joinsCurrent = neighbour === state.current
  if (!joinsCurrent) stashed[neighbour] = [...stashed[neighbour], ...leaving]
  stashed.splice(index, 1)
  return {
    state: { stashed, current: state.current > index ? state.current - 1 : state.current },
    hide: [],
    show: joinsCurrent ? leaving.map((window) => window.hwnd).reverse() : [],
    activate: null,
  }
}

function planCloseDesktop(state, index, visibleTopFirst, isAlive) {
  if (state.stashed.length <= 1) return null
  if (!Number.isInteger(index) || index < 0 || index >= state.stashed.length) return null
  if (index === state.current) return planCloseCurrentDesktop(state, visibleTopFirst, isAlive)
  return planCloseOtherDesktop(state, index, visibleTopFirst, isAlive)
}

function planMoveWindow(state, moving, direction, visibleTopFirst, isAlive) {
  const target = adjacentDesktop(state, direction)
  if (target === null || !moving) return null
  const staying = visibleTopFirst.filter((window) => window.hwnd !== moving.hwnd)
  if (staying.length === visibleTopFirst.length) return null
  const switched = planSwitch(state, target, staying, isAlive)
  return {
    ...switched,
    hide: [moving.hwnd, ...switched.hide],
    show: [...switched.show, moving.hwnd],
    activate: moving.hwnd,
  }
}

function allStashedWindows(state) {
  return state.stashed.flat()
}

function isRecoverableWindow(window, probe) {
  return window !== null
    && typeof window === 'object'
    && Number.isInteger(window.hwnd)
    && Number.isInteger(window.processId)
    && probe.exists(window.hwnd)
    && !probe.isVisible(window.hwnd)
    && probe.processId(window.hwnd) === window.processId
}

function windowsToRecover(saved, probe) {
  if (!Array.isArray(saved)) return []
  return saved.filter((window) => isRecoverableWindow(window, probe)).map((window) => window.hwnd)
}

function restoreSwapState(saved, probe) {
  if (!saved || typeof saved !== 'object' || !Array.isArray(saved.stashed) || saved.stashed.length === 0 || saved.stashed.length > MAX_DESKTOPS) {
    return null
  }
  const current = Number.isInteger(saved.current) && saved.current >= 0 && saved.current < saved.stashed.length ? saved.current : 0
  const stashed = saved.stashed.map((desktopWindows, index) => {
    if (index === current || !Array.isArray(desktopWindows)) return []
    return desktopWindows
      .filter((window) => isRecoverableWindow(window, probe))
      .map((window) => ({ hwnd: window.hwnd, processId: window.processId }))
  })
  return { stashed, current }
}

module.exports = {
  MAX_DESKTOPS,
  initialDesktops,
  desktopsSummary,
  adjacentDesktop,
  planSwitch,
  planAddDesktop,
  planCloseDesktop,
  planMoveWindow,
  allStashedWindows,
  windowsToRecover,
  restoreSwapState,
}
