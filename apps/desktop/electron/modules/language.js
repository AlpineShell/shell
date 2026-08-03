const path = require('path')
const fs = require('fs')
const { runPowerShellScript } = require('../powershell')
const parser = require('./languageParser')

let keyboardLayout = null
try {
  keyboardLayout = require('./keyboardLayout')
} catch (e) {
  console.error('[language] keyboard layout unavailable:', e.message)
}

const CATALOG_FILE = 'language-catalog.json'
const CATALOG_VERSION = 1
const CATALOG_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000
const READ_TIMEOUT_MS = 20000
const WRITE_TIMEOUT_MS = 25000
const CATALOG_TIMEOUT_MS = 45000
const SIGN_OUT_ACTIONS = new Set(['display', 'regionalFormat'])

let broadcast = null
let cachedState = null
let statePromise = null
let cachedCatalog = null
let catalogPromise = null
let pendingSignOut = false
let writeChain = Promise.resolve()

function getScriptPath(name) {
  const { app } = require('electron')
  const scriptsDir = app.isPackaged ? path.join(process.resourcesPath, 'scripts') : path.join(__dirname, '..', 'scripts')
  return path.join(scriptsDir, name)
}

function getCatalogPath() {
  const { app } = require('electron')
  return path.join(app.getPath('userData'), CATALOG_FILE)
}

function resolveIndirectString(indirect, fallback) {
  if (!keyboardLayout) return fallback
  try {
    return keyboardLayout.resolveIndirectString(indirect, fallback)
  } catch (e) {
    console.error('[language] indirect string error:', e.message)
    return fallback
  }
}

function withPendingSignOut(state) {
  return { ...state, pendingSignOut }
}

function currentState() {
  return withPendingSignOut(cachedState ?? parser.emptyLanguageState('error'))
}

async function readState() {
  if (statePromise) return statePromise
  statePromise = (async () => {
    try {
      const result = await runPowerShellScript(getScriptPath('languageRead.ps1'), [], READ_TIMEOUT_MS)
      cachedState = parser.parseLanguageState(result.stdout, resolveIndirectString)
    } catch (e) {
      console.error('[language] state read error:', e.message)
      cachedState = parser.emptyLanguageState('error')
    }
    return withPendingSignOut(cachedState)
  })()
  try {
    return await statePromise
  } finally {
    statePromise = null
  }
}

function getState() {
  if (cachedState) return Promise.resolve(withPendingSignOut(cachedState))
  return readState()
}

function readCatalogFromDisk() {
  const { app } = require('electron')
  const file = getCatalogPath()
  if (!fs.existsSync(file)) return null
  const stored = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (!stored || stored.version !== CATALOG_VERSION) return null
  if (stored.appVersion !== app.getVersion()) return null
  if (!Number.isFinite(stored.builtAt) || Date.now() - stored.builtAt > CATALOG_MAX_AGE_MS) return null
  if (!stored.catalog || !Array.isArray(stored.catalog.layouts) || stored.catalog.layouts.length === 0) return null
  return stored.catalog
}

function writeCatalogToDisk(catalog) {
  const { app } = require('electron')
  const file = getCatalogPath()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify({ version: CATALOG_VERSION, appVersion: app.getVersion(), builtAt: Date.now(), catalog }))
}

async function readCatalog(force) {
  if (!force && cachedCatalog) return cachedCatalog
  if (catalogPromise) return catalogPromise
  catalogPromise = (async () => {
    if (!force) {
      try {
        const stored = readCatalogFromDisk()
        if (stored) {
          cachedCatalog = stored
          return stored
        }
      } catch (e) {
        console.error('[language] catalog cache read error:', e.message)
      }
    }
    let catalog = { languages: [], layouts: [], regions: [] }
    try {
      const result = await runPowerShellScript(getScriptPath('languageCatalog.ps1'), [], CATALOG_TIMEOUT_MS)
      catalog = parser.parseCatalog(result.stdout, resolveIndirectString)
    } catch (e) {
      console.error('[language] catalog read error:', e.message)
    }
    cachedCatalog = catalog
    if (catalog.layouts.length > 0) {
      try {
        writeCatalogToDisk(catalog)
      } catch (e) {
        console.error('[language] catalog cache write error:', e.message)
      }
    }
    return catalog
  })()
  try {
    return await catalogPromise
  } finally {
    catalogPromise = null
  }
}

async function runWrite(action, args) {
  const result = await runPowerShellScript(getScriptPath('languageWrite.ps1'), ['-Action', action, ...args], WRITE_TIMEOUT_MS)
  const outcome = parser.parseWriteResult(result.stdout)
  if (!outcome.ok) console.error(`[language] ${action} write rejected: ${outcome.reason}`)
  return outcome
}

function enqueueWrite(action, args) {
  const job = writeChain.then(async () => {
    const outcome = await runWrite(action, args)
    if (outcome.ok && SIGN_OUT_ACTIONS.has(action)) pendingSignOut = true
    const state = await readState()
    if (broadcast) broadcast('language/state-changed', state)
    return state
  })
  writeChain = job.then(
    () => undefined,
    () => undefined
  )
  return job.catch((e) => {
    console.error(`[language] ${action} write error:`, e.message)
    return currentState()
  })
}

function configuredInputMethods(state) {
  return state.languages.flatMap((language) => language.inputMethods)
}

function targetWindow() {
  if (!keyboardLayout) return 0
  try {
    const foreground = keyboardLayout.foregroundWindow()
    if (foreground && keyboardLayout.windowProcessId(foreground) !== process.pid) return foreground
  } catch (e) {
    console.error('[language] foreground lookup error:', e.message)
  }
  try {
    const { getLastUserForeground } = require('./launcher')
    if (typeof getLastUserForeground === 'function') return getLastUserForeground() || 0
  } catch (e) {
    console.error('[language] remembered foreground error:', e.message)
  }
  return 0
}

module.exports = {
  handlers: {
    'language/state-get': () => getState(),
    'language/state-refresh': () => readState(),
    'language/catalog-get': (_event, force) => readCatalog(force === true),
    'language/active-get': async () => {
      if (!keyboardLayout) return null
      try {
        const target = targetWindow()
        if (!target) return null
        const hkl = keyboardLayout.layoutForWindow(target)
        if (!hkl) return null
        const state = await getState()
        const method = parser.findInputMethodForLayout(state, hkl)
        return method ? { tip: method.tip, langId: method.langId, klid: method.klid, name: method.name } : null
      } catch (e) {
        console.error('[language] active layout error:', e.message)
        return null
      }
    },
    'language/languages-set': async (_event, tags) => {
      const desired = parser.sanitizeLanguageTags(tags)
      if (desired.length === 0) return currentState()
      return enqueueWrite('languages', ['-Values', desired.join(',')])
    },
    'language/input-methods-set': async (_event, payload) => {
      const request = payload && typeof payload === 'object' ? payload : {}
      if (!parser.isValidLanguageTag(request.tag)) return currentState()
      const tips = parser.sanitizeInputMethodTips(request.tips)
      const state = await getState()
      const remaining = state.languages
        .filter((language) => language.tag !== request.tag)
        .reduce((total, language) => total + language.inputMethods.length, 0)
      if (tips.length === 0 && remaining === 0) return withPendingSignOut(state)
      const args = ['-Tag', request.tag]
      if (tips.length > 0) args.push('-Values', tips.join(','))
      return enqueueWrite('inputMethods', args)
    },
    'language/default-input-set': async (_event, tip) => {
      const state = await getState()
      if (!configuredInputMethods(state).some((method) => method.tip === tip)) return withPendingSignOut(state)
      return enqueueWrite('defaultInput', ['-Tip', tip])
    },
    'language/display-set': async (_event, tag) => {
      const state = await getState()
      if (tag === null || tag === '') return enqueueWrite('display', [])
      if (!state.installedDisplayLanguages.includes(tag)) return withPendingSignOut(state)
      return enqueueWrite('display', ['-Tag', tag])
    },
    'language/regional-format-set': async (_event, tag) => {
      if (!parser.isValidLanguageTag(tag)) return currentState()
      return enqueueWrite('regionalFormat', ['-Tag', tag])
    },
    'language/home-location-set': async (_event, geoId) => {
      if (!Number.isInteger(geoId) || geoId <= 0) return currentState()
      return enqueueWrite('homeLocation', ['-GeoId', String(geoId)])
    },
    'language/activate-input': async (_event, tip) => {
      if (!keyboardLayout) return false
      const state = await getState()
      const method = configuredInputMethods(state).find((entry) => entry.tip === tip)
      if (!method || method.kind !== 'layout' || !method.klid) return false
      const target = targetWindow()
      if (!target) return false
      try {
        return keyboardLayout.activateInputMethod(target, method.langId, method.klid)
      } catch (e) {
        console.error('[language] activate input error:', e.message)
        return false
      }
    },
  },
  start(b) {
    broadcast = b
  },
}
