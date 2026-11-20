import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import stagedUpdate from './stagedUpdate.js'

const {
  UPDATE_SWAP_FLAG,
  WAIT_PID_FLAG,
  UPDATE_ROLLBACK_FLAG,
  isSafeVersionName,
  canStageVersion,
  resolveInstallRoot,
  versionDirFor,
  stagingDirFor,
  deduplicateWithHardlinks,
  stageInstaller,
  writePendingSwap,
  readPendingSwap,
  clearPendingSwap,
  takePendingVirtualDesktops,
  parseWaitPidArg,
  isUpdateSwapLaunch,
  waitForProcessExitSync,
  planVersionPruning,
  pruneOldVersions,
  pruneOldV8Caches,
  finalizeSwap,
  rollbackPendingSwap,
} = stagedUpdate

let tempRoot = ''
let installRoot = ''
let userDataDir = ''

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content)
}

function populateVersionDir(dirPath, { exeName = 'Alpine Shell.exe', sharedBlob = null } = {}) {
  writeFile(path.join(dirPath, exeName), 'exe-bytes')
  writeFile(path.join(dirPath, 'resources', 'app.asar'), 'asar-bytes')
  if (sharedBlob) writeFile(path.join(dirPath, 'ffmpeg.dll'), sharedBlob)
}

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'alpine-staged-update-'))
  installRoot = path.join(tempRoot, 'alpine-shell')
  userDataDir = path.join(tempRoot, 'user-data')
  fs.mkdirSync(installRoot, { recursive: true })
  fs.mkdirSync(userDataDir, { recursive: true })
})

afterEach(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true })
})

describe('version names and path resolution', () => {
  it('accepts only clean release versions as folder names', () => {
    expect(isSafeVersionName('1.2.3')).toBe(true)
    expect(isSafeVersionName('1.2.4-nightly.20261120.0')).toBe(true)
    expect(isSafeVersionName('../1.2.3')).toBe(false)
    expect(isSafeVersionName('1.2.3/evil')).toBe(false)
    expect(isSafeVersionName('not-a-version')).toBe(false)
  })

  it('stages only versions newer than the running one', () => {
    expect(canStageVersion('1.2.4', '1.2.3')).toBe(true)
    expect(canStageVersion('1.2.4-nightly.20261120.0', '1.2.3')).toBe(true)
    expect(canStageVersion('1.2.3', '1.2.3')).toBe(false)
    expect(canStageVersion('1.2.2', '1.2.3')).toBe(false)
    expect(canStageVersion('1.0.0', '0.20261101.0')).toBe(true)
  })

  it('resolves the install root for both flat and versioned installs', () => {
    const canonical = path.resolve(path.join(path.sep, 'Programs', 'alpine-shell'))
    const flatExe = path.join(canonical, 'Alpine Shell.exe')
    const versionedExe = path.join(canonical, 'versions', '1.2.3', 'Alpine Shell.exe')

    expect(resolveInstallRoot(flatExe, canonical)).toBe(canonical)
    expect(resolveInstallRoot(versionedExe, canonical)).toBe(canonical)
  })
})

describe('stageInstaller', () => {
  it('extracts into a sibling version directory, deduplicates identical large files and moves into place', async () => {
    const sharedBlob = Buffer.alloc(96 * 1024, 0xab)
    const currentDir = versionDirFor(installRoot, '1.2.3')
    populateVersionDir(currentDir, { sharedBlob })
    const installerPath = path.join(tempRoot, 'Alpine Shell Setup 1.2.4.exe')
    writeFile(installerPath, 'installer')
    const linkCalls = []
    const wrappedFs = Object.create(fs, {
      linkSync: {
        value: (existingPath, newPath) => {
          linkCalls.push([existingPath, newPath])
          fs.copyFileSync(existingPath, newPath)
        },
      },
    })

    const result = await stageInstaller({
      installerPath,
      version: '1.2.4',
      currentVersion: '1.2.3',
      installRoot,
      currentDir,
      exeName: 'Alpine Shell.exe',
      fileSystem: wrappedFs,
      renameRetryDelayMs: 1,
      runExtractor: async (_file, targetDir) => {
        populateVersionDir(targetDir, { sharedBlob })
      },
    })

    expect(result.ok).toBe(true)
    expect(result.reused).toBe(false)
    expect(result.exePath).toBe(path.join(versionDirFor(installRoot, '1.2.4'), 'Alpine Shell.exe'))
    expect(fs.existsSync(stagingDirFor(installRoot, '1.2.4'))).toBe(false)
    expect(linkCalls).toEqual([[path.join(currentDir, 'ffmpeg.dll'), path.join(stagingDirFor(installRoot, '1.2.4'), 'ffmpeg.dll')]])
    expect(fs.readFileSync(path.join(result.versionDir, 'ffmpeg.dll'))).toEqual(sharedBlob)
  })

  it('reuses an already-staged version without extracting again', async () => {
    const targetDir = versionDirFor(installRoot, '1.2.4')
    populateVersionDir(targetDir)
    const installerPath = path.join(tempRoot, 'Alpine Shell Setup 1.2.4.exe')
    writeFile(installerPath, 'installer')
    const runExtractor = vi.fn()

    const result = await stageInstaller({
      installerPath,
      version: '1.2.4',
      currentVersion: '1.2.3',
      installRoot,
      currentDir: versionDirFor(installRoot, '1.2.3'),
      exeName: 'Alpine Shell.exe',
      runExtractor,
    })

    expect(result.ok).toBe(true)
    expect(result.reused).toBe(true)
    expect(runExtractor).not.toHaveBeenCalled()
  })

  it('cleans up the staging folder when extraction fails or leaves an incomplete tree', async () => {
    const installerPath = path.join(tempRoot, 'Alpine Shell Setup 1.2.4.exe')
    writeFile(installerPath, 'installer')

    const incomplete = await stageInstaller({
      installerPath,
      version: '1.2.4',
      currentVersion: '1.2.3',
      installRoot,
      currentDir: installRoot,
      exeName: 'Alpine Shell.exe',
      runExtractor: async (_file, targetDir) => {
        writeFile(path.join(targetDir, 'Alpine Shell.exe'), 'only-exe')
      },
    })

    expect(incomplete).toEqual({ ok: false, reason: 'incomplete-staging' })
    expect(fs.existsSync(stagingDirFor(installRoot, '1.2.4'))).toBe(false)
    expect(fs.existsSync(versionDirFor(installRoot, '1.2.4'))).toBe(false)

    const failed = await stageInstaller({
      installerPath,
      version: '1.2.5',
      currentVersion: '1.2.3',
      installRoot,
      currentDir: installRoot,
      exeName: 'Alpine Shell.exe',
      runExtractor: async () => { throw new Error('disk full') },
    })

    expect(failed).toEqual({ ok: false, reason: 'disk full' })
    expect(fs.existsSync(stagingDirFor(installRoot, '1.2.5'))).toBe(false)
  })

  it('refuses downgrades so older installers without staging support are never invoked', async () => {
    const installerPath = path.join(tempRoot, 'Alpine Shell Setup 1.2.2.exe')
    writeFile(installerPath, 'installer')
    const runExtractor = vi.fn()

    const result = await stageInstaller({
      installerPath,
      version: '1.2.2',
      currentVersion: '1.2.3',
      installRoot,
      currentDir: installRoot,
      exeName: 'Alpine Shell.exe',
      runExtractor,
    })

    expect(result).toEqual({ ok: false, reason: 'version-not-stageable' })
    expect(runExtractor).not.toHaveBeenCalled()
  })
})

describe('deduplicateWithHardlinks', () => {
  it('links identical files above the threshold and leaves changed files distinct', () => {
    const refDir = path.join(tempRoot, 'ref')
    const dstDir = path.join(tempRoot, 'dst')
    const same = Buffer.alloc(128, 1)
    const changedA = Buffer.alloc(128, 2)
    const changedB = Buffer.alloc(128, 3)

    writeFile(path.join(refDir, 'same.bin'), same)
    writeFile(path.join(dstDir, 'same.bin'), same)
    writeFile(path.join(refDir, 'diff.bin'), changedA)
    writeFile(path.join(dstDir, 'diff.bin'), changedB)

    const linkCalls = []
    const wrappedFs = Object.create(fs, {
      linkSync: {
        value: (existingPath, newPath) => {
          linkCalls.push([existingPath, newPath])
          fs.copyFileSync(existingPath, newPath)
        },
      },
    })

    const linked = deduplicateWithHardlinks(refDir, dstDir, { fileSystem: wrappedFs, minBytes: 64 })
    expect(linked).toBe(1)
    expect(linkCalls).toEqual([[path.join(refDir, 'same.bin'), path.join(dstDir, 'same.bin')]])
    expect(fs.readFileSync(path.join(dstDir, 'same.bin'))).toEqual(same)
    expect(fs.readFileSync(path.join(dstDir, 'diff.bin'))).toEqual(changedB)
  })

  it('restores the staged copy when hardlinking is denied by the OS', () => {
    const refDir = path.join(tempRoot, 'ref-eperm')
    const dstDir = path.join(tempRoot, 'dst-eperm')
    const same = Buffer.alloc(128, 7)

    writeFile(path.join(refDir, 'same.bin'), same)
    writeFile(path.join(dstDir, 'same.bin'), same)

    const denyingFs = Object.create(fs, {
      linkSync: {
        value: () => {
          const error = new Error('operation not permitted')
          error.code = 'EPERM'
          throw error
        },
      },
    })

    const linked = deduplicateWithHardlinks(refDir, dstDir, { fileSystem: denyingFs, minBytes: 64 })
    expect(linked).toBe(0)
    expect(fs.readFileSync(path.join(dstDir, 'same.bin'))).toEqual(same)
    expect(fs.existsSync(path.join(dstDir, 'same.bin.relink'))).toBe(false)
  })
})

describe('pending swap record and arguments', () => {
  it('persists, reads, expires and clears pending swap state', () => {
    const desktops = { current: 1, stashed: [[{ hwnd: 10, processId: 20 }], []] }
    expect(writePendingSwap(userDataDir, { fromVersion: '1.0.0', toVersion: '1.0.1', virtualDesktops: desktops, startedAt: 1000 })).toBe(true)

    expect(readPendingSwap(userDataDir, { now: () => 2000 })).toMatchObject({ fromVersion: '1.0.0', toVersion: '1.0.1' })
    expect(takePendingVirtualDesktops(userDataDir, { now: () => 2000 })).toEqual(desktops)
    expect(readPendingSwap(userDataDir, { now: () => 10 * 60 * 1000 })).toBeNull()

    clearPendingSwap(userDataDir)
    expect(readPendingSwap(userDataDir, { now: () => 2000 })).toBeNull()
  })

  it('parses swap flags and waits until the previous process exits', () => {
    expect(isUpdateSwapLaunch(['Alpine Shell.exe', UPDATE_SWAP_FLAG, WAIT_PID_FLAG, '9876'])).toBe(true)
    expect(parseWaitPidArg(['Alpine Shell.exe', UPDATE_SWAP_FLAG, WAIT_PID_FLAG, '9876'])).toBe(9876)
    expect(parseWaitPidArg(['Alpine Shell.exe', WAIT_PID_FLAG, 'bad'])).toBeNull()

    let polls = 0
    const waited = waitForProcessExitSync(9876, 1000, {
      isAlive: () => {
        polls += 1
        return polls < 3
      },
      sleep: () => {},
      now: () => polls * 25,
    })
    expect(waited).toBe(true)
    expect(polls).toBe(3)
  })
})

describe('pruning, finalization and rollback', () => {
  it('keeps the current and previous versions while pruning older versions and staging leftovers', () => {
    expect(planVersionPruning({
      entries: ['1.0.0', '1.0.1', '1.0.2', '1.0.3.staging', 'unrelated'],
      currentVersion: '1.0.2',
      previousVersion: '1.0.1',
    })).toEqual(['1.0.0', '1.0.3.staging'])

    populateVersionDir(versionDirFor(installRoot, '1.0.0'))
    populateVersionDir(versionDirFor(installRoot, '1.0.1'))
    populateVersionDir(versionDirFor(installRoot, '1.0.2'))
    writeFile(path.join(stagingDirFor(installRoot, '1.0.3'), 'partial'), 'x')

    const exec = vi.fn()
    const removed = pruneOldVersions(installRoot, { currentVersion: '1.0.2', previousVersion: '1.0.1', exec })

    expect(removed).toEqual(['1.0.0', '1.0.3.staging'])
    expect(fs.existsSync(versionDirFor(installRoot, '1.0.0'))).toBe(false)
    expect(fs.existsSync(versionDirFor(installRoot, '1.0.1'))).toBe(true)
    expect(fs.existsSync(versionDirFor(installRoot, '1.0.2'))).toBe(true)
    expect(exec).toHaveBeenCalledTimes(1)
  })

  it('prunes old per-version v8 caches and finalizes a completed swap', () => {
    const oldExe = path.join(versionDirFor(installRoot, '1.0.1'), 'Alpine Shell.exe')
    const newExe = path.join(versionDirFor(installRoot, '1.0.2'), 'Alpine Shell.exe')
    populateVersionDir(versionDirFor(installRoot, '1.0.0'))
    populateVersionDir(versionDirFor(installRoot, '1.0.1'))
    populateVersionDir(versionDirFor(installRoot, '1.0.2'))
    writeFile(path.join(userDataDir, 'v8-cache', '1.0.1', 'cache.bin'), 'old')
    writeFile(path.join(userDataDir, 'v8-cache', '1.0.2', 'cache.bin'), 'new')
    writePendingSwap(userDataDir, {
      fromVersion: '1.0.1',
      fromExe: oldExe,
      toVersion: '1.0.2',
      toExe: newExe,
      reopenSettingsPage: 'updates',
    })

    const refreshShortcut = vi.fn()
    const exec = vi.fn(() => '')
    const result = finalizeSwap({
      userDataDir,
      installRoot,
      currentVersion: '1.0.2',
      currentExePath: newExe,
      exec,
      query: () => null,
      refreshShortcut,
    })

    expect(result).toEqual({
      completedSwap: true,
      fromVersion: '1.0.1',
      toVersion: '1.0.2',
      reopenSettingsPage: 'updates',
    })
    expect(refreshShortcut).toHaveBeenCalledWith(newExe)
    expect(readPendingSwap(userDataDir)).toBeNull()
    expect(fs.existsSync(versionDirFor(installRoot, '1.0.0'))).toBe(false)
    expect(fs.existsSync(versionDirFor(installRoot, '1.0.1'))).toBe(true)
    expect(fs.existsSync(path.join(userDataDir, 'v8-cache', '1.0.1'))).toBe(false)
    expect(fs.existsSync(path.join(userDataDir, 'v8-cache', '1.0.2'))).toBe(true)
  })

  it('rolls back Winlogon shell and relaunches the previous version when a swapped build fails', () => {
    const oldExe = path.join(versionDirFor(installRoot, '1.0.1'), 'Alpine Shell.exe')
    const newExe = path.join(versionDirFor(installRoot, '1.0.2'), 'Alpine Shell.exe')
    populateVersionDir(versionDirFor(installRoot, '1.0.1'))
    populateVersionDir(versionDirFor(installRoot, '1.0.2'))
    writePendingSwap(userDataDir, {
      fromVersion: '1.0.1',
      fromExe: oldExe,
      toVersion: '1.0.2',
      toExe: newExe,
      handShellBack: true,
      previousShell: oldExe,
    })

    const regWrites = []
    const exec = vi.fn((_cmd, args) => { regWrites.push(args) })
    const spawnProcess = vi.fn(() => ({ pid: 7777, unref: () => {} }))

    const rolledBack = rollbackPendingSwap({
      userDataDir,
      currentExePath: newExe,
      exec,
      spawnProcess,
    })

    expect(rolledBack).toBe(true)
    expect(readPendingSwap(userDataDir)).toBeNull()
    expect(regWrites.some((args) => args.includes('Shell') && args.includes(oldExe))).toBe(true)
    expect(spawnProcess).toHaveBeenCalledWith(oldExe, [UPDATE_ROLLBACK_FLAG], expect.objectContaining({ detached: true }))
  })
})
