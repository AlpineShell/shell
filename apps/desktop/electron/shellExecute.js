const fs = require('fs')
const path = require('path')
const { execFile } = require('child_process')
const { quotePowerShellLiteral } = require('./powershell')

const WORKER_ENTRY = path.join(__dirname, 'shellExecuteWorker.js')
const REQUEST_TIMEOUT_MS = 15000
const CONSENT_REQUEST_TIMEOUT_MS = 120000
const PROMPT_REQUEST_TIMEOUT_MS = 15 * 60000
const ELEVATE_VERB = 'runas'
const ZONE_IDENTIFIER_STREAM = 'Zone.Identifier'
const INTERNET_ZONE = 3

let worker = null
let workerReady = false
let workerUnavailable = false
let nextRequestId = 0
const pendingRequests = new Map()

function takeRequest(id) {
  const request = pendingRequests.get(id)
  if (!request) return null
  pendingRequests.delete(id)
  clearTimeout(request.timer)
  return request
}

function settle(id, ok) {
  const request = takeRequest(id)
  if (request) request.resolve(ok)
}

function settleAll(ok) {
  for (const id of Array.from(pendingRequests.keys())) settle(id, ok)
}

function retryAllThroughFallback() {
  for (const id of Array.from(pendingRequests.keys())) {
    const request = takeRequest(id)
    if (request) request.resolve(fallbackExecute(request.file, request.args))
  }
}

function stopWorker(target) {
  target.removeAllListeners()
  target.on('error', () => {})
  target.terminate().catch(() => {})
}

function dropWorker(reason) {
  if (!worker) return
  const dropped = worker
  worker = null
  workerReady = false
  stopWorker(dropped)
  settleAll(false)
  console.error('[shellExecute] dropped worker:', reason)
}

function startWorker() {
  const { Worker } = require('worker_threads')
  const started = new Worker(WORKER_ENTRY)
  started.unref()
  return started
}

function ensureWorker() {
  if (worker || workerUnavailable) return worker
  try {
    const started = startWorker()
    started.on('message', (message) => {
      if (message.ready) { workerReady = true; return }
      if (!message.ok) console.error('[shellExecute] failed, detail', message.detail)
      settle(message.id, !!message.ok)
    })
    started.on('error', (e) => {
      if (worker !== started) return
      workerUnavailable = true
      worker = null
      console.error('[shellExecute] worker error, falling back to Start-Process:', e.message)
      if (workerReady) settleAll(false)
      else retryAllThroughFallback()
    })
    started.on('exit', () => {
      if (worker !== started) return
      worker = null
      settleAll(false)
    })
    workerReady = false
    worker = started
  } catch (e) {
    workerUnavailable = true
    console.error('[shellExecute] worker unavailable, falling back to Start-Process:', e.message)
  }
  return worker
}

function startProcessCommand(file, args, verb) {
  return [
    `Start-Process -FilePath ${quotePowerShellLiteral(file)}`,
    ...(args ? [`-ArgumentList ${quotePowerShellLiteral(args)}`] : []),
    ...(verb ? [`-Verb ${quotePowerShellLiteral(verb)}`] : []),
  ].join(' ')
}

function fallbackExecute(file, args, verb) {
  const command = startProcessCommand(file, args, verb)
  return new Promise((resolve) => {
    execFile('powershell', ['-NoProfile', '-Command', command], { windowsHide: true }, (err) => {
      if (err) console.error('[shellExecute] fallback failed for', file, '-', err.message)
      resolve(!err)
    })
  })
}

function isMarkedFromInternet(file) {
  try {
    const mark = /ZoneId\s*=\s*(\d+)/i.exec(fs.readFileSync(`${file}:${ZONE_IDENTIFIER_STREAM}`, 'utf8'))
    return Boolean(mark) && Number(mark[1]) >= INTERNET_ZONE
  } catch {
    return false
  }
}

function shellExecute(file, args, { startPromptWorker = startWorker } = {}) {
  const target = String(file || '').trim()
  if (!target) return Promise.resolve(false)
  const parameters = args ? String(args) : null
  if (isMarkedFromInternet(target)) {
    return launchOnOwnWorker(target, { args: parameters, showUi: true, startOwnWorker: startPromptWorker, timeoutMs: PROMPT_REQUEST_TIMEOUT_MS })
  }
  const active = ensureWorker()
  if (!active) return fallbackExecute(target, parameters)
  const id = ++nextRequestId
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingRequests.delete(id)
      dropWorker(`no reply for ${target} within ${REQUEST_TIMEOUT_MS} ms`)
      resolve(false)
    }, REQUEST_TIMEOUT_MS)
    if (typeof timer.unref === 'function') timer.unref()
    pendingRequests.set(id, { resolve, timer, file: target, args: parameters })
    active.postMessage({ id, file: target, args: parameters })
  })
}

function launchOnOwnWorker(target, { args = null, verb = null, showUi, startOwnWorker, timeoutMs }) {
  if (workerUnavailable) return fallbackExecute(target, args, verb)
  let ownWorker
  try {
    ownWorker = startOwnWorker()
  } catch (e) {
    console.error('[shellExecute] own worker unavailable, falling back to Start-Process:', e.message)
    return fallbackExecute(target, args, verb)
  }
  const id = ++nextRequestId
  return new Promise((resolve) => {
    let ready = false
    const timer = setTimeout(() => {
      console.error('[shellExecute] no answer to the prompt for', target, 'within', timeoutMs, 'ms')
      finish(false)
    }, timeoutMs)
    if (typeof timer.unref === 'function') timer.unref()
    function finish(result) {
      clearTimeout(timer)
      stopWorker(ownWorker)
      resolve(result)
    }
    ownWorker.on('message', (message) => {
      if (message.ready) { ready = true; return }
      if (!message.ok) console.error('[shellExecute] prompted launch failed, detail', message.detail)
      finish(!!message.ok)
    })
    ownWorker.on('error', (e) => {
      console.error('[shellExecute] own worker error:', e.message)
      finish(ready ? false : fallbackExecute(target, args, verb))
    })
    ownWorker.on('exit', () => finish(false))
    ownWorker.postMessage({ id, file: target, args, verb, showUi })
  })
}

function shellExecuteElevated(file, { startConsentWorker = startWorker, timeoutMs = CONSENT_REQUEST_TIMEOUT_MS } = {}) {
  const target = String(file || '').trim()
  if (!target) return Promise.resolve(false)
  const showUi = isMarkedFromInternet(target)
  return launchOnOwnWorker(target, {
    verb: ELEVATE_VERB,
    showUi,
    startOwnWorker: startConsentWorker,
    timeoutMs: showUi ? PROMPT_REQUEST_TIMEOUT_MS : timeoutMs,
  })
}

function existsLoose(candidate) {
  try { return fs.existsSync(candidate) } catch { return false }
}

function splitCommandLine(commandLine) {
  const text = String(commandLine || '').trim()
  if (!text) return { file: '', args: '' }
  if (text.startsWith('"')) {
    const end = text.indexOf('"', 1)
    if (end > 0) return { file: text.slice(1, end), args: text.slice(end + 1).trim() }
    return { file: text.slice(1), args: '' }
  }
  if (existsLoose(text)) return { file: text, args: '' }
  for (let space = text.indexOf(' '); space > 0; space = text.indexOf(' ', space + 1)) {
    const candidate = text.slice(0, space)
    if (existsLoose(candidate) || existsLoose(`${candidate}.exe`)) {
      return { file: candidate, args: text.slice(space + 1).trim() }
    }
  }
  const firstSpace = text.indexOf(' ')
  if (firstSpace < 0) return { file: text, args: '' }
  return { file: text.slice(0, firstSpace), args: text.slice(firstSpace + 1).trim() }
}

function shellExecuteCommandLine(commandLine) {
  const { file, args } = splitCommandLine(commandLine)
  if (!file) return Promise.resolve(false)
  return shellExecute(file, args)
}

module.exports = { shellExecute, shellExecuteElevated, shellExecuteCommandLine, splitCommandLine, startProcessCommand, isMarkedFromInternet }
