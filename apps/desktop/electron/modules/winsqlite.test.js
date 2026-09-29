import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import winsqlite from './winsqlite.js'

const { snapshotDirectory, newSnapshotPath, snapshotOwnerPid, removeSnapshotsOf, removeAllSnapshots, removeLegacySnapshots } = winsqlite

const WORKER_PID = 4242
const MAIN_PID = 1717

let tempRoot = ''

function writeFiles(directory, names) {
  fs.mkdirSync(directory, { recursive: true })
  for (const name of names) fs.writeFileSync(path.join(directory, name), 'history')
}

function listFiles(directory) {
  return fs.readdirSync(directory).sort()
}

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'alpine-winsqlite-test-'))
})

afterEach(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true })
})

describe('snapshot location', () => {
  it('keeps every snapshot in its own folder under the temp directory', () => {
    expect(snapshotDirectory()).toBe(path.join(os.tmpdir(), 'alpine-sqlite'))
    expect(path.dirname(newSnapshotPath())).toBe(snapshotDirectory())
  })

  it('names each snapshot after the process that made it', () => {
    expect(snapshotOwnerPid(path.basename(newSnapshotPath()))).toBe(process.pid)
    expect(snapshotOwnerPid('notes.txt')).toBeNull()
  })
})

describe('removeSnapshotsOf', () => {
  it('removes the database, journal and shared-memory copies a stopped worker left behind', () => {
    const directory = path.join(tempRoot, 'alpine-sqlite')
    writeFiles(directory, [
      `${WORKER_PID}-1-2.db`,
      `${WORKER_PID}-1-2.db-wal`,
      `${WORKER_PID}-1-2.db-shm`,
      `${MAIN_PID}-3-4.db`,
    ])
    removeSnapshotsOf(WORKER_PID, directory)
    expect(listFiles(directory)).toEqual([`${MAIN_PID}-3-4.db`])
  })

  it('does nothing when the folder does not exist', () => {
    expect(() => removeSnapshotsOf(WORKER_PID, path.join(tempRoot, 'missing'))).not.toThrow()
  })
})

describe('removeAllSnapshots', () => {
  it('empties the snapshot folder at startup', () => {
    const directory = path.join(tempRoot, 'alpine-sqlite')
    writeFiles(directory, [`${WORKER_PID}-1-2.db`, `${MAIN_PID}-3-4.db-journal`])
    removeAllSnapshots(directory)
    expect(listFiles(directory)).toEqual([])
  })
})

describe('removeLegacySnapshots', () => {
  it('removes the copies older versions left loose in the temp directory and nothing else', async () => {
    writeFiles(tempRoot, [
      `alpine-sqlite-${WORKER_PID}-1-2.db`,
      `alpine-sqlite-${WORKER_PID}-1-2.db-wal`,
      'unrelated.tmp',
    ])
    fs.mkdirSync(path.join(tempRoot, 'alpine-sqlite'))
    await removeLegacySnapshots(tempRoot)
    expect(listFiles(tempRoot)).toEqual(['alpine-sqlite', 'unrelated.tmp'])
  })
})
