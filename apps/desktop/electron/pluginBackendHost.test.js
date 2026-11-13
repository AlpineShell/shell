import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'events'
import path from 'path'
import { createRequire } from 'module'

const nodeRequire = createRequire(import.meta.url)

const PLUGIN_DIR = path.resolve(path.join(path.sep, 'plugins', 'com.example.weather'))

class FakeBackendProcess extends EventEmitter {
  constructor() {
    super()
    this.messages = []
  }

  postMessage(message) {
    this.messages.push(message)
    if (message.type === 'stop') setImmediate(() => this.emit('exit', 0))
  }

  kill() {
    this.emit('exit', 1)
  }

  send(message) {
    this.emit('message', message)
  }

  commandCall() {
    return this.messages.find((message) => message.type === 'command')
  }
}

const forked = []
let installedRecords = []
let pluginsChanged = () => {}
let pluginStopper = null
let windowOpenResult = { ok: true }

function seedModule(relativePath, exports) {
  const id = nodeRequire.resolve(relativePath)
  nodeRequire.cache[id] = { id, filename: id, loaded: true, exports }
}

seedModule('electron', {
  utilityProcess: {
    fork: () => {
      const proc = new FakeBackendProcess()
      forked.push(proc)
      return proc
    },
  },
})

seedModule('./modules/plugins.js', {
  listPlugins: () => installedRecords,
  resolvePluginFile: (id, main) => path.join(PLUGIN_DIR, main),
  ensurePluginDataDir: () => path.join(PLUGIN_DIR, 'data'),
  registerPluginCapability: () => {},
  unregisterPluginCapability: () => {},
  onPluginsChanged: (listener) => {
    pluginsChanged = listener
  },
  setPluginStopper: (stopper) => {
    pluginStopper = stopper
  },
})

seedModule('./modules/pluginSettings.js', { getValues: () => ({}), onSettingsChanged: () => {} })

seedModule('./pluginWindows.js', {
  configure: () => {},
  start: () => {},
  closeAll: () => {},
  close: () => ({ ok: true }),
  send: () => ({ ok: true }),
  open: () => windowOpenResult,
})

const host = nodeRequire('./pluginBackendHost.js')
const { pluginLogs } = nodeRequire('./pluginLogStore.js')

let nextPlugin = 0

function backendRecord(id) {
  return { id, name: id, main: 'backend.js', enabled: true, loadable: true, hasBackend: true }
}

function startPlugin() {
  nextPlugin += 1
  const id = `com.example.backend${nextPlugin}`
  installedRecords = [backendRecord(id)]
  pluginsChanged()
  return { id, proc: forked.at(-1) }
}

function messagesOf(id) {
  return pluginLogs.list(id).map(({ source, level, message }) => ({ source, level, message }))
}

beforeAll(() => {
  host.start(() => {})
})

afterEach(() => {
  windowOpenResult = { ok: true }
})

describe('what a plugin backend writes to its log', () => {
  it('logs ctx.log as info', () => {
    const { id, proc } = startPlugin()
    proc.send({ type: 'log', args: ['polled', '3 cities'] })
    expect(messagesOf(id)).toEqual([{ source: 'backend', level: 'info', message: 'polled 3 cities' }])
  })

  it('logs a backend that failed to start, and says it stopped once it exits', () => {
    const { id, proc } = startPlugin()
    proc.send({ type: 'error', message: 'start(ctx) threw: no api key' })
    proc.emit('exit', 1)
    expect(messagesOf(id)).toEqual([
      { source: 'backend', level: 'error', message: 'start(ctx) threw: no api key' },
      { source: 'backend', level: 'error', message: 'The backend exited with code 1.' },
    ])
    expect(pluginLogs.runtimeError(id)).toBe('The backend stopped with an error.')
  })

  it('logs nothing and keeps no error when Alpine stops the backend itself', async () => {
    const { id } = startPlugin()
    installedRecords = []
    pluginsChanged()
    await new Promise((resolve) => setImmediate(resolve))
    expect(messagesOf(id)).toEqual([])
    expect(pluginLogs.runtimeError(id)).toBeNull()
  })

  it('logs a window the backend was not allowed to open', () => {
    const { id, proc } = startPlugin()
    windowOpenResult = { ok: false, error: 'a window needs an id' }
    proc.send({ type: 'window-open', request: {} })
    expect(messagesOf(id)).toEqual([{ source: 'backend', level: 'error', message: 'Window open refused: a window needs an id' }])
  })
})

describe('commands in the plugin log', () => {
  it('logs a command that failed, by name', async () => {
    const { id, proc } = startPlugin()
    const reply = host.sendCommand(id, 'refresh', {})
    proc.send({ type: 'commandResult', callId: proc.commandCall().callId, ok: false, error: 'offline' })
    expect(await reply).toEqual({ ok: false, error: 'offline' })
    expect(messagesOf(id)).toEqual([{ source: 'command', level: 'error', message: 'refresh: offline' }])
  })

  it('logs a command that never answered', async () => {
    const { id } = startPlugin()
    expect(await host.sendCommand(id, 'refresh', {}, { timeoutMs: 5 })).toEqual({ ok: false, error: 'command timed out' })
    expect(messagesOf(id)).toEqual([{ source: 'command', level: 'error', message: 'refresh: command timed out' }])
  })

  it('leaves a command that worked out of the log', async () => {
    const { id, proc } = startPlugin()
    const reply = host.sendCommand(id, 'refresh', {})
    proc.send({ type: 'commandResult', callId: proc.commandCall().callId, ok: true, value: 1 })
    expect(await reply).toEqual({ ok: true, value: 1 })
    expect(messagesOf(id)).toEqual([])
  })
})

describe('a plugin whose files change', () => {
  it('loses its runtime error, since it starts again from new files', async () => {
    const { id, proc } = startPlugin()
    proc.emit('exit', 1)
    expect(pluginLogs.runtimeError(id)).not.toBeNull()
    const work = vi.fn(async () => 'replaced')
    expect(await pluginStopper(id, work)).toBe('replaced')
    expect(pluginLogs.runtimeError(id)).toBeNull()
  })
})
