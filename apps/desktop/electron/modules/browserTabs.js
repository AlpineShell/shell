const { app } = require('electron')
const path = require('path')
const fs = require('fs')
const { createPersistentRunner } = require('../powershell')

const CHROME_TAB_ANNOTATION = /(?: - (?:High memory usage|Memory usage) - [\d.,]+\s?[KMG]B| - (?:Audio playing|Audio muted))+$/

function cleanTabTitle(title) {
  return title.replace(CHROME_TAB_ANNOTATION, '').trim()
}

function parseTabs(raw) {
  if (!raw) return []
  const tabs = []
  for (const line of raw.split(/\r?\n/)) {
    const parts = line.split('\t')
    if (parts.length < 5) continue
    const hwnd = Number(parts[0])
    const index = Number(parts[2])
    const title = cleanTabTitle(parts.slice(4).join('\t'))
    if (!Number.isFinite(hwnd) || !Number.isFinite(index) || !title) continue
    tabs.push({ hwnd, browser: parts[1], index, selected: parts[3] === '1', title })
  }
  return tabs
}

function scriptPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'scripts', 'browserTabs.ps1')
    : path.join(__dirname, '..', 'scripts', 'browserTabs.ps1')
}

let runner = null

function ensureRunner() {
  if (!runner) {
    runner = createPersistentRunner(undefined, undefined, () => fs.readFileSync(scriptPath(), 'utf8'))
  }
  return runner
}

async function listTabs() {
  try {
    return parseTabs(await ensureRunner().run('Get-BrowserTabs'))
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
  cleanTabTitle,
  parseTabs,
  handlers: {
    'browser-tabs/list': () => listTabs(),
    'browser-tabs/activate': (_event, tab) => activateTab(tab),
  },
}
