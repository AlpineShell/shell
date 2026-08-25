import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { createRequire } from 'module'

const nodeRequire = createRequire(import.meta.url)
const electronModuleId = nodeRequire.resolve('electron')
const syncListeners = new Map()

let userDataDir = ''

nodeRequire.cache[electronModuleId] = {
  id: electronModuleId,
  filename: electronModuleId,
  loaded: true,
  exports: {
    app: { getPath: () => userDataDir },
    ipcMain: { on: (channel, listener) => syncListeners.set(channel, listener) },
  },
}

const EMPTY_LAYOUT = { slots: { left: [], center: [], right: [] }, hidden: [] }

const SAVED_LAYOUT = {
  slots: {
    left: ['system-menu', 'plugins-left', 'notice'],
    center: ['launcher'],
    right: ['tray', 'media', 'microphone', 'status', 'plugins-right', 'clock'],
  },
  hidden: ['media'],
}

const storeFile = () => path.join(userDataDir, 'topbar-layout.json')
const writeStore = (contents) => fs.writeFileSync(storeFile(), contents)
const readStore = () => JSON.parse(fs.readFileSync(storeFile(), 'utf8'))

async function startModule() {
  vi.resetModules()
  const { default: topbarLayout } = await import('./topbarLayout.js')
  const broadcasts = []
  topbarLayout.start((channel, payload) => broadcasts.push({ channel, payload }))
  return { topbarLayout, broadcasts }
}

const getLayout = (topbarLayout) => topbarLayout.handlers['topbar/layout-get']()
const setLayout = (topbarLayout, patch) => topbarLayout.handlers['topbar/layout-set'](null, patch)

beforeEach(() => {
  syncListeners.clear()
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alpine-topbar-layout-'))
})

afterEach(() => {
  fs.rmSync(userDataDir, { recursive: true, force: true })
})

describe('reading the store', () => {
  it('starts from the empty layout when nothing has been saved', async () => {
    const { topbarLayout } = await startModule()
    expect(getLayout(topbarLayout)).toEqual(EMPTY_LAYOUT)
  })

  it('reads back what a previous session saved', async () => {
    writeStore(JSON.stringify(SAVED_LAYOUT))
    const { topbarLayout } = await startModule()
    expect(getLayout(topbarLayout)).toEqual(SAVED_LAYOUT)
  })

  it('falls back to the empty layout when the store is corrupt', async () => {
    writeStore('{ slots: not json')
    const { topbarLayout } = await startModule()
    expect(getLayout(topbarLayout)).toEqual(EMPTY_LAYOUT)
  })

  it('fills in the slots a saved layout leaves out', async () => {
    writeStore(JSON.stringify({ slots: { left: ['notice'] } }))
    const { topbarLayout } = await startModule()
    expect(getLayout(topbarLayout)).toEqual({ slots: { left: ['notice'], center: [], right: [] }, hidden: [] })
  })

  it('drops stored entries that are not strings', async () => {
    writeStore(JSON.stringify({ slots: { left: [1, 'notice', null, 'clock'], center: 'nope' }, hidden: ['media', 2] }))
    const { topbarLayout } = await startModule()
    expect(getLayout(topbarLayout)).toEqual({
      slots: { left: ['notice', 'clock'], center: [], right: [] },
      hidden: ['media'],
    })
  })

  it('keeps unknown and duplicated ids, because the catalogue lives in the renderer', async () => {
    writeStore(JSON.stringify({ slots: { right: ['weather', 'clock', 'clock'] }, hidden: ['weather'] }))
    const { topbarLayout } = await startModule()
    expect(getLayout(topbarLayout).slots.right).toEqual(['weather', 'clock', 'clock'])
    expect(getLayout(topbarLayout).hidden).toEqual(['weather'])
  })
})

describe('partial writes', () => {
  it('leaves the slots a write does not mention untouched', async () => {
    writeStore(JSON.stringify(SAVED_LAYOUT))
    const { topbarLayout } = await startModule()

    const next = setLayout(topbarLayout, { slots: { right: ['clock', 'tray'] } })

    expect(next.slots.left).toEqual(SAVED_LAYOUT.slots.left)
    expect(next.slots.center).toEqual(SAVED_LAYOUT.slots.center)
    expect(next.slots.right).toEqual(['clock', 'tray'])
    expect(readStore()).toEqual(next)
  })

  it('leaves every slot alone when the write only carries the hidden list', async () => {
    writeStore(JSON.stringify(SAVED_LAYOUT))
    const { topbarLayout } = await startModule()

    const next = setLayout(topbarLayout, { hidden: ['clock'] })

    expect(next.slots).toEqual(SAVED_LAYOUT.slots)
    expect(next.hidden).toEqual(['clock'])
  })

  it('leaves the hidden list alone when the write only carries slots', async () => {
    writeStore(JSON.stringify(SAVED_LAYOUT))
    const { topbarLayout } = await startModule()

    expect(setLayout(topbarLayout, { slots: { center: [] } }).hidden).toEqual(SAVED_LAYOUT.hidden)
  })

  it('ignores a slot whose value is not an array', async () => {
    writeStore(JSON.stringify(SAVED_LAYOUT))
    const { topbarLayout } = await startModule()

    expect(setLayout(topbarLayout, { slots: { left: 'nope' } }).slots).toEqual(SAVED_LAYOUT.slots)
  })

  it('ignores a hidden list that is not an array', async () => {
    writeStore(JSON.stringify(SAVED_LAYOUT))
    const { topbarLayout } = await startModule()

    expect(setLayout(topbarLayout, { hidden: 'none' }).hidden).toEqual(SAVED_LAYOUT.hidden)
  })

  it('ignores a write that is not an object at all', async () => {
    writeStore(JSON.stringify(SAVED_LAYOUT))
    const { topbarLayout } = await startModule()

    expect(setLayout(topbarLayout, null)).toEqual(SAVED_LAYOUT)
    expect(setLayout(topbarLayout, 'clock')).toEqual(SAVED_LAYOUT)
  })
})

describe('the round trip through topbar/layout-set', () => {
  it('returns, saves and broadcasts the same merged layout', async () => {
    const { topbarLayout, broadcasts } = await startModule()

    const next = setLayout(topbarLayout, { slots: { right: ['clock'] }, hidden: ['notice'] })

    expect(next).toEqual({ slots: { left: [], center: [], right: ['clock'] }, hidden: ['notice'] })
    expect(readStore()).toEqual(next)
    expect(broadcasts).toEqual([{ channel: 'topbar/layout-changed', payload: next }])
  })

  it('gives the next session exactly what the last one wrote', async () => {
    const first = await startModule()
    setLayout(first.topbarLayout, { slots: { left: ['notice', 'system-menu'] } })
    setLayout(first.topbarLayout, { hidden: ['clock', 'media'] })

    const second = await startModule()

    expect(getLayout(second.topbarLayout)).toEqual({
      slots: { left: ['notice', 'system-menu'], center: [], right: [] },
      hidden: ['clock', 'media'],
    })
  })

  it('clears the hidden list when an empty one is written', async () => {
    writeStore(JSON.stringify(SAVED_LAYOUT))
    const first = await startModule()
    setLayout(first.topbarLayout, { hidden: [] })

    const second = await startModule()

    expect(getLayout(second.topbarLayout)).toEqual({ slots: SAVED_LAYOUT.slots, hidden: [] })
  })

  it('answers the synchronous boot read with the current layout', async () => {
    const { topbarLayout } = await startModule()
    const next = setLayout(topbarLayout, { hidden: ['clock'] })

    const event = {}
    syncListeners.get('topbar/layout-init')(event)

    expect(event.returnValue).toEqual(next)
  })
})
