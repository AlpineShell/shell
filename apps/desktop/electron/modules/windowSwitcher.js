const keyState = require('./keyState')
const winFocus = require('./winFocus')
const activeDisplay = require('./activeDisplay')
const shellSurfaces = require('./shellSurfaces')
const switcherWindows = require('./switcherWindows')
const windowThumbnails = require('./windowThumbnails')
const { planSwitcherAfterBuild, switcherKeyAction } = require('./windowSwitcherPolicy')

const HIDE_ANIMATION_MS = 300
const ALT_RELEASE_POLL_MS = 100

let altIsDown = false
let active = false
let building = false
let selectedIndex = 0
let windows = []
let generation = 0
let pendingSteps = 0
let activeTopBar = null
let pendingRestore = null
let altReleasePoll = null
let launcherCloser = null

function nextTurn() {
  return new Promise((resolve) => setImmediate(resolve))
}

async function collectWindows() {
  try {
    const described = await switcherWindows.describeAll()
    return described.map((entry) => ({ ...entry, thumbnail: windowThumbnails.cached(entry.hwnd) || '' }))
  } catch (e) {
    console.error('[windowSwitcher] window list error:', e.message)
    return []
  }
}

async function streamFreshThumbnails(showGeneration, shown) {
  try {
    for (const entry of shown) {
      await nextTurn()
      if (showGeneration !== generation) return
      const thumbnail = windowThumbnails.capture(entry.hwnd, { allowScreenCopy: false })
      if (!thumbnail || thumbnail === entry.thumbnail) continue
      if (!activeTopBar || activeTopBar.isDestroyed()) return
      activeTopBar.webContents.send('window-switcher/thumbnail', { hwnd: entry.hwnd, thumbnail })
    }
  } catch (e) {
    console.error('[windowSwitcher] thumbnail refresh error:', e.message)
  }
}

function restorePassiveState(topBar) {
  if (topBar.isDestroyed()) return
  if (typeof topBar.restorePassiveTopBar === 'function') {
    topBar.restorePassiveTopBar()
  } else {
    topBar.setAlwaysOnTop(false)
  }
}

function flushPendingRestore(keepTopBar) {
  if (!pendingRestore) return
  const { topBar, timer } = pendingRestore
  clearTimeout(timer)
  pendingRestore = null
  if (topBar !== keepTopBar) restorePassiveState(topBar)
}

function startAltReleasePoll() {
  if (altReleasePoll) return
  altReleasePoll = setInterval(commitIfAltReleased, ALT_RELEASE_POLL_MS)
}

function stopAltReleasePoll() {
  if (altReleasePoll) clearInterval(altReleasePoll)
  altReleasePoll = null
}

function closeLauncher() {
  if (!launcherCloser) return
  try { launcherCloser() } catch (e) { console.error('[windowSwitcher] launcher close error:', e.message) }
}

function presentOnTopBar(topBar) {
  activeTopBar = topBar
  flushPendingRestore(topBar)
  closeLauncher()
  topBar.webContents.send('topbar/close-menus')
  topBar.setAlwaysOnTop(true, 'screen-saver')
  topBar.setIgnoreMouseEvents(false)
  topBar.webContents.send('window-switcher/show', { windows, selectedIndex })
}

async function open() {
  windowThumbnails.arm()
  const showGeneration = ++generation
  building = true
  pendingSteps = 0
  const collected = await collectWindows()
  const isLatestBuild = showGeneration === generation
  if (isLatestBuild) building = false

  const plan = planSwitcherAfterBuild({
    isLatestBuild,
    windowCount: collected.length,
    altHeld: altIsDown && keyState.isAltHeld(),
    pendingSteps,
  })
  if (plan.action === 'drop') return
  if (plan.action === 'switch') {
    winFocus.activateWindow(collected[plan.index].hwnd)
    return
  }

  windows = collected
  selectedIndex = plan.index
  active = true
  startAltReleasePoll()

  const topBar = shellSurfaces.topBarForDisplay(activeDisplay.currentDisplay().id)
  if (!topBar) return
  presentOnTopBar(topBar)
  streamFreshThumbnails(showGeneration, collected)
}

function hide() {
  generation++
  building = false
  active = false
  windows = []
  stopAltReleasePoll()
  const topBar = activeTopBar
  activeTopBar = null
  if (!topBar || topBar.isDestroyed()) return
  topBar.webContents.send('window-switcher/hide')
  topBar.setIgnoreMouseEvents(true)
  flushPendingRestore(topBar)
  const timer = setTimeout(() => {
    pendingRestore = null
    restorePassiveState(topBar)
  }, HIDE_ANIMATION_MS)
  pendingRestore = { topBar, timer }
}

function commitSelection() {
  const selected = windows[selectedIndex]
  hide()
  if (selected) winFocus.activateWindow(selected.hwnd)
}

function commitIfAltReleased() {
  try {
    if (!active || keyState.isAltHeld()) return
    altIsDown = false
    commitSelection()
  } catch (e) {
    console.error('[windowSwitcher] alt release poll error:', e.message)
  }
}

function moveSelection(step) {
  if (windows.length === 0) return
  selectedIndex = (selectedIndex + step + windows.length) % windows.length
  if (activeTopBar && !activeTopBar.isDestroyed()) {
    activeTopBar.webContents.send('window-switcher/selection-changed', selectedIndex)
  }
}

function openInBackground() {
  open().catch((e) => console.error('[windowSwitcher] open error:', e.message))
}

const SWITCHER_ACTIONS = {
  open: openInBackground,
  hide,
  commit: commitSelection,
  cycleForward: () => moveSelection(1),
  cycleBackward: () => moveSelection(-1),
  queueForward: () => { pendingSteps += 1 },
  queueBackward: () => { pendingSteps -= 1 },
}

function handleSwitcherKey(keyEvent) {
  const decision = switcherKeyAction(keyEvent, {
    altIsDown,
    active,
    building,
    isAltHeld: keyState.isAltHeld,
    isShiftHeld: keyState.isShiftHeld,
  })
  altIsDown = decision.altIsDown
  if (decision.action) SWITCHER_ACTIONS[decision.action]()
  return decision.swallow
}

function hideForLauncher() {
  if (!active && !building && !activeTopBar) return
  hide()
}

module.exports = {
  handleKey: handleSwitcherKey,
  hideForLauncher,

  isActive() {
    return active
  },

  ownsTopBar(win) {
    return activeTopBar === win
  },

  setLauncherCloser(fn) {
    launcherCloser = typeof fn === 'function' ? fn : null
  },

  start() {
    windowThumbnails.startWarming({ isPaused: () => active })
  },
}
