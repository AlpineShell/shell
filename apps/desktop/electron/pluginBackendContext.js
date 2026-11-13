const { openCommand } = require('./shellLaunch')

function toText(value) {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function createPluginContext(init, { post, settings, setStopHandler, setCommandHandler, setWindowEventHandler }) {
  const ctx = {
    id: init.id,
    pluginDir: init.dir,
    dataDir: init.dataDir,
    publish(channel, data) {
      if (typeof channel === 'string' && channel) post({ type: 'publish', channel, data })
    },
    log(...args) {
      post({ type: 'log', args: args.map(toText) })
    },
    onStop(handler) {
      if (typeof handler === 'function') setStopHandler(handler)
    },
    onCommand(handler) {
      if (typeof handler === 'function') setCommandHandler(handler)
    },
    settings,
    shell: {
      openCommand(url) {
        return openCommand(init.launch || { target: process.execPath, args: [] }, url)
      },
    },
    windows: {
      open(request) {
        post({ type: 'window-open', request })
      },
      close(id) {
        post({ type: 'window-close', id })
      },
      send(id, channel, data) {
        post({ type: 'window-send', id, channel, data })
      },
      onEvent(handler) {
        if (typeof handler === 'function') setWindowEventHandler(handler)
      },
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

module.exports = { createPluginContext, toText }
