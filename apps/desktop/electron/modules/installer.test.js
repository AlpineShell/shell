import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { createRequire } from 'module'

const nodeRequire = createRequire(import.meta.url)
const childProcess = nodeRequire('child_process')

const WINLOGON_KEY = 'HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon'
const XAML_KEY = 'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced'
const ALPINE_SHELL_VALUE = path.join('C:', 'Programs', 'alpine-shell', 'Alpine Shell.exe')

const registry = new Map()
let registryWritesPersist = true
let explorerHosting = false
let userDataDir = ''
const regCalls = []
const spawnCalls = []

function registryKey(keyPath, valueName) {
  return `${keyPath}\\${valueName}`
}

function inject(moduleId, exports) {
  nodeRequire.cache[moduleId] = { id: moduleId, filename: moduleId, loaded: true, exports }
}

inject(nodeRequire.resolve('electron'), {
  app: { getPath: () => userDataDir, isPackaged: false, getVersion: () => '1.0.0' },
  shell: {},
})
inject(nodeRequire.resolve('./explorerShell.js'), { shellHostedByExplorer: () => explorerHosting })
inject(nodeRequire.resolve('../registryRead.js'), { regQuery: (keyPath, valueName) => registry.get(registryKey(keyPath, valueName)) ?? null })

childProcess.execFileSync = (file, args) => {
  regCalls.push([file, ...args])
  if (file !== 'reg') return ''
  if (args[0] === 'add' && registryWritesPersist) registry.set(registryKey(args[1], args[3]), args[7])
  if (args[0] === 'delete') registry.delete(registryKey(args[1], args[3]))
  return ''
}
childProcess.execSync = () => ''
childProcess.spawn = (file, args, options) => {
  spawnCalls.push({ file, args, options })
  return { pid: 4242, unref: () => undefined, on: () => undefined }
}

const { default: installer } = await import('./installer.js')

const shellWrites = () => regCalls.filter((call) => call[1] === 'add' && call[2] === WINLOGON_KEY && call[4] === 'Shell')
const callsTouching = (fragment) => regCalls.filter((call) => call.some((part) => typeof part === 'string' && part.includes(fragment)))

beforeEach(() => {
  registry.clear()
  regCalls.length = 0
  spawnCalls.length = 0
  registryWritesPersist = true
  explorerHosting = false
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alpine-installer-'))
})

afterEach(() => {
  fs.rmSync(userDataDir, { recursive: true, force: true })
})

describe('handBackForLicence', () => {
  it('writes Shell=explorer.exe and starts Explorer when Alpine is the shell and Explorer is not hosting', () => {
    registry.set(registryKey(WINLOGON_KEY, 'Shell'), ALPINE_SHELL_VALUE)
    registry.set(registryKey(XAML_KEY, 'EnableXamlStartMenu'), '0')

    expect(installer.handBackForLicence()).toEqual({ success: true, error: null })

    expect(shellWrites()).toHaveLength(1)
    expect(registry.get(registryKey(WINLOGON_KEY, 'Shell'))).toBe('explorer.exe')
    expect(registry.has(registryKey(XAML_KEY, 'EnableXamlStartMenu'))).toBe(false)
    expect(spawnCalls).toHaveLength(1)
    expect(path.basename(spawnCalls[0].file).toLowerCase()).toBe('explorer.exe')
    expect(spawnCalls[0].options).toMatchObject({ detached: true })
  })

  it('leaves the registration alone and starts nothing when Explorer already hosts the shell', () => {
    registry.set(registryKey(WINLOGON_KEY, 'Shell'), 'explorer.exe')
    explorerHosting = true

    expect(installer.handBackForLicence()).toEqual({ success: true, error: null })

    expect(shellWrites()).toHaveLength(0)
    expect(spawnCalls).toHaveLength(0)
  })

  it('starts Explorer when it is registered but not running', () => {
    registry.set(registryKey(WINLOGON_KEY, 'Shell'), 'explorer.exe')
    explorerHosting = false

    expect(installer.handBackForLicence().success).toBe(true)
    expect(spawnCalls).toHaveLength(1)
  })

  it('reports failure and does not start Explorer when the Shell value does not persist', () => {
    registry.set(registryKey(WINLOGON_KEY, 'Shell'), ALPINE_SHELL_VALUE)
    registryWritesPersist = false

    const result = installer.handBackForLicence()

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/Could not hand the Windows shell back/)
    expect(spawnCalls).toHaveLength(0)
  })

  it('starts Explorer after handing back even when the notification area cannot be inspected', () => {
    registry.set(registryKey(WINLOGON_KEY, 'Shell'), ALPINE_SHELL_VALUE)
    explorerHosting = null

    expect(installer.handBackForLicence().success).toBe(true)
    expect(spawnCalls).toHaveLength(1)
  })

  it('does not guess when Explorer was already registered and the probe is inconclusive', () => {
    registry.set(registryKey(WINLOGON_KEY, 'Shell'), 'explorer.exe')
    explorerHosting = null

    expect(installer.handBackForLicence().success).toBe(true)
    expect(spawnCalls).toHaveLength(0)
  })

  it('never touches the opt-out marker, the cursors, the Run entry or the hand-back helper', () => {
    registry.set(registryKey(WINLOGON_KEY, 'Shell'), ALPINE_SHELL_VALUE)
    registry.set(registryKey('HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run', 'AlpineShell'), `"${ALPINE_SHELL_VALUE}"`)
    fs.mkdirSync(path.join(userDataDir, 'cursors'))

    installer.handBackForLicence()

    expect(fs.existsSync(path.join(userDataDir, '.shell-opt-out'))).toBe(false)
    expect(fs.existsSync(path.join(userDataDir, 'cursors'))).toBe(true)
    expect(callsTouching('Control Panel\\Cursors')).toHaveLength(0)
    expect(callsTouching('CurrentVersion\\Run')).toHaveLength(0)
    expect(registry.has(registryKey('HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run', 'AlpineShell'))).toBe(true)
    expect(spawnCalls.filter((call) => /powershell/i.test(call.file))).toHaveLength(0)
    expect(fs.readdirSync(userDataDir)).toEqual(['cursors'])
  })
})
