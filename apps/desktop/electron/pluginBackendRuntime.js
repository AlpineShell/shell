const { createPluginSettings } = require('./pluginBackendSettings')
const { createPluginContext, toText } = require('./pluginBackendContext')

let stopHandler = null
let commandHandler = null
let windowEventHandler = null
let pluginSettings = null

function post(message) {
  try {
    process.parentPort.postMessage(message)
  } catch {}
}

function reportToHost(message) {
  post({ type: 'log', args: [message] })
}

function makeContext(init) {
  return createPluginContext(init, {
    post,
    settings: pluginSettings.api,
    setStopHandler: (handler) => {
      stopHandler = handler
    },
    setCommandHandler: (handler) => {
      commandHandler = handler
    },
    setWindowEventHandler: (handler) => {
      windowEventHandler = handler
    },
  })
}

async function runStop() {
  const handler = stopHandler
  stopHandler = null
  try {
    if (handler) await handler()
  } catch (e) {
    post({ type: 'log', args: ['stop handler threw: ' + (e && e.message)] })
  }
}

async function startBackend(init) {
  pluginSettings = createPluginSettings(init.settings, reportToHost)
  let mod
  try {
    mod = require(init.entry)
  } catch (e) {
    post({ type: 'error', message: 'require failed: ' + (e && e.message) })
    process.exit(1)
    return
  }
  const startFn =
    typeof mod === 'function'
      ? mod
      : mod && typeof mod.start === 'function'
        ? mod.start
        : mod && typeof mod.default === 'function'
          ? mod.default
          : mod && mod.default && mod.default.start
  if (typeof startFn !== 'function') {
    post({ type: 'error', message: 'backend entry has no start(ctx) export' })
    process.exit(1)
    return
  }
  try {
    const cleanup = await startFn(makeContext(init))
    if (typeof cleanup === 'function' && !stopHandler) stopHandler = cleanup
    post({ type: 'ready' })
  } catch (e) {
    post({ type: 'error', message: 'start(ctx) threw: ' + (e && e.message) })
    process.exit(1)
  }
}

async function runCommand(msg) {
  if (!commandHandler) {
    post({ type: 'commandResult', callId: msg.callId, ok: false, error: 'backend does not accept commands' })
    return
  }
  try {
    const value = await commandHandler(msg.name, msg.payload)
    post({ type: 'commandResult', callId: msg.callId, ok: true, value })
  } catch (e) {
    post({ type: 'commandResult', callId: msg.callId, ok: false, error: (e && e.message) || toText(e) })
  }
}

process.parentPort.on('message', async (event) => {
  const msg = event && event.data
  if (!msg || typeof msg !== 'object') return
  if (msg.type === 'init') {
    await startBackend(msg)
  } else if (msg.type === 'command') {
    await runCommand(msg)
  } else if (msg.type === 'settings') {
    if (pluginSettings) pluginSettings.apply(msg.values)
  } else if (msg.type === 'window-event') {
    if (windowEventHandler) {
      try {
        await windowEventHandler(msg.event, msg)
      } catch (e) {
        post({ type: 'log', args: ['window event handler threw: ' + (e && e.message)] })
      }
    }
  } else if (msg.type === 'stop') {
    await runStop()
    post({ type: 'stopped' })
    process.exit(0)
  }
})

process.on('uncaughtException', (e) => {
  post({ type: 'error', message: 'uncaught: ' + (e && e.message) })
  process.exit(1)
})
process.on('unhandledRejection', (e) => {
  post({ type: 'error', message: 'unhandledRejection: ' + (e && (e.message || e)) })
})
