const fs = require('fs')
const path = require('path')
const koffi = require('koffi')
const winFocus = require('./winFocus')
const windowEnum = require('./windowEnum')
const switcherWindows = require('./switcherWindows')
const {
  initialDesktops,
  desktopsSummary,
  adjacentDesktop,
  planSwitch,
  planAddDesktop,
  planCloseDesktop,
  planMoveWindow,
  allStashedWindows,
  windowsToRecover,
} = require('./virtualDesktopsPolicy')

const user32 = koffi.load('user32.dll')
const IsWindow = user32.func('__stdcall', 'IsWindow', 'int', ['uintptr_t'])
const IsWindowVisible = user32.func('__stdcall', 'IsWindowVisible', 'int', ['uintptr_t'])
const ShowWindowAsync = user32.func('__stdcall', 'ShowWindowAsync', 'int', ['uintptr_t', 'int'])

const SW_HIDE = 0
const SW_SHOWNA = 8
const STASH_FILE = 'virtual-desktops-hidden.json'
const ACTIVATE_AFTER_SHOW_MS = 50

let state = initialDesktops()
let broadcastRef = null
let stashPath = null

function getStashPath() {
  if (!stashPath) {
    const { app } = require('electron')
    stashPath = path.join(app.getPath('userData'), STASH_FILE)
  }
  return stashPath
}

function windowRecord(hwnd) {
  return { hwnd, processId: windowEnum.windowProcessId(hwnd) }
}

function isAlive(window) {
  return IsWindow(window.hwnd) !== 0 && windowEnum.windowProcessId(window.hwnd) === window.processId
}

function visibleWindowsTopFirst() {
  return switcherWindows.listHandles().map(windowRecord)
}

function saveStash() {
  try {
    fs.writeFileSync(getStashPath(), JSON.stringify(allStashedWindows(state)))
  } catch (e) {
    console.error('[virtualDesktops] stash save error:', e.message)
  }
}

function readStash() {
  try {
    return JSON.parse(fs.readFileSync(getStashPath(), 'utf8'))
  } catch {
    return []
  }
}

function announce() {
  saveStash()
  if (broadcastRef) broadcastRef('desktops/changed', desktopsSummary(state))
}

function applyPlan(plan) {
  if (!plan) return desktopsSummary(state)
  state = plan.state
  for (const hwnd of plan.hide) ShowWindowAsync(hwnd, SW_HIDE)
  for (const hwnd of plan.show) ShowWindowAsync(hwnd, SW_SHOWNA)
  if (plan.activate) setTimeout(() => winFocus.activateWindow(plan.activate), ACTIVATE_AFTER_SHOW_MS)
  announce()
  return desktopsSummary(state)
}

function switchTo(index) {
  return applyPlan(planSwitch(state, index, visibleWindowsTopFirst(), isAlive))
}

function switchAdjacent(direction) {
  const target = adjacentDesktop(state, direction)
  return target === null ? desktopsSummary(state) : switchTo(target)
}

function addDesktop() {
  const added = planAddDesktop(state)
  if (!added) return desktopsSummary(state)
  state = added
  return switchTo(state.stashed.length - 1)
}

function closeDesktop() {
  return applyPlan(planCloseDesktop(state, visibleWindowsTopFirst(), isAlive))
}

function moveForegroundWindow(direction) {
  const visible = visibleWindowsTopFirst()
  const foreground = winFocus.getForegroundWindow()
  const moving = visible.find((window) => window.hwnd === foreground) ?? null
  return applyPlan(planMoveWindow(state, moving, direction, visible, isAlive))
}

function revealAll() {
  for (const window of allStashedWindows(state)) {
    if (isAlive(window)) ShowWindowAsync(window.hwnd, SW_SHOWNA)
  }
  state = initialDesktops()
  saveStash()
}

function recoverWindowsLeftHidden() {
  const probe = {
    exists: (hwnd) => IsWindow(hwnd) !== 0,
    isVisible: (hwnd) => IsWindowVisible(hwnd) !== 0,
    processId: (hwnd) => windowEnum.windowProcessId(hwnd),
  }
  for (const hwnd of windowsToRecover(readStash(), probe)) ShowWindowAsync(hwnd, SW_SHOWNA)
  saveStash()
}

function isIndex(value) {
  return Number.isInteger(value)
}

module.exports = {
  handlers: {
    'desktops/state': () => desktopsSummary(state),
    'desktops/switch': (_event, index) => (isIndex(index) ? switchTo(index) : desktopsSummary(state)),
    'desktops/add': () => addDesktop(),
    'desktops/close': () => closeDesktop(),
  },
  switchAdjacent,
  addDesktop,
  closeDesktop,
  moveForegroundWindow,
  revealAll,

  start(broadcast) {
    broadcastRef = broadcast
    recoverWindowsLeftHidden()
  },
}
