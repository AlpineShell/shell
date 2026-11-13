const path = require('path')
const plugins = require('./modules/plugins')
const pluginSettings = require('./modules/pluginSettings')
const pluginWindows = require('./pluginWindows')
const { launchCommand } = require('./shellLaunch')
const { pluginLogs, RUNTIME_ERROR_SUMMARIES } = require('./pluginLogStore')

const RUNTIME_ENTRY = path.join(__dirname, 'pluginBackendRuntime.js')
const COMMAND_TIMEOUT_MS = 30000
const STOP_GRACE_MS = 1500
const EXIT_WAIT_MS = 1500

let broadcastFn = null
let nextCallId = 1
const running = new Map() // id -> { proc, channels: Set<string> }
const lastByChannel = new Map() // channel -> last published data
const heldForFileChange = new Set()

function isEligible(record) {
  return record.enabled !== false && record.loadable === true && record.hasBackend === true
}

function logBackend(pluginId, level, message) {
  pluginLogs.add(pluginId, { source: 'backend', level, message })
}

function logFailedCommand(pluginId, name, error) {
  pluginLogs.add(pluginId, { source: 'command', level: 'error', message: `${name}: ${error}` })
}

function logArgs(args) {
  return Array.isArray(args) ? args.map((arg) => (typeof arg === 'string' ? arg : String(arg))).join(' ') : ''
}

function recordUnexpectedExit(pluginId, code) {
  if (!code) {
    logBackend(pluginId, 'info', 'The backend exited.')
    return
  }
  logBackend(pluginId, 'error', `The backend exited with code ${code}.`)
  pluginLogs.setRuntimeError(pluginId, RUNTIME_ERROR_SUMMARIES.backend)
}

function forgetChannels(state) {
  for (const channel of state.channels) {
    plugins.unregisterPluginCapability(channel)
    lastByChannel.delete(channel)
  }
  state.channels.clear()
}

function startBackend(record) {
  const entry = plugins.resolvePluginFile(record.id, record.main)
  if (!entry) {
    console.error(`[plugin-backend] "${record.id}": backend entry missing or escapes plugin dir`)
    return
  }
  pluginWindows.closeAll(record.id)
  const { utilityProcess } = require('electron')
  let proc
  try {
    proc = utilityProcess.fork(RUNTIME_ENTRY, [], { serviceName: `alpine-plugin-${record.id}` })
  } catch (e) {
    console.error(`[plugin-backend] "${record.id}": fork failed:`, e && e.message)
    return
  }
  const state = { proc, channels: new Set(), pending: new Map() }
  running.set(record.id, state)

  proc.on('message', (msg) => {
    if (!msg || typeof msg !== 'object') return
    if (msg.type === 'publish' && typeof msg.channel === 'string' && msg.channel) {
      const channel = msg.channel
      if (!state.channels.has(channel)) {
        state.channels.add(channel)
        plugins.registerPluginCapability(channel, () =>
          lastByChannel.has(channel) ? lastByChannel.get(channel) : null,
        )
      }
      lastByChannel.set(channel, msg.data)
      if (broadcastFn) broadcastFn('plugins/data', { channel, data: msg.data })
    } else if (msg.type === 'commandResult') {
      const settle = state.pending.get(msg.callId)
      if (settle) {
        state.pending.delete(msg.callId)
        clearTimeout(settle.timer)
        if (!msg.ok) logFailedCommand(record.id, settle.name, msg.error || 'command failed')
        settle.resolve(msg.ok ? { ok: true, value: msg.value } : { ok: false, error: msg.error || 'command failed' })
      }
    } else if (msg.type === 'window-open') {
      const result = pluginWindows.open(record.id, path.dirname(entry), msg.request)
      if (!result.ok) {
        console.error(`[plugin-backend:${record.id}] window open refused: ${result.error}`)
        logBackend(record.id, 'error', `Window open refused: ${result.error}`)
      }
    } else if (msg.type === 'window-close') {
      pluginWindows.close(record.id, msg.id)
    } else if (msg.type === 'window-send') {
      pluginWindows.send(record.id, msg.id, msg.channel, msg.data)
    } else if (msg.type === 'log') {
      console.log(`[plugin-backend:${record.id}]`, ...(Array.isArray(msg.args) ? msg.args : []))
      logBackend(record.id, 'info', logArgs(msg.args))
    } else if (msg.type === 'error') {
      console.error(`[plugin-backend:${record.id}]`, msg.message)
      logBackend(record.id, 'error', String(msg.message))
    }
  })

  proc.on('exit', (code) => {
    if (code) console.error(`[plugin-backend] "${record.id}" exited with code ${code}`)
    rejectPending(state, 'backend exited')
    forgetChannels(state)
    if (running.get(record.id) !== state) return
    running.delete(record.id)
    recordUnexpectedExit(record.id, code)
  })

  proc.postMessage({
    type: 'init',
    id: record.id,
    dir: path.dirname(entry),
    dataDir: plugins.ensurePluginDataDir(record.id),
    entry,
    settings: pluginSettings.getValues(record.id),
    launch: launchCommand({
      execPath: process.execPath,
      argv: process.argv,
      runsFromSource: Boolean(process.defaultApp),
    }),
  })
}

function rejectPending(state, reason) {
  for (const [callId, settle] of state.pending) {
    clearTimeout(settle.timer)
    settle.resolve({ ok: false, error: reason })
    state.pending.delete(callId)
  }
}

function sendToBackend(pluginId, message) {
  const state = running.get(pluginId)
  if (!state || !state.proc) return
  try {
    state.proc.postMessage(message)
  } catch (e) {
    console.error(`[plugin-backend:${pluginId}] ${message && message.type} message failed:`, e && e.message)
  }
}

function sendSettings(pluginId, values) {
  sendToBackend(pluginId, { type: 'settings', values })
}

function sendCommand(id, name, payload, options) {
  const state = running.get(id)
  if (!state) return Promise.resolve({ ok: false, error: 'backend not running' })
  if (typeof name !== 'string' || !name) return Promise.resolve({ ok: false, error: 'invalid command' })
  const timeoutMs = options && Number.isFinite(options.timeoutMs) && options.timeoutMs > 0 ? options.timeoutMs : COMMAND_TIMEOUT_MS
  const callId = nextCallId++
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      state.pending.delete(callId)
      logFailedCommand(id, name, 'command timed out')
      resolve({ ok: false, error: 'command timed out' })
    }, timeoutMs)
    state.pending.set(callId, { resolve, timer, name })
    try {
      state.proc.postMessage({ type: 'command', callId, name, payload })
    } catch (e) {
      state.pending.delete(callId)
      clearTimeout(timer)
      resolve({ ok: false, error: (e && e.message) || 'postMessage failed' })
    }
  })
}

function stopBackend(id) {
  const state = running.get(id)
  if (!state) return Promise.resolve()
  running.delete(id)
  rejectPending(state, 'backend stopped')
  forgetChannels(state)
  const proc = state.proc
  const exited = new Promise((resolve) => proc.once('exit', resolve))
  try {
    proc.postMessage({ type: 'stop' })
  } catch {}
  const killTimer = setTimeout(() => {
    try {
      proc.kill()
    } catch {}
  }, STOP_GRACE_MS)
  const givenUp = new Promise((resolve) => setTimeout(resolve, STOP_GRACE_MS + EXIT_WAIT_MS))
  return Promise.race([exited, givenUp]).then(() => clearTimeout(killTimer))
}

async function withPluginStopped(id, work) {
  heldForFileChange.add(id)
  pluginLogs.clearRuntimeError(id)
  try {
    pluginWindows.closeAll(id)
    await stopBackend(id)
    return await work()
  } finally {
    heldForFileChange.delete(id)
    sync()
  }
}

function sync() {
  let records = []
  try {
    records = plugins.listPlugins()
  } catch (e) {
    console.error('[plugin-backend] listPlugins failed:', e && e.message)
    return
  }
  const wanted = new Map()
  for (const record of records) if (isEligible(record)) wanted.set(record.id, record)
  for (const id of [...running.keys()]) if (!wanted.has(id)) stopBackend(id)
  for (const [id, record] of wanted) if (!running.has(id) && !heldForFileChange.has(id)) startBackend(record)
}

module.exports = {
  handlers: {
    'plugins/command': (_event, payload) =>
      sendCommand(payload && payload.id, payload && payload.name, payload && payload.payload),
    'plugin-window/command': (_event, payload) =>
      sendCommand(payload && payload.pluginId, payload && payload.name, {
        ...(payload && payload.payload),
        window: payload && payload.windowId,
      }),
    'plugin-window/close': (_event, payload) =>
      pluginWindows.close(payload && payload.pluginId, payload && payload.windowId),
  },
  start(broadcast) {
    broadcastFn = broadcast
    pluginWindows.configure({ send: sendToBackend })
    pluginWindows.start()
    pluginSettings.onSettingsChanged(sendSettings)
    plugins.onPluginsChanged(sync)
    plugins.setPluginStopper(withPluginStopped)
    sync()
  },
  sendCommand,
}
