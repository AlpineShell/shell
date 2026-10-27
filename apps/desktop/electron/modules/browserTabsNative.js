const { NATIVE_ADDON_PATH } = require('../nativeAddonPath')
const { toBrowserTab } = require('./browserTabsParser')

const NATIVE_CALL_DEADLINE_MS = 35000
const BROWSER_TAB_EXPORTS = ['browserTabsList', 'browserTabsActivate', 'browserTabsWarm']

function requireBrowserTabExports(addon) {
  if (BROWSER_TAB_EXPORTS.some((name) => typeof addon[name] !== 'function')) {
    throw new Error('the native add-on has no browser tab exports')
  }
}

function settleWithin(promise, deadlineMs, description) {
  let timer = null
  const expired = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${description} took longer than ${deadlineMs} ms`)), deadlineMs)
  })
  return Promise.race([promise, expired]).finally(() => clearTimeout(timer))
}

function toBrowserTabs(rows) {
  return rows.map(toBrowserTab).filter(Boolean)
}

function bindBrowserTabs(addon, deadlineMs = NATIVE_CALL_DEADLINE_MS) {
  requireBrowserTabExports(addon)
  let listingInFlight = null

  function sharedListing() {
    if (!listingInFlight) {
      listingInFlight = Promise.resolve(addon.browserTabsList()).finally(() => {
        listingInFlight = null
      })
    }
    return listingInFlight
  }

  return {
    kind: 'native',
    warm: () => addon.browserTabsWarm(),
    listTabs: async () => toBrowserTabs(await settleWithin(sharedListing(), deadlineMs, 'listing browser tabs')),
    activateTab: async (hwnd, index, title) => {
      const outcome = await settleWithin(addon.browserTabsActivate(hwnd, index, title), deadlineMs, 'selecting a browser tab')
      return outcome === 'ok'
    },
  }
}

function loadNativeBrowserTabs(requireAddon = require) {
  try {
    return bindBrowserTabs(requireAddon(NATIVE_ADDON_PATH))
  } catch (e) {
    console.error('[browserTabs] native browser tabs unavailable, using PowerShell:', e?.message ?? e)
    return null
  }
}

module.exports = { NATIVE_ADDON_PATH, bindBrowserTabs, loadNativeBrowserTabs }
