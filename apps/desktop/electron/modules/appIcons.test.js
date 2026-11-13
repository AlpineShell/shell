import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { createRequire } from 'module'

const nodeRequire = createRequire(import.meta.url)
const electronModuleId = nodeRequire.resolve('electron')
const appIconsModuleId = nodeRequire.resolve('./appIcons.js')
const childProcess = nodeRequire('child_process')
const realExec = childProcess.exec

let userDataDir = ''
let loadedAppIcons = null

nodeRequire.cache[electronModuleId] = {
  id: electronModuleId,
  filename: electronModuleId,
  loaded: true,
  exports: {
    app: { getPath: () => userDataDir, on: () => {} },
    shell: {},
    nativeImage: {},
  },
}

const GENERIC_ICON_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

function answerPowerShellWith(stdout) {
  const pending = []
  const exec = vi.fn((_command, _options, callback) => {
    pending.push(() => callback(null, { stdout, stderr: '' }))
  })
  childProcess.exec = (...args) => exec(...args)
  const settle = () => { while (pending.length) pending.shift()() }
  return { exec, settle }
}

function loadAppIcons() {
  delete nodeRequire.cache[appIconsModuleId]
  loadedAppIcons = nodeRequire(appIconsModuleId)
  return loadedAppIcons
}

async function flushMicrotasks() {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

describe('ensureGenericIcon', () => {
  beforeEach(() => {
    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alpine-app-icons-'))
  })

  afterEach(() => {
    childProcess.exec = realExec
    if (loadedAppIcons) loadedAppIcons.flushDiskCache()
    loadedAppIcons = null
    fs.rmSync(userDataDir, { recursive: true, force: true })
  })

  it('shares one PowerShell lookup between callers that ask while it runs', async () => {
    const powerShell = answerPowerShellWith(GENERIC_ICON_BASE64)
    const appIcons = loadAppIcons()
    const first = appIcons.ensureGenericIcon()
    const second = appIcons.ensureGenericIcon()
    await flushMicrotasks()
    powerShell.settle()
    const expected = `data:image/png;base64,${GENERIC_ICON_BASE64}`
    await expect(first).resolves.toBe(expected)
    await expect(second).resolves.toBe(expected)
    expect(powerShell.exec).toHaveBeenCalledTimes(1)
    expect(appIcons.getGenericIcon()).toBe(expected)
  })

  it('remembers a lookup that found no icon instead of starting PowerShell again', async () => {
    const powerShell = answerPowerShellWith('')
    const appIcons = loadAppIcons()
    const first = appIcons.ensureGenericIcon()
    await flushMicrotasks()
    powerShell.settle()
    await expect(first).resolves.toBeNull()
    await expect(appIcons.ensureGenericIcon()).resolves.toBeNull()
    await expect(appIcons.ensureGenericIcon()).resolves.toBeNull()
    expect(powerShell.exec).toHaveBeenCalledTimes(1)
    expect(appIcons.getGenericIcon()).toBeNull()
  })
})
