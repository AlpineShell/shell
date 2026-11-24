import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { createRequire } from 'module'

const nodeRequire = createRequire(import.meta.url)
const childProcess = nodeRequire('child_process')

const CURSOR_KEY = 'HKCU\\Control Panel\\Cursors'
const DEFAULT_VALUE_LABEL = '(Default)'

const cursorValues = new Map()
const refusedCursorWrites = new Set()

function inject(moduleId, exports) {
  nodeRequire.cache[moduleId] = { id: moduleId, filename: moduleId, loaded: true, exports }
}

inject(nodeRequire.resolve('./registryRead.js'), {
  regListValues: (keyPath) => keyPath === CURSOR_KEY
    ? [...cursorValues].map(([name, data]) => ({ name: name === '' ? DEFAULT_VALUE_LABEL : name, data }))
    : [],
})

childProcess.execFileSync = (file, args) => {
  if (file !== 'reg' || args[0] !== 'add' || args[1] !== CURSOR_KEY) return ''
  if (refusedCursorWrites.has(args[3])) throw new Error('Access is denied.')
  cursorValues.set(args[3], args[7])
  return ''
}
childProcess.execSync = () => ''

const cursorScheme = nodeRequire('./cursorScheme.js')

let tempDir = ''
let userDataDir = ''
let localAppData = ''
let bundledCursorDir = ''

const systemArrow = path.resolve(path.join(path.sep, 'Windows', 'Cursors', 'aero_arrow.cur'))

function writeCursorFiles(directory, files) {
  fs.mkdirSync(directory, { recursive: true })
  for (const file of files) fs.writeFileSync(path.join(directory, file), file)
}

function legacyInstall(roles) {
  const legacyDir = cursorScheme.legacyCursorDir(userDataDir)
  writeCursorFiles(legacyDir, ['Pointer.cur', 'Link.cur', 'Busy.ani'])
  for (const [role, file] of Object.entries(roles)) cursorValues.set(role, path.join(legacyDir, file))
  cursorValues.set('', cursorScheme.CURSOR_SCHEME_NAME)
  return legacyDir
}

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alpine-cursor-scheme-'))
  userDataDir = path.join(tempDir, 'Roaming', 'alpine-shell')
  localAppData = path.join(tempDir, 'Local')
  bundledCursorDir = path.join(tempDir, 'resources', 'cursor', 'Bibata-Modern-Ice')
  cursorValues.clear()
  refusedCursorWrites.clear()
})

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true })
})

describe('cursorInstallDir', () => {
  it('sits in the per-user Windows cursor folder that exam browsers trust', () => {
    const expectedPrefix = path.join(localAppData, 'Microsoft', 'Windows', 'Cursors') + path.sep
    expect(cursorScheme.cursorInstallDir(localAppData).startsWith(expectedPrefix)).toBe(true)
  })
})

describe('planCursorRelocation', () => {
  const legacyDir = path.resolve(path.join(path.sep, 'Users', 'someone', 'AppData', 'Roaming', 'alpine-shell', 'cursors'))
  const installDir = path.resolve(path.join(path.sep, 'Users', 'someone', 'AppData', 'Local', 'Microsoft', 'Windows', 'Cursors', 'Alpine Shell'))

  it('points every cursor in the old folder at the same file in the new one', () => {
    const plan = cursorScheme.planCursorRelocation([
      { name: 'Arrow', data: path.join(legacyDir, 'Pointer.cur') },
      { name: 'Wait', data: path.join(legacyDir, 'Busy.ani') },
    ], legacyDir, installDir)

    expect(plan).toEqual([
      { name: 'Arrow', data: path.join(installDir, 'Pointer.cur') },
      { name: 'Wait', data: path.join(installDir, 'Busy.ani') },
    ])
  })

  it('matches the old folder whatever its letter case', () => {
    const plan = cursorScheme.planCursorRelocation([
      { name: 'Arrow', data: path.join(legacyDir.toUpperCase(), 'Pointer.cur') },
    ], legacyDir, installDir)

    expect(plan).toEqual([{ name: 'Arrow', data: path.join(installDir, 'Pointer.cur') }])
  })

  it('leaves Windows cursors, empty values, the scheme name and look-alike folders alone', () => {
    const plan = cursorScheme.planCursorRelocation([
      { name: 'Arrow', data: systemArrow },
      { name: 'Help', data: '' },
      { name: DEFAULT_VALUE_LABEL, data: 'Alpine Shell' },
      { name: 'Hand', data: path.join(`${legacyDir}-old`, 'Link.cur') },
      { name: 'IBeam', data: legacyDir },
    ], legacyDir, installDir)

    expect(plan).toEqual([])
  })
})

describe('installCursorScheme', () => {
  it('copies the cursors into the Windows cursor folder and points the scheme there', () => {
    writeCursorFiles(bundledCursorDir, ['Pointer.cur', 'Link.cur'])

    cursorScheme.installCursorScheme({ sourceDir: bundledCursorDir, localAppData })

    const installDir = cursorScheme.cursorInstallDir(localAppData)
    expect(fs.existsSync(path.join(installDir, 'Pointer.cur'))).toBe(true)
    expect(cursorValues.get('Arrow')).toBe(path.join(installDir, 'Pointer.cur'))
    expect(cursorValues.get('Hand')).toBe(path.join(installDir, 'Link.cur'))
    expect(cursorValues.has('Wait')).toBe(false)
    expect(cursorValues.get('')).toBe(cursorScheme.CURSOR_SCHEME_NAME)
  })
})

describe('relocateLegacyCursorScheme', () => {
  it('moves an install from the app data folder to the Windows cursor folder', () => {
    const legacyDir = legacyInstall({ Arrow: 'Pointer.cur', Hand: 'Link.cur', Wait: 'Busy.ani' })

    expect(cursorScheme.relocateLegacyCursorScheme({ userDataDir, localAppData })).toBe(true)

    const installDir = cursorScheme.cursorInstallDir(localAppData)
    expect(cursorValues.get('Arrow')).toBe(path.join(installDir, 'Pointer.cur'))
    expect(cursorValues.get('Hand')).toBe(path.join(installDir, 'Link.cur'))
    expect(cursorValues.get('Wait')).toBe(path.join(installDir, 'Busy.ani'))
    expect(fs.existsSync(path.join(installDir, 'Busy.ani'))).toBe(true)
    expect(fs.existsSync(legacyDir)).toBe(false)
  })

  it('clears out an old folder the scheme no longer uses without touching the registry', () => {
    const legacyDir = cursorScheme.legacyCursorDir(userDataDir)
    writeCursorFiles(legacyDir, ['Pointer.cur'])
    cursorValues.set('Arrow', systemArrow)

    expect(cursorScheme.relocateLegacyCursorScheme({ userDataDir, localAppData })).toBe(false)

    expect(cursorValues.get('Arrow')).toBe(systemArrow)
    expect(fs.existsSync(legacyDir)).toBe(false)
    expect(fs.existsSync(cursorScheme.cursorInstallDir(localAppData))).toBe(false)
  })

  it('keeps the old folder while a cursor could not be moved', () => {
    const legacyDir = legacyInstall({ Arrow: 'Pointer.cur', Hand: 'Link.cur' })
    refusedCursorWrites.add('Hand')

    expect(() => cursorScheme.relocateLegacyCursorScheme({ userDataDir, localAppData })).toThrow('Access is denied.')

    expect(cursorValues.get('Hand')).toBe(path.join(legacyDir, 'Link.cur'))
    expect(fs.existsSync(path.join(legacyDir, 'Link.cur'))).toBe(true)
  })

  it('does nothing once the old folder is gone', () => {
    cursorValues.set('Arrow', systemArrow)

    expect(cursorScheme.relocateLegacyCursorScheme({ userDataDir, localAppData })).toBe(false)
    expect(cursorValues.get('Arrow')).toBe(systemArrow)
  })

  it('does nothing without a local app data folder', () => {
    const legacyDir = legacyInstall({ Arrow: 'Pointer.cur' })

    expect(cursorScheme.relocateLegacyCursorScheme({ userDataDir, localAppData: undefined })).toBe(false)
    expect(cursorValues.get('Arrow')).toBe(path.join(legacyDir, 'Pointer.cur'))
  })
})

describe('removeCursorFiles', () => {
  it('removes the cursors from both the old and the new folder', () => {
    const legacyDir = cursorScheme.legacyCursorDir(userDataDir)
    const installDir = cursorScheme.cursorInstallDir(localAppData)
    writeCursorFiles(legacyDir, ['Pointer.cur'])
    writeCursorFiles(installDir, ['Pointer.cur'])

    cursorScheme.removeCursorFiles({ userDataDir, localAppData })

    expect(fs.existsSync(legacyDir)).toBe(false)
    expect(fs.existsSync(installDir)).toBe(false)
  })
})
