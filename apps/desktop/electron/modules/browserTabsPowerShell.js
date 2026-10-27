const path = require('path')
const fs = require('fs')
const { createPersistentRunner } = require('../powershell')
const { parseTabs } = require('./browserTabsParser')

const COMMAND_TIMEOUT_MS = 30000

function scriptPath() {
  const { app } = require('electron')
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

async function listTabs() {
  return parseTabs(await ensureRunner().run('Get-BrowserTabs'))
}

async function activateTab(hwnd, index, title) {
  const titleBase64 = Buffer.from(title, 'utf8').toString('base64')
  const result = await ensureRunner().run(`Select-BrowserTab ${hwnd} ${index} '${titleBase64}'`)
  return result.trim() === 'ok'
}

async function warm() {
  ensureRunner().warm()
}

module.exports = { kind: 'powershell', warm, listTabs, activateTab }
