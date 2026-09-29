const fs = require('fs')
const path = require('path')
const { execFile } = require('child_process')
const { quotePowerShellLiteral } = require('./powershell')

const WORKER_ENTRY = path.join(__dirname, 'shellExecuteWorker.js')
const REQUEST_TIMEOUT_MS = 15000
const CONSENT_REQUEST_TIMEOUT_MS = 120000
const ELEVATE_VERB = 'runas'

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
    if (request) request.resolve(fallbackExecute(request.file, request.args, request.verb))
  }
}

function dropWorker(reason) {
  if (!worker) return
  const dropped = worker
  worker = null
  workerReady = false
  dropped.removeAllListeners()
  dropped.on('error', () => {})
  dropped.terminate().catch(() => {})
  settleAll(false)
  console.error('[shellExecute] dropped worker:', reason)
}

function ensureWorker() {
  if (worker || workerUnavailable) return worker
  try {
    const { Worker } = require('worker_threads')
    const started = new Worker(WORKER_ENTRY)
    started.unref()
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

function shellExecute(file, args, verb) {
  const target = String(file || '').trim()
  if (!target) return Promise.resolve(false)
  const parameters = args ? String(args) : null
  const operation = verb ? String(verb) : null
  const active = ensureWorker()
  if (!active) return fallbackExecute(target, parameters, operation)
  const id = ++nextRequestId
  const timeoutMs = operation === ELEVATE_VERB ? CONSENT_REQUEST_TIMEOUT_MS : REQUEST_TIMEOUT_MS
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingRequests.delete(id)
      dropWorker(`no reply for ${target} within ${timeoutMs} ms`)
      resolve(false)
    }, timeoutMs)
    if (typeof timer.unref === 'function') timer.unref()
    pendingRequests.set(id, { resolve, timer, file: target, args: parameters, verb: operation })
    active.postMessage({ id, file: target, args: parameters, verb: operation })
  })
}

function shellExecuteElevated(file) {
  return shellExecute(file, null, ELEVATE_VERB)
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

module.exports = { shellExecute, shellExecuteElevated, shellExecuteCommandLine, splitCommandLine, startProcessCommand }
