// Runs inside an Electron utilityProcess — one per plugin backend, isolated from the
// main process. It requires the plugin's declared `main` entry, hands it a small
// capability context, and relays whatever the backend publishes back to main. It never
// touches Electron main-process APIs, and a crash here cannot take down the shell.

let stopHandler = null

function post(message) {
  try {
    process.parentPort.postMessage(message)
  } catch {}
}

function toText(value) {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function makeContext(init) {
  const ctx = {
    id: init.id,
    pluginDir: init.dir,
    publish(channel, data) {
      if (typeof channel === 'string' && channel) post({ type: 'publish', channel, data })
    },
    log(...args) {
      post({ type: 'log', args: args.map(toText) })
    },
    onStop(handler) {
      if (typeof handler === 'function') stopHandler = handler
    },
    poll(channel, fn, everyMs) {
      const tick = () => {
        Promise.resolve()
          .then(fn)
          .then((data) => {
            if (data) ctx.publish(channel, data)
          })
          .catch((e) => {
            ctx.log('poll ' + channel + ' failed: ' + (e && e.message ? e.message : toText(e)))
          })
      }
      tick()
      const timer = setInterval(tick, everyMs)
      return () => clearInterval(timer)
    },
  }
  return ctx
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

process.parentPort.on('message', async (event) => {
  const msg = event && event.data
  if (!msg || typeof msg !== 'object') return
  if (msg.type === 'init') {
    await startBackend(msg)
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
