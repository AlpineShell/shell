import { describe, expect, it, vi } from 'vitest'

const {
  MAX_DETAIL_CHARS,
  truncateText,
  describeError,
  createRepeatFilter,
  createCrashLog,
} = await import('./crashLog.js')

function recordingLog() {
  return { record: vi.fn() }
}

describe('describeError', () => {
  it('keeps the stack of an error', () => {
    const error = new Error('koffi failed to load')
    expect(describeError(error)).toContain('koffi failed to load')
    expect(describeError(error)).toBe(error.stack)
  })

  it('describes a rejection that is not an error', () => {
    expect(describeError('plain reason')).toBe('plain reason')
    expect(describeError(undefined)).toBe('undefined')
  })

  it('caps a huge stack so one entry cannot fill the disk', () => {
    const error = new Error('x'.repeat(MAX_DETAIL_CHARS * 3))
    expect(describeError(error)).toHaveLength(MAX_DETAIL_CHARS)
  })
})

describe('truncateText', () => {
  it('leaves short text as it is', () => {
    expect(truncateText('short', 10)).toBe('short')
    expect(truncateText('longer text', 6)).toBe('longer')
  })
})

describe('createRepeatFilter', () => {
  it('lets the first occurrence through and quiets repeats for a minute', () => {
    let now = 0
    const isRepeat = createRepeatFilter({ quietMs: 60000, clock: () => now })

    expect(isRepeat('render-process-gone:crashed')).toBe(false)
    now = 30000
    expect(isRepeat('render-process-gone:crashed')).toBe(true)
    now = 61000
    expect(isRepeat('render-process-gone:crashed')).toBe(false)
  })

  it('tracks different events on their own', () => {
    const isRepeat = createRepeatFilter({ clock: () => 0 })
    expect(isRepeat('a')).toBe(false)
    expect(isRepeat('b')).toBe(false)
  })

  it('does not grow without bound', () => {
    const isRepeat = createRepeatFilter({ maxRemembered: 2, clock: () => 0 })
    isRepeat('a')
    isRepeat('b')
    isRepeat('c')
    expect(isRepeat('a')).toBe(false)
  })
})

describe('createCrashLog', () => {
  it('writes each distinct event to the log', () => {
    const log = recordingLog()
    const crashLog = createCrashLog({ log, isRepeat: createRepeatFilter({ clock: () => 0 }) })

    crashLog.record('uncaught-exception', 'boom')
    crashLog.record('render-process-gone', { reason: 'crashed' })

    expect(log.record.mock.calls).toEqual([
      ['uncaught-exception', 'boom'],
      ['render-process-gone', { reason: 'crashed' }],
    ])
  })

  it('drops the same event repeated in a tight loop', () => {
    const log = recordingLog()
    const crashLog = createCrashLog({ log, isRepeat: createRepeatFilter({ clock: () => 0 }) })

    for (let index = 0; index < 50; index++) crashLog.record('unhandled-rejection', 'timer failed')

    expect(log.record).toHaveBeenCalledTimes(1)
  })
})
