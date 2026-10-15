const fs = require('fs')
const path = require('path')
const koffi = require('koffi')
const windowEnum = require('./windowEnum')
const switcherWindows = require('./switcherWindows')
const { forceForeground, getForegroundWindow } = require('./winFocus')
const {
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
} = require('./virtualDesktopsState')

const user32 = koffi.load('user32.dll')
const ShowWindowAsync = user32.func('__stdcall', 'ShowWindowAsync', 'int', ['uintptr_t', 'int'])
const IsWindow = user32.func('__stdcall', 'IsWindow', 'int', ['uintptr_t'])
const IsWindowVisible = user32.func('__stdcall', 'IsWindowVisible', 'int', ['uintptr_t'])
const IsIconic = user32.func('__stdcall', 'IsIconic', 'int', ['uintptr_t'])

const SW_HIDE = 0
const SW_SHOWNA = 8
const DESKTOPS_FILE = 'desktops.json'
const HIDDEN_WINDOWS_FILE = 'desktops-hidden-windows.json'
const CHANGED_CHANNEL = 'desktops/changed'

let state = createDesktopsState(null)
let broadcast = null

function userDataFile(name) {
  return path.join(require('electron').app.getPath('userData'), name)
}

function readJson(name) {
  try {
    return JSON.parse(fs.readFileSync(userDataFile(name), 'utf8'))
  } catch {
    return null
  }
}

function writeJson(name, data) {
  try {
    fs.writeFileSync(userDataFile(name), JSON.stringify(data))
  } catch (e) {
    console.error(`[virtualDesktops] could not write ${name}:`, e.message)
  }
}

function windowExists(hwnd) {
  return IsWindow(hwnd) !== 0
}

function isOwnWindow(hwnd) {
  return windowEnum.windowProcessId(hwnd) === process.pid
}

function visibleDesktopWindows() {
  return switcherWindows.listHandles().filter((hwnd) => !isOwnWindow(hwnd))
}

function foregroundWindow() {
  try {
    return getForegroundWindow()
  } catch {
    return 0
  }
}

function showWaitingWindows(handles) {
  for (const hwnd of handles) {
    if (windowExists(hwnd) && IsWindowVisible(hwnd) === 0) ShowWindowAsync(hwnd, SW_SHOWNA)
  }
}

function focusWindow(hwnd) {
  if (!hwnd || !windowExists(hwnd) || IsIconic(hwnd) !== 0) return
  try {
    forceForeground(hwnd)
  } catch (e) {
    console.error('[virtualDesktops] focus error:', e.message)
  }
}

function summary() {
  return summarizeDesktops(state, visibleDesktopWindows().length)
}

function publish() {
  writeJson(DESKTOPS_FILE, savedDesktops(state))
  writeJson(HIDDEN_WINDOWS_FILE, hiddenWindows(state))
  const current = summary()
  if (broadcast) broadcast(CHANGED_CHANNEL, current)
  return current
}

function applyPlan(plan) {
  if (!plan) return summary()
  state = plan.state
  for (const hwnd of plan.hide) ShowWindowAsync(hwnd, SW_HIDE)
  for (const hwnd of plan.show) ShowWindowAsync(hwnd, SW_SHOWNA)
  focusWindow(plan.focus)
  return publish()
}

function freshState() {
  state = forgetClosedWindows(state, windowExists)
  return state
}

function switchTo(id) {
  return applyPlan(planSwitch(freshState(), id, visibleDesktopWindows(), foregroundWindow()))
}

function switchAdjacent(direction) {
  const id = adjacentDesktopId(freshState(), direction)
  return id ? switchTo(id) : summary()
}

function create() {
  const created = planCreate(freshState())
  if (!created) return summary()
  state = created.state
  return switchTo(created.id)
}

function remove(id) {
  return applyPlan(planRemove(freshState(), id, visibleDesktopWindows(), foregroundWindow()))
}

function removeCurrent() {
  return remove(state.currentId)
}

function rename(id, name) {
  const renamed = renameDesktop(state, id, name)
  if (!renamed) return summary()
  state = renamed
  return publish()
}

function moveForegroundWindow(direction) {
  const hwnd = foregroundWindow()
  const targetId = adjacentDesktopId(freshState(), direction)
  const visible = visibleDesktopWindows()
  if (!targetId || !visible.includes(hwnd)) return summary()
  const moved = planMoveWindow(state, hwnd, targetId)
  const followed = planSwitch(moved.state, targetId, visible.filter((other) => other !== hwnd), 0)
  return applyPlan({ ...followed, hide: [...moved.hide, ...followed.hide] })
}

function showEveryWindow() {
  showWaitingWindows(hiddenWindows(state))
  writeJson(HIDDEN_WINDOWS_FILE, [])
}

function recoverWindowsHiddenByLastRun() {
  const handles = readJson(HIDDEN_WINDOWS_FILE)
  if (Array.isArray(handles)) showWaitingWindows(handles.filter(Number.isInteger))
  writeJson(HIDDEN_WINDOWS_FILE, [])
}

module.exports = {
  handlers: {
    'desktops/state': () => summary(),
    'desktops/refresh': () => {
      const current = summary()
      if (broadcast) broadcast(CHANGED_CHANNEL, current)
    },
    'desktops/switch': (_event, id) => switchTo(id),
    'desktops/create': () => create(),
    'desktops/remove': (_event, id) => remove(id),
    'desktops/rename': (_event, id, name) => rename(id, name),
  },
  switchAdjacent,
  create,
  removeCurrent,
  moveForegroundWindow,
  showEveryWindow,
  start(broadcastToWindows) {
    broadcast = broadcastToWindows
    recoverWindowsHiddenByLastRun()
    state = createDesktopsState(readJson(DESKTOPS_FILE))
    const { app } = require('electron')
    app.on('will-quit', showEveryWindow)
  },
}
