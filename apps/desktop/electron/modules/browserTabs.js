const launcherPrefs = require('./launcherPrefs')
const browserTabFavicons = require('./browserTabFavicons')
const sqliteWorker = require('./sqliteWorker')
const winFocus = require('./winFocus')
const { browserTabsBackend } = require('./browserTabsBackend')
const { activateBrowserTab } = require('./browserTabActivation')

const WARM_DELAY_MS = 30000

let broadcastFn = null
let listGeneration = 0

function scheduleFaviconEnrichment(tabs, generation) {
  if (tabs.length === 0) return
  setImmediate(async () => {
    try {
      const attached = await browserTabFavicons.attachFavicons(tabs)
      if (attached > 0 && generation === listGeneration && broadcastFn) broadcastFn('browser-tabs/changed', tabs)
    } catch (e) {
      console.error('[browserTabs] favicon error:', e?.message ?? e)
    }
  })
}

async function listTabs() {
  try {
    const tabs = await browserTabsBackend().listTabs()
    const generation = ++listGeneration
    const { complete } = browserTabFavicons.attachFromCache(tabs)
    if (!complete) scheduleFaviconEnrichment(tabs, generation)
    return tabs
  } catch (e) {
    console.error('[browserTabs] list error:', e?.message ?? e)
    return []
  }
}

function activateTab(tab) {
  return activateBrowserTab(tab, {
    selectTab: (hwnd, index, title) => browserTabsBackend().activateTab(hwnd, index, title),
    activateWindow: (hwnd) => winFocus.activateWindow(hwnd),
    ensureWindowFocused: (hwnd, token) => winFocus.ensureWindowFocused(hwnd, token),
    onError: (e) => console.error('[browserTabs] activate error:', e?.message ?? e),
  })
}

function warmBackend() {
  Promise.resolve()
    .then(() => browserTabsBackend().warm())
    .catch((e) => console.error('[browserTabs] warm error:', e?.message ?? e))
}

module.exports = {
  handlers: {
    'browser-tabs/list': () => (launcherPrefs.getShowBrowserTabs() ? listTabs() : []),
    'browser-tabs/activate': (_event, tab) => activateTab(tab),
  },
  start(broadcast) {
    broadcastFn = broadcast
    setTimeout(() => {
      if (!launcherPrefs.getShowBrowserTabs()) return
      warmBackend()
      sqliteWorker.warm()
    }, WARM_DELAY_MS)
  },
}
