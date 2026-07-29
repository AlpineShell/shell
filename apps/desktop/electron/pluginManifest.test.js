import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { parseManifest } from './pluginManifest.js'

let dir

function write(manifest) {
  fs.writeFileSync(path.join(dir, 'plugin.json'), JSON.stringify(manifest))
  return parseManifest(dir, path.basename(dir), { appVersion: '1.0.0' }).record
}

function baseManifest(contributes) {
  return { id: path.basename(dir), name: 'Android', version: '1.0.0', contributes }
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'com.alpine.test-'))
  fs.writeFileSync(path.join(dir, 'index.js'), 'export default () => null')
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('contributes.fileHandlers', () => {
  it('keeps a handler and normalises its extensions', () => {
    const record = write(baseManifest({ fileHandlers: [{ extensions: ['.APK', '.xapk', '.apk'], command: 'install', name: 'Android app' }] }))
    expect(record.errors).toEqual([])
    expect(record.contributes.fileHandlers).toHaveLength(1)
    expect(record.contributes.fileHandlers[0].extensions).toEqual(['.apk', '.xapk'])
    expect(record.contributes.fileHandlers[0].command).toBe('install')
    expect(record.contributes.fileHandlers[0].name).toBe('Android app')
  })

  it('rejects extensions without a leading dot', () => {
    const record = write(baseManifest({ fileHandlers: [{ extensions: ['apk'], command: 'install' }] }))
    expect(record.valid).toBe(false)
    expect(record.contributes.fileHandlers).toBeUndefined()
  })

  it('rejects a handler without a command', () => {
    const record = write(baseManifest({ fileHandlers: [{ extensions: ['.apk'] }] }))
    expect(record.valid).toBe(false)
    expect(record.contributes.fileHandlers).toBeUndefined()
  })

  it('defaults the type name to null', () => {
    const record = write(baseManifest({ fileHandlers: [{ extensions: ['.apk'], command: 'install' }] }))
    expect(record.contributes.fileHandlers[0].name).toBeNull()
  })
})

describe('contributes.launcherFolders', () => {
  it('keeps a plain folder name', () => {
    const record = write(baseManifest({ launcherFolders: [{ startMenuFolder: ' Android apps ' }] }))
    expect(record.errors).toEqual([])
    expect(record.contributes.launcherFolders[0].startMenuFolder).toBe('Android apps')
  })

  it('defaults the badge to null', () => {
    const record = write(baseManifest({ launcherFolders: [{ startMenuFolder: 'Android apps' }] }))
    expect(record.contributes.launcherFolders[0].badge).toBeNull()
  })

  it('keeps a badge that exists inside the plugin folder', () => {
    fs.mkdirSync(path.join(dir, 'assets'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'assets', 'badge.png'), 'x')
    const record = write(baseManifest({ launcherFolders: [{ startMenuFolder: 'Android apps', badge: 'assets/badge.png' }] }))
    expect(record.errors).toEqual([])
    expect(record.contributes.launcherFolders[0].badge).toBe('assets/badge.png')
  })

  it('rejects a badge that escapes the plugin folder', () => {
    const record = write(baseManifest({ launcherFolders: [{ startMenuFolder: 'Android apps', badge: '../../evil.png' }] }))
    expect(record.valid).toBe(false)
    expect(record.contributes.launcherFolders).toBeUndefined()
  })

  it('rejects a badge that does not exist', () => {
    const record = write(baseManifest({ launcherFolders: [{ startMenuFolder: 'Android apps', badge: 'assets/missing.png' }] }))
    expect(record.valid).toBe(false)
  })

  it('defaults the uninstall command to null', () => {
    const record = write(baseManifest({ launcherFolders: [{ startMenuFolder: 'Android apps' }] }))
    expect(record.contributes.launcherFolders[0].uninstallCommand).toBeNull()
  })

  it('keeps an uninstall command', () => {
    const record = write(baseManifest({ launcherFolders: [{ startMenuFolder: 'Android apps', uninstallCommand: 'uninstall' }] }))
    expect(record.errors).toEqual([])
    expect(record.contributes.launcherFolders[0].uninstallCommand).toBe('uninstall')
  })

  it('rejects an empty uninstall command', () => {
    const record = write(baseManifest({ launcherFolders: [{ startMenuFolder: 'Android apps', uninstallCommand: '' }] }))
    expect(record.valid).toBe(false)
  })

  it('rejects a path instead of a folder name', () => {
    const record = write(baseManifest({ launcherFolders: [{ startMenuFolder: '..\\Startup' }] }))
    expect(record.valid).toBe(false)
    expect(record.contributes.launcherFolders).toBeUndefined()
  })
})
