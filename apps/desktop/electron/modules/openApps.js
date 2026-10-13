const { app } = require('electron')
const koffi = require('koffi')
const appIcons = require('./appIcons')
const windowEnum = require('./windowEnum')
const windowRules = require('./windowRules')
const winFocus = require('./winFocus')
const { friendlyAppName } = require('../appNames')

let lastSnapshot = null
let lastApps = null
let shellAppsProvider = null
let broadcastFn = null

const user32 = koffi.load('user32.dll')
const OPEN_APPS_WIN_EVENT_PROC = koffi.proto('__stdcall', 'OpenAppsWinEventProc', 'void', ['uintptr_t', 'uint32', 'uintptr_t', 'int32', 'int32', 'uint32', 'uint32'])
const SetWinEventHook = user32.func('__stdcall', 'SetWinEventHook', 'uintptr_t', ['uint32', 'uint32', 'uintptr_t', 'OpenAppsWinEventProc *', 'uint32', 'uint32', 'uint32'])
const UnhookWinEvent = user32.func('__stdcall', 'UnhookWinEvent', 'int', ['uintptr_t'])

const EVENT_OBJECT_CREATE = 0x8000
const EVENT_OBJECT_HIDE = 0x8003
const EVENT_OBJECT_NAMECHANGE = 0x800c
const EVENT_OBJECT_CLOAKED = 0x8017
const EVENT_OBJECT_UNCLOAKED = 0x8018
const WINEVENT_OUTOFCONTEXT = 0x0000
const WINEVENT_SKIPOWNPROCESS = 0x0002
const OBJID_WINDOW = 0
const CHILDID_SELF = 0

const WIN_EVENT_RANGES = [
  [EVENT_OBJECT_CREATE, EVENT_OBJECT_HIDE],
  [EVENT_OBJECT_NAMECHANGE, EVENT_OBJECT_NAMECHANGE],
  [EVENT_OBJECT_CLOAKED, EVENT_OBJECT_UNCLOAKED],
]

const REFRESH_THROTTLE_MS = 100
const SWEEP_INTERVAL_MS = 1000

const HIDDEN_PROCESS_NAMES = new Set(['powershell', 'conhost', 'cmd'])
const SHELL_PROCESS_NAMES = new Set(['electron', 'alpine-shell', 'alpine shell'])
const SHELL_DEFAULT_TITLE = 'alpine-shell'

let winEventProcPointer = null
let winEventHookHandles = []
let refreshTimer = null
let sweepInterval = null
let refreshing = false
let refreshQueued = false
let lastRefreshAt = 0
const trackedWindowHandles = new Set()

function toNum(v) {
  return typeof v === 'bigint' ? Number(v) : v
}

function withShellApps(apps) {
  const extras = shellAppsProvider ? shellAppsProvider() : []
  if (extras.length === 0) return apps
  const extraHwnds = new Set(extras.map((e) => e.hwnd))
  return [...extras, ...apps.filter((a) => !extraHwnds.has(a.hwnd))]
}

function isListedWindow(taskbarWindow) {
  if (!taskbarWindow.path || taskbarWindow.id === process.pid) return false
  const nameLower = taskbarWindow.name.toLowerCase()
  if (HIDDEN_PROCESS_NAMES.has(nameLower)) return false
  if (SHELL_PROCESS_NAMES.has(nameLower)) return Boolean(taskbarWindow.title) && taskbarWindow.title !== SHELL_DEFAULT_TITLE
  return true
}

function describeWindow(hwnd) {
  const title = windowEnum.windowTitle(hwnd)
  if (!title) return null
  const id = windowEnum.windowProcessId(hwnd)
  if (!id) return null
  const exePath = windowEnum.processImagePath(id)
  if (!exePath) return null
  return { id, hwnd, name: windowEnum.processNameFromPath(exePath), title, path: exePath }
}

function listTaskbarWindows() {
  const listed = []
  let handles = []
  try {
    handles = windowEnum.enumerateWindows(windowEnum.taskbarWindowPredicate)
  } catch (e) {
    console.error('[openApps] window enumeration failed:', e?.message ?? e)
    return listed
  }
  for (const hwnd of handles) {
    const taskbarWindow = describeWindow(hwnd)
    if (taskbarWindow && isListedWindow(taskbarWindow)) listed.push(taskbarWindow)
  }
  return listed
}

function trackWindows(apps) {
  trackedWindowHandles.clear()
  for (const openApp of apps) trackedWindowHandles.add(openApp.hwnd)
}

async function describeRuledWindow(taskbarWindow) {
  const identity = windowRules.identifyWindow(taskbarWindow.hwnd, taskbarWindow.title)
  if (!identity) return null
  const icon = await windowRules.iconForIdentity(taskbarWindow.hwnd, identity)
  return {
    id: taskbarWindow.id,
    hwnd: taskbarWindow.hwnd,
    name: identity.name,
    title: identity.title,
    path: identity.shortcutPath || taskbarWindow.path,
    icon,
  }
}

async function listOpenApps() {
  const taskbarWindows = listTaskbarWindows()
  const generic = await appIcons.ensureGenericIcon()
  return Promise.all(
    taskbarWindows.map(async (taskbarWindow) => {
      const ruled = await describeRuledWindow(taskbarWindow)
      if (ruled) return { ...ruled, icon: ruled.icon || generic }
      const [icon, description] = await Promise.all([
        appIcons.iconForFile(taskbarWindow.path),
        windowEnum.resolveFileDescription(taskbarWindow.path),
      ])
      const name = SHELL_PROCESS_NAMES.has(taskbarWindow.name.toLowerCase())
        ? taskbarWindow.title
        : friendlyAppName({ path: taskbarWindow.path, description, processName: taskbarWindow.name })
      return { id: taskbarWindow.id, hwnd: taskbarWindow.hwnd, name, title: taskbarWindow.title, path: taskbarWindow.path, icon: icon || generic }
    })
  )
}

function snapshot(apps) {
  return JSON.stringify(apps.map((a) => ({ hwnd: a.hwnd, title: a.title })).sort((a, b) => a.hwnd - b.hwnd))
}

async function refreshOpenApps() {
  if (!broadcastFn) return
  if (refreshing) { refreshQueued = true; return }
  refreshing = true
  try {
    lastApps = await listOpenApps()
    trackWindows(lastApps)
    const merged = withShellApps(lastApps)
    const current = snapshot(merged)
    if (current !== lastSnapshot) {
      lastSnapshot = current
      broadcastFn('windows/open-apps-changed', merged)
    }
  } catch (e) {
    console.error('[openApps] refresh failed:', e?.message ?? e)
  } finally {
    refreshing = false
    lastRefreshAt = Date.now()
    if (refreshQueued) {
      refreshQueued = false
      scheduleRefresh()
    }
  }
}

function refreshAlreadyScheduled() {
  return Boolean(refreshTimer) || refreshQueued
}

function scheduleRefresh() {
  if (refreshTimer) return
  if (refreshing) { refreshQueued = true; return }
  const elapsed = Date.now() - lastRefreshAt
  if (elapsed >= REFRESH_THROTTLE_MS) {
    refreshOpenApps()
    return
  }
  refreshTimer = setTimeout(() => {
    refreshTimer = null
    refreshOpenApps()
  }, REFRESH_THROTTLE_MS - elapsed)
}

function affectsOpenApps(hwnd) {
  if (trackedWindowHandles.has(hwnd)) return true
  if (!windowEnum.taskbarWindowPredicate(hwnd, windowEnum.windowProbe)) return false
  const taskbarWindow = describeWindow(hwnd)
  return Boolean(taskbarWindow) && isListedWindow(taskbarWindow)
}

function onWindowEvent(_hook, _event, hwnd, idObject, idChild) {
  try {
    if (idObject !== OBJID_WINDOW || idChild !== CHILDID_SELF) return
    if (refreshAlreadyScheduled()) return
    if (!affectsOpenApps(toNum(hwnd))) return
    scheduleRefresh()
  } catch (e) {
    console.error('[openApps] win event error:', e?.message ?? e)
  }
}

function installWindowEventHooks() {
  try {
    winEventProcPointer = koffi.register(onWindowEvent, koffi.pointer(OPEN_APPS_WIN_EVENT_PROC))
    for (const [firstEvent, lastEvent] of WIN_EVENT_RANGES) {
      const handle = SetWinEventHook(firstEvent, lastEvent, 0, winEventProcPointer, 0, 0, WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS)
      if (toNum(handle)) winEventHookHandles.push(handle)
    }
    if (winEventHookHandles.length === 0) {
      uninstallWindowEventHooks()
      return false
    }
    return true
  } catch (e) {
    console.error('[openApps] win event hook install error:', e?.message ?? e)
    uninstallWindowEventHooks()
    return false
  }
}

function uninstallWindowEventHooks() {
  for (const handle of winEventHookHandles) {
    try { UnhookWinEvent(handle) } catch {}
  }
  winEventHookHandles = []
  if (winEventProcPointer) {
    try { koffi.unregister(winEventProcPointer) } catch {}
    winEventProcPointer = null
  }
}

module.exports = {
  setShellAppsProvider(provider) {
    shellAppsProvider = provider
  },
  refresh() {
    if (!broadcastFn) return
    const merged = withShellApps(lastApps || [])
    lastSnapshot = snapshot(merged)
    broadcastFn('windows/open-apps-changed', merged)
  },
  handlers: {
    'windows/open-apps': async () => {
      if (lastApps === null) {
        lastApps = await listOpenApps()
        trackWindows(lastApps)
      }
      const merged = withShellApps(lastApps)
      lastSnapshot = snapshot(merged)
      return merged
    },
    'windows/activate': (_event, hwnd) => {
      winFocus.activateWindow(hwnd)
    },
  },
  start(broadcast) {
    broadcastFn = broadcast
    refreshOpenApps()

    if (!installWindowEventHooks()) console.error('[openApps] window event hooks unavailable; relying on the periodic sweep')
    sweepInterval = setInterval(refreshOpenApps, SWEEP_INTERVAL_MS)

    app.on('will-quit', () => {
      uninstallWindowEventHooks()
      if (refreshTimer) clearTimeout(refreshTimer)
      if (sweepInterval) clearInterval(sweepInterval)
      windowEnum.releaseBindings()
    })
  },
}
