import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { createRequire } from 'module'

const nodeRequire = createRequire(import.meta.url)
const electronModuleId = nodeRequire.resolve('electron')
const powerMonitorListeners = new Map()

let userDataDir = ''

nodeRequire.cache[electronModuleId] = {
  id: electronModuleId,
  filename: electronModuleId,
  loaded: true,
  exports: {
    app: { getPath: () => userDataDir },
    powerMonitor: { on: (event, listener) => powerMonitorListeners.set(event, listener) },
  },
}

const storeFile = () => path.join(userDataDir, 'power-prefs.json')
const writeStore = (contents) => fs.writeFileSync(storeFile(), contents)
const readStore = () => JSON.parse(fs.readFileSync(storeFile(), 'utf8'))

async function startModule() {
  vi.resetModules()
  const { default: power } = await import('./power.js')
  const broadcasts = []
  power.start((channel, payload) => broadcasts.push({ channel, payload }))
  return { power, broadcasts }
}

const confirmActions = (power) => power.handlers['system/power-confirm-get']()
const setConfirmActions = (power, value) => power.handlers['system/power-confirm-set'](null, value)
const showHibernate = (power) => power.handlers['system/power-show-hibernate-get']()
const setShowHibernate = (power, value) => power.handlers['system/power-show-hibernate-set'](null, value)

beforeEach(() => {
  powerMonitorListeners.clear()
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alpine-power-prefs-'))
})

afterEach(() => {
  fs.rmSync(userDataDir, { recursive: true, force: true })
})

describe('reading the store', () => {
  it('asks before acting when nothing has been saved', async () => {
    const { power } = await startModule()
    expect(confirmActions(power)).toBe(true)
  })

  it('reads back a choice a previous session saved', async () => {
    writeStore(JSON.stringify({ confirmActions: false }))
    const { power } = await startModule()
    expect(confirmActions(power)).toBe(false)
  })

  it('falls back to asking when the store is corrupt', async () => {
    writeStore('{ confirmActions: nope')
    const { power } = await startModule()
    expect(confirmActions(power)).toBe(true)
  })

  it.each([
    ['a string', { confirmActions: 'false' }],
    ['a number', { confirmActions: 0 }],
    ['null', { confirmActions: null }],
    ['a missing key', {}],
    ['a store that is not an object', null],
  ])('falls back to asking when the stored value is %s', async (_, stored) => {
    writeStore(JSON.stringify(stored))
    const { power } = await startModule()
    expect(confirmActions(power)).toBe(true)
  })
})

describe('system/power-confirm-set', () => {
  it('returns, saves and broadcasts the new choice', async () => {
    const { power, broadcasts } = await startModule()

    expect(setConfirmActions(power, false)).toBe(false)

    expect(confirmActions(power)).toBe(false)
    expect(readStore()).toEqual({ confirmActions: false, showHibernate: true })
    expect(broadcasts).toEqual([{ channel: 'system/power-confirm-changed', payload: false }])
  })

  it('gives the next session exactly what the last one wrote', async () => {
    const first = await startModule()
    setConfirmActions(first.power, false)
    setConfirmActions(first.power, true)
    setConfirmActions(first.power, false)

    const second = await startModule()

    expect(confirmActions(second.power)).toBe(false)
  })

  it.each([['false'], [0], [1], [null], [undefined], [{ confirmActions: false }]])(
    'refuses %j without saving or broadcasting',
    async (value) => {
      const { power, broadcasts } = await startModule()

      expect(setConfirmActions(power, value)).toBe(true)

      expect(confirmActions(power)).toBe(true)
      expect(fs.existsSync(storeFile())).toBe(false)
      expect(broadcasts).toEqual([])
    }
  )

  it('keeps a saved choice when a later write is refused', async () => {
    writeStore(JSON.stringify({ confirmActions: false }))
    const { power } = await startModule()

    expect(setConfirmActions(power, 'true')).toBe(false)
    expect(readStore()).toEqual({ confirmActions: false })
  })
})

describe('system/power-show-hibernate-set', () => {
  it('shows Hibernate when nothing has been saved', async () => {
    const { power } = await startModule()
    expect(showHibernate(power)).toBe(true)
  })

  it('returns, saves and broadcasts the new choice without touching the confirmation', async () => {
    writeStore(JSON.stringify({ confirmActions: false }))
    const { power, broadcasts } = await startModule()

    expect(setShowHibernate(power, false)).toBe(false)

    expect(readStore()).toEqual({ confirmActions: false, showHibernate: false })
    expect(broadcasts).toEqual([{ channel: 'system/power-show-hibernate-changed', payload: false }])
  })

  it('reads back a choice a previous session saved', async () => {
    writeStore(JSON.stringify({ confirmActions: true, showHibernate: false }))
    const { power } = await startModule()
    expect(showHibernate(power)).toBe(false)
  })

  it.each([['false'], [0], [null], [undefined]])('refuses %j without saving or broadcasting', async (value) => {
    const { power, broadcasts } = await startModule()

    expect(setShowHibernate(power, value)).toBe(true)

    expect(fs.existsSync(storeFile())).toBe(false)
    expect(broadcasts).toEqual([])
  })
})

describe('starting the module', () => {
  it('still tells every window when the machine resumes or unlocks', async () => {
    const { broadcasts } = await startModule()

    expect([...powerMonitorListeners.keys()]).toEqual(['resume', 'unlock-screen'])
    powerMonitorListeners.get('resume')()
    powerMonitorListeners.get('unlock-screen')()

    expect(broadcasts).toEqual([
      { channel: 'system/resume', payload: undefined },
      { channel: 'system/resume', payload: undefined },
    ])
  })
})
