import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import path from 'node:path'
import { appendBounded, createDiagnosticLog, createFailureReporter } from './diagnosticLog.js'

const USER_DATA = path.resolve(path.join(path.sep, 'userData'))
const LOG_PATH = path.join(USER_DATA, 'bluetooth-log.json')

function memoryFileSystem(initial = {}) {
  const files = { ...initial }
  return {
    files,
    readFileSync: vi.fn((file) => {
      if (!(file in files)) throw new Error('ENOENT')
      return files[file]
    }),
    writeFileSync: vi.fn((file, text) => {
      files[file] = text
    }),
  }
}

describe('appendBounded', () => {
  it('keeps only the newest entries', () => {
    expect(appendBounded([1, 2, 3], 4, 3)).toEqual([2, 3, 4])
    expect(appendBounded([], 1, 3)).toEqual([1])
  })
})

describe('createDiagnosticLog', () => {
  it('writes each record to the log file in the user data directory', () => {
    const fileSystem = memoryFileSystem()
    const log = createDiagnosticLog({ fileName: 'bluetooth-log.json', maxEntries: 5, resolveDirectory: () => USER_DATA, fileSystem, clock: () => 42 })

    log.record('read-failed', { stage: 'list' })

    expect(JSON.parse(fileSystem.files[LOG_PATH])).toEqual([{ time: 42, kind: 'read-failed', detail: { stage: 'list' } }])
  })

  it('keeps the entries already on disk and caps the total', () => {
    const existing = [{ time: 1, kind: 'old', detail: null }, { time: 2, kind: 'older', detail: null }]
    const fileSystem = memoryFileSystem({ [LOG_PATH]: JSON.stringify(existing) })
    const log = createDiagnosticLog({ fileName: 'bluetooth-log.json', maxEntries: 2, resolveDirectory: () => USER_DATA, fileSystem, clock: () => 3 })

    log.record('new', null)

    expect(JSON.parse(fileSystem.files[LOG_PATH]).map((entry) => entry.kind)).toEqual(['older', 'new'])
  })
})

describe('createFailureReporter', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('records the first failure of a kind and suppresses repeats', () => {
    const record = vi.fn()
    const reporter = createFailureReporter({ record, prefix: '[bluetooth]' })

    reporter.failure('read-failed', 'timeout')
    reporter.failure('read-failed', 'timeout')

    expect(record).toHaveBeenCalledTimes(1)
    expect(record).toHaveBeenCalledWith('read-failed', 'timeout')
  })

  it('records a kind again after it succeeded', () => {
    const record = vi.fn()
    const reporter = createFailureReporter({ record, prefix: '[bluetooth]' })

    reporter.failure('read-failed', 'timeout')
    reporter.success('read-failed')
    reporter.failure('read-failed', 'timeout')

    expect(record).toHaveBeenCalledTimes(2)
  })

  it('tracks each kind on its own', () => {
    const record = vi.fn()
    const reporter = createFailureReporter({ record, prefix: '[bluetooth]' })

    reporter.failure('read-failed', 'a')
    reporter.failure('radio-read-failed', 'b')
    reporter.success('radio-read-failed')

    expect(record.mock.calls.map(([kind]) => kind)).toEqual(['read-failed', 'radio-read-failed'])
  })
})
