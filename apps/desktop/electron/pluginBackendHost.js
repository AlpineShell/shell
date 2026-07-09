// Supervisor for plugin backends. Each eligible plugin — one that declares a `main`
// entry and is enabled + loadable —
// runs in its own isolated Electron utilityProcess (pluginBackendRuntime.js). Whatever a
// backend publishes is registered as a plugin data channel and broadcast to the
// renderers, the same contract renderer plugins already read via usePluginData().
//
// Backends start only when their plugin is installed + enabled, and stop when it is
// disabled or uninstalled — nothing plugin-specific runs in the core shell.

const path = require('path')
const { utilityProcess } = require('electron')
const plugins = require('./modules/plugins')

const RUNTIME_ENTRY = path.join(__dirname, 'pluginBackendRuntime.js')

let broadcastFn = null
const running = new Map() // id -> { proc, channels: Set<string> }
const lastByChannel = new Map() // channel -> last published data

function isEligible(record) {
  return record.enabled !== false && record.loadable === true && record.hasBackend === true
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
  let proc
  try {
    proc = utilityProcess.fork(RUNTIME_ENTRY, [], { serviceName: `alpine-plugin-${record.id}` })
  } catch (e) {
    console.error(`[plugin-backend] "${record.id}": fork failed:`, e && e.message)
    return
  }
  const state = { proc, channels: new Set() }
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
    } else if (msg.type === 'log') {
      console.log(`[plugin-backend:${record.id}]`, ...(Array.isArray(msg.args) ? msg.args : []))
    } else if (msg.type === 'error') {
      console.error(`[plugin-backend:${record.id}]`, msg.message)
    }
  })

  proc.on('exit', (code) => {
    if (code) console.error(`[plugin-backend] "${record.id}" exited with code ${code}`)
    forgetChannels(state)
    if (running.get(record.id) === state) running.delete(record.id)
  })

  proc.postMessage({ type: 'init', id: record.id, dir: path.dirname(entry), entry })
}

function stopBackend(id) {
  const state = running.get(id)
  if (!state) return
  running.delete(id)
  forgetChannels(state)
  try {
    state.proc.postMessage({ type: 'stop' })
  } catch {}
  const proc = state.proc
  setTimeout(() => {
    try {
      proc.kill()
    } catch {}
  }, 1500)
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
  for (const [id, record] of wanted) if (!running.has(id)) startBackend(record)
}

module.exports = {
  handlers: {},
  start(broadcast) {
    broadcastFn = broadcast
    plugins.onPluginsChanged(sync)
    sync()
  },
}
