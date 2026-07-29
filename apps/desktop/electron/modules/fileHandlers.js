// Routes a file the OS handed to Alpine Shell to the enabled plugin that claims its
// extension, via the plugin command channel. Claims come from contributes.fileHandlers, so a
// disabled plugin claims nothing: its extensions are unregistered from Windows and a file
// that still reaches the shell is declined with a reason instead of being opened.

const { app } = require('electron')
const path = require('path')
const fs = require('fs')
const plugins = require('./plugins')
const notice = require('./shellNotice')
const pluginBackendHost = require('../pluginBackendHost')
const fileAssociations = require('../fileAssociations')

const STATE_FILE_NAME = 'fileHandlers.json'
const NOTICE_ID = 'file-handler'
const OPEN_TIMEOUT_MS = 900000
const BACKEND_RETRY_ATTEMPTS = 6
const BACKEND_RETRY_DELAY_MS = 1500
const RETRYABLE_ERRORS = ['backend not running', 'backend does not accept commands']
const FIRST_APPLY_DELAY_MS = 4000

let claims = new Map()
let openPluginsPage = null
let synced = false
let applyTimer = null

function setPluginsPageOpener(fn) {
  openPluginsPage = typeof fn === 'function' ? fn : null
}

function statePath() {
  return path.join(app.getPath('userData'), STATE_FILE_NAME)
}

function readState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath(), 'utf8'))
    return {
      extensions: Array.isArray(parsed.extensions) ? parsed.extensions.filter((e) => typeof e === 'string') : [],
      fingerprint: typeof parsed.fingerprint === 'string' ? parsed.fingerprint : '',
    }
  } catch (e) {
    if (e.code !== 'ENOENT') console.error('[file-handlers] state read error:', e.message)
    return { extensions: [], fingerprint: '' }
  }
}

function writeState(extensions, fingerprint) {
  const target = statePath()
  const temporary = `${target}.tmp`
  try {
    fs.writeFileSync(temporary, JSON.stringify({ extensions, fingerprint }))
    fs.renameSync(temporary, target)
  } catch (e) {
    console.error('[file-handlers] state write error:', e.message)
  }
}

function readClaims() {
  const map = new Map()
  let records = []
  try {
    records = plugins.listPlugins()
  } catch (e) {
    console.error('[file-handlers] listPlugins failed:', e && e.message)
    return map
  }
  for (const record of records) {
    if (record.enabled === false || record.loadable !== true) continue
    const contributed = (record.contributes && record.contributes.fileHandlers) || []
    for (const handler of contributed) {
      for (const extension of handler.extensions || []) {
        if (map.has(extension)) continue
        map.set(extension, {
          extension,
          pluginId: record.id,
          pluginName: record.name || record.id,
          command: handler.command,
          typeName: handler.name || null,
        })
      }
    }
  }
  return map
}

function sync() {
  const next = readClaims()
  const stored = readState()
  const wanted = [...next.keys()].sort()
  const register = wanted.map((extension) => ({ extension, typeName: next.get(extension).typeName }))
  const gone = stored.extensions.filter((extension) => !next.has(extension))
  const fingerprint = fileAssociations.fingerprint(register)
  claims = next
  if (!gone.length && fingerprint === stored.fingerprint) {
    synced = true
    return
  }
  const delay = synced ? 0 : FIRST_APPLY_DELAY_MS
  synced = true
  if (applyTimer) clearTimeout(applyTimer)
  applyTimer = setTimeout(() => {
    applyTimer = null
    fileAssociations.apply({ register, unregister: gone })
    writeState(wanted, fingerprint)
  }, delay)
}

function findHandledFile(argv) {
  if (!Array.isArray(argv)) return null
  for (const candidate of argv) {
    if (typeof candidate !== 'string' || candidate.startsWith('-')) continue
    const extension = path.extname(candidate).toLowerCase()
    if (!extension || !claims.has(extension)) continue
    let resolved
    try {
      resolved = path.resolve(candidate)
    } catch {
      continue
    }
    if (fs.existsSync(resolved)) return resolved
  }
  return null
}

function isRetryable(error) {
  return typeof error === 'string' && RETRYABLE_ERRORS.includes(error)
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function sendWithBackendRetry(claim, payload) {
  let result = { ok: false, error: 'backend not running' }
  for (let attempt = 0; attempt < BACKEND_RETRY_ATTEMPTS; attempt += 1) {
    result = await pluginBackendHost.sendCommand(claim.pluginId, claim.command, payload, { timeoutMs: OPEN_TIMEOUT_MS })
    if (result.ok || !isRetryable(result.error)) return result
    await delay(BACKEND_RETRY_DELAY_MS)
  }
  return result
}

function declineUnclaimed(filePath, extension) {
  notice.show({
    id: NOTICE_ID,
    title: 'Nothing here opens this file',
    message: `${path.basename(filePath)} needs a plugin that handles ${extension} files, and none is enabled.`,
    tone: 'error',
    action: openPluginsPage ? { label: 'Open plugins', run: () => openPluginsPage() } : null,
    timeoutMs: 0,
  })
  return { ok: false, reason: 'no-handler' }
}

function askedQuestion(value) {
  const question = value && value.needsConfirmation
  if (!question || typeof question !== 'object') return null
  if (typeof question.message !== 'string' || !question.message) return null
  return question
}

async function openFile(filePath) {
  if (typeof filePath !== 'string' || !filePath) return { ok: false, reason: 'no-file' }
  const extension = path.extname(filePath).toLowerCase()
  const claim = claims.get(extension)
  if (!claim) return declineUnclaimed(filePath, extension)
  return runHandler(claim, filePath, false, null)
}

async function runHandler(claim, filePath, confirmed, busyMessage) {
  const fileName = path.basename(filePath)
  notice.show({
    id: NOTICE_ID,
    title: claim.pluginName,
    message: busyMessage || `Reading ${fileName}…`,
    busy: true,
    pill: true,
    timeoutMs: 0,
  })

  const result = await sendWithBackendRetry(claim, { file: filePath, confirmed })
  if (!result.ok) {
    notice.show({
      id: NOTICE_ID,
      title: claim.pluginName,
      message: `${fileName} could not be opened: ${result.error}`,
      tone: 'error',
      action: openPluginsPage ? { label: 'Open plugins', run: () => openPluginsPage() } : null,
      timeoutMs: 0,
    })
    return { ok: false, reason: result.error }
  }

  const value = result.value && typeof result.value === 'object' ? result.value : {}
  const question = confirmed ? null : askedQuestion(value)
  if (question) {
    notice.show({
      id: NOTICE_ID,
      title: typeof question.title === 'string' && question.title ? question.title : claim.pluginName,
      message: question.message,
      confirm: {
        label: question.confirmLabel,
        cancelLabel: question.cancelLabel,
        run: () =>
          runHandler(claim, filePath, true, question.busyMessage).catch((e) =>
            console.error('[file-handlers] confirmed open failed:', e && e.message),
          ),
      },
      timeoutMs: 0,
    })
    return { ok: true, pending: true }
  }

  const failed = value.ok === false
  notice.show({
    id: NOTICE_ID,
    title: claim.pluginName,
    message: value.message || (failed ? `${fileName} could not be opened.` : `${fileName} is ready.`),
    tone: failed ? 'error' : 'success',
    pill: !failed,
    timeoutMs: failed ? 0 : 7000,
  })
  return { ok: !failed, value }
}

function state() {
  return [...claims.values()].map((claim) => ({
    extension: claim.extension,
    pluginId: claim.pluginId,
    pluginName: claim.pluginName,
    ...fileAssociations.defaultState(claim.extension),
  }))
}

module.exports = {
  handlers: {
    'file-handlers/state': () => state(),
    'file-handlers/choose-default': () => fileAssociations.openDefaultAppsSettings(),
  },
  start() {
    plugins.onPluginsChanged(sync)
    sync()
  },
  setPluginsPageOpener,
  findHandledFile,
  openFile,
}
