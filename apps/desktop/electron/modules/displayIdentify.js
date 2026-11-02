const displayConfig = require('./displayConfig')
const { planIdentifyBadges, IDENTIFY_DURATION_MS } = require('./displayIdentifyPolicy')

let badgeWindowFactory = null
let badgeWindows = []
let hideTimer = null

function physicalToDipRect(rect) {
  try {
    return require('electron').screen.screenToDipRect(null, rect)
  } catch (e) {
    console.error('[displayIdentify] could not convert display bounds:', e.message)
    return null
  }
}

function closeBadges() {
  if (hideTimer) {
    clearTimeout(hideTimer)
    hideTimer = null
  }
  for (const win of badgeWindows) {
    if (!win.isDestroyed()) win.destroy()
  }
  badgeWindows = []
}

function readDisplays() {
  try {
    return displayConfig.enumerateDisplays()
  } catch (e) {
    console.error('[displayIdentify] could not list the displays:', e.message)
    return []
  }
}

function openBadge(badge) {
  try {
    return badgeWindowFactory(badge)
  } catch (e) {
    console.error(`[displayIdentify] could not open the badge for ${badge.displayId}:`, e.message)
    return null
  }
}

function identify() {
  closeBadges()
  if (!badgeWindowFactory) return { ok: false }
  const badges = planIdentifyBadges(readDisplays(), physicalToDipRect)
  badgeWindows = badges.map(openBadge).filter(Boolean)
  hideTimer = setTimeout(closeBadges, IDENTIFY_DURATION_MS)
  return { ok: badgeWindows.length > 0 }
}

module.exports = {
  handlers: {
    'system/displays-identify': () => identify(),
  },
  identify,
  closeBadges,
  setBadgeWindowFactory(factory) {
    badgeWindowFactory = typeof factory === 'function' ? factory : null
  },
  start() {
    require('electron').app.on('will-quit', closeBadges)
  },
}
