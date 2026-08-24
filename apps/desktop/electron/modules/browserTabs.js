const { app } = require('electron')
const path = require('path')
const fs = require('fs')
const { createPersistentRunner } = require('../powershell')
const launcherPrefs = require('./launcherPrefs')
const browserTabFavicons = require('./browserTabFavicons')
const sqliteWorker = require('./sqliteWorker')
const { parseTabs } = require('./browserTabsParser')

const COMMAND_TIMEOUT_MS = 30000
const WARM_DELAY_MS = 30000
const CACHE_MAX_AGE_MS = 60000

let broadcastFn = null
let listGeneration = 0
let cachedTabs = []
let cachedAtMs = 0
let refreshing = null

function scriptPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'scripts', 'browserTabs.ps1')
    : path.join(__dirname, '..', 'scripts', 'browserTabs.ps1')
}

let runner = null

function ensureRunner() {
  if (!runner) {
    runner = createPersistentRunner(undefined, COMMAND_TIMEOUT_MS, () => fs.readFileSync(scriptPath(), 'utf8'))
  }
  return runner
}

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
    const tabs = parseTabs(await ensureRunner().run('Get-BrowserTabs'))
    const generation = ++listGeneration
    const { complete } = browserTabFavicons.attachFromCache(tabs)
    if (!complete) scheduleFaviconEnrichment(tabs, generation)
    return tabs
  } catch (e) {
    console.error('[browserTabs] list error:', e?.message ?? e)
    return null
  }
}

function differsFromCache(tabs) {
  if (cachedTabs.length !== tabs.length) return true
  return cachedTabs.some((tab, i) => tab.hwnd !== tabs[i].hwnd || tab.index !== tabs[i].index || tab.title !== tabs[i].title)
}

function refreshTabs() {
  if (!refreshing) {
    refreshing = listTabs()
      .then((tabs) => {
        if (!tabs) return cachedTabs
        const changed = differsFromCache(tabs)
        cachedTabs = tabs
        cachedAtMs = Date.now()
        if (changed && broadcastFn) broadcastFn('browser-tabs/changed', tabs)
        return tabs
      })
      .finally(() => { refreshing = null })
  }
  return refreshing
}

function cachedTabsOrRefresh() {
  if (cachedTabs.length === 0 || Date.now() - cachedAtMs >= CACHE_MAX_AGE_MS) return refreshTabs()
  setImmediate(refreshTabs)
  return cachedTabs
}

async function activateTab(tab) {
  const hwnd = Math.trunc(Number(tab?.hwnd))
  const index = Math.trunc(Number(tab?.index))
  const title = typeof tab?.title === 'string' ? tab.title : ''
  if (!Number.isFinite(hwnd) || !Number.isFinite(index) || !title) return { ok: false }
  const titleBase64 = Buffer.from(title, 'utf8').toString('base64')
  try {
    const result = await ensureRunner().run(`Select-BrowserTab ${hwnd} ${index} '${titleBase64}'`)
    return { ok: result.trim() === 'ok' }
  } catch (e) {
    console.error('[browserTabs] activate error:', e?.message ?? e)
    return { ok: false }
  }
}

module.exports = {
  handlers: {
    'browser-tabs/list': () => {
      if (launcherPrefs.getShowBrowserTabs()) return cachedTabsOrRefresh()
      cachedTabs = []
      return []
    },
    'browser-tabs/activate': (_event, tab) => activateTab(tab),
  },
  start(broadcast) {
    broadcastFn = broadcast
    setTimeout(() => {
      if (!launcherPrefs.getShowBrowserTabs()) return
      ensureRunner().warm()
      sqliteWorker.warm()
    }, WARM_DELAY_MS)
  },
}
