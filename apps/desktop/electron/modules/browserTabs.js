const { app } = require('electron')
const path = require('path')
const fs = require('fs')
const { createPersistentRunner } = require('../powershell')
const launcherPrefs = require('./launcherPrefs')
const browserTabFavicons = require('./browserTabFavicons')
const { parseTabs } = require('./browserTabsParser')

const COMMAND_TIMEOUT_MS = 30000
const WARM_DELAY_MS = 30000

let broadcastFn = null
let listGeneration = 0

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
    return []
  }
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
    'browser-tabs/list': () => (launcherPrefs.getShowBrowserTabs() ? listTabs() : []),
    'browser-tabs/activate': (_event, tab) => activateTab(tab),
  },
  start(broadcast) {
    broadcastFn = broadcast
    setTimeout(() => {
      if (launcherPrefs.getShowBrowserTabs()) ensureRunner().warm()
    }, WARM_DELAY_MS)
  },
}
