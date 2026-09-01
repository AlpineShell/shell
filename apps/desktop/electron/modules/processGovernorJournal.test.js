import { describe, it, expect } from 'vitest'
import processGovernorJournal from './processGovernorJournal.js'

const {
  JOURNAL_VERSION,
  isValidEntry,
  entryKey,
  createJournal,
  parseJournal,
  serializeJournal,
  withEntry,
  withoutPid,
  isSameProcess,
  recoverableEntries,
  staleEntries,
} = processGovernorJournal

function entry(overrides) {
  return { pid: 1234, startTime: '133700000000000000', name: 'slack', ...overrides }
}

function liveMap(entries) {
  return new Map(entries.map((live) => [live.pid, live]))
}

describe('isValidEntry', () => {
  it('accepts a pid paired with a start time', () => {
    expect(isValidEntry(entry())).toBe(true)
  })

  it('rejects a missing or non-positive pid', () => {
    expect(isValidEntry(entry({ pid: 0 }))).toBe(false)
    expect(isValidEntry(entry({ pid: -1 }))).toBe(false)
    expect(isValidEntry(entry({ pid: undefined }))).toBe(false)
    expect(isValidEntry(entry({ pid: 1.5 }))).toBe(false)
  })

  it('rejects an entry with no start time, because a bare pid can be recycled', () => {
    expect(isValidEntry(entry({ startTime: undefined }))).toBe(false)
    expect(isValidEntry(entry({ startTime: '' }))).toBe(false)
    expect(isValidEntry(entry({ startTime: 12345 }))).toBe(false)
  })

  it('rejects a non-object', () => {
    expect(isValidEntry(null)).toBe(false)
    expect(isValidEntry('1234')).toBe(false)
  })
})

describe('parseJournal', () => {
  it('returns an empty journal for empty or unparseable input', () => {
    expect(parseJournal('')).toEqual(createJournal())
    expect(parseJournal('   ')).toEqual(createJournal())
    expect(parseJournal('{ not json')).toEqual(createJournal())
    expect(parseJournal(null)).toEqual(createJournal())
  })

  it('discards a journal written by a different version', () => {
    const raw = JSON.stringify({ version: JOURNAL_VERSION + 1, entries: [entry()] })
    expect(parseJournal(raw).entries).toEqual([])
  })

  it('discards entries that lost their start time', () => {
    const raw = JSON.stringify({ version: JOURNAL_VERSION, entries: [entry(), { pid: 99 }] })
    expect(parseJournal(raw).entries).toHaveLength(1)
  })

  it('collapses duplicate entries', () => {
    const raw = JSON.stringify({ version: JOURNAL_VERSION, entries: [entry(), entry()] })
    expect(parseJournal(raw).entries).toHaveLength(1)
  })

  it('normalises a missing name to null', () => {
    const raw = JSON.stringify({ version: JOURNAL_VERSION, entries: [{ pid: 7, startTime: 'abc' }] })
    expect(parseJournal(raw).entries[0].name).toBe(null)
  })

  it('round-trips through serializeJournal', () => {
    const journal = withEntry(createJournal(), entry())
    expect(parseJournal(serializeJournal(journal))).toEqual(journal)
  })
})

describe('serializeJournal', () => {
  it('drops invalid entries rather than writing them', () => {
    const journal = { version: JOURNAL_VERSION, entries: [entry(), { pid: 0, startTime: 'x' }] }
    expect(JSON.parse(serializeJournal(journal)).entries).toHaveLength(1)
  })

  it('writes an empty journal when given nothing', () => {
    expect(JSON.parse(serializeJournal(null))).toEqual({ version: JOURNAL_VERSION, entries: [] })
  })
})

describe('withEntry and withoutPid', () => {
  it('appends a new entry', () => {
    expect(withEntry(createJournal(), entry()).entries).toHaveLength(1)
  })

  it('ignores a duplicate of the same process', () => {
    const once = withEntry(createJournal(), entry())
    expect(withEntry(once, entry())).toBe(once)
  })

  it('keeps a recycled pid with a different start time as a separate entry', () => {
    const once = withEntry(createJournal(), entry())
    expect(withEntry(once, entry({ startTime: 'later' })).entries).toHaveLength(2)
  })

  it('ignores an invalid entry', () => {
    const empty = createJournal()
    expect(withEntry(empty, { pid: 0 })).toBe(empty)
  })

  it('removes every entry for a pid', () => {
    const journal = withEntry(withEntry(createJournal(), entry()), entry({ startTime: 'later' }))
    expect(withoutPid(journal, 1234).entries).toEqual([])
  })

  it('returns the same journal when the pid was not present', () => {
    const journal = withEntry(createJournal(), entry())
    expect(withoutPid(journal, 999)).toBe(journal)
  })
})

describe('isSameProcess', () => {
  it('matches on pid and start time together', () => {
    expect(isSameProcess(entry(), { pid: 1234, startTime: '133700000000000000' })).toBe(true)
  })

  it('rejects a recycled pid whose start time moved', () => {
    expect(isSameProcess(entry(), { pid: 1234, startTime: '133800000000000000' })).toBe(false)
  })

  it('rejects a missing live process', () => {
    expect(isSameProcess(entry(), null)).toBe(false)
    expect(isSameProcess(entry(), undefined)).toBe(false)
  })
})

describe('recoverableEntries and staleEntries', () => {
  it('splits a journal into processes still alive and processes gone', () => {
    const alive = entry()
    const dead = entry({ pid: 5555, startTime: 'old', name: 'code' })
    const journal = withEntry(withEntry(createJournal(), alive), dead)
    const live = liveMap([{ pid: 1234, startTime: '133700000000000000' }])
    expect(recoverableEntries(journal, live)).toEqual([alive])
    expect(staleEntries(journal, live)).toEqual([dead])
  })

  it('treats a recycled pid as stale, never as recoverable', () => {
    const journal = withEntry(createJournal(), entry())
    const live = liveMap([{ pid: 1234, startTime: 'a-different-process' }])
    expect(recoverableEntries(journal, live)).toEqual([])
    expect(staleEntries(journal, live)).toHaveLength(1)
  })

  it('treats every entry as stale when nothing is alive', () => {
    const journal = withEntry(createJournal(), entry())
    expect(recoverableEntries(journal, new Map())).toEqual([])
    expect(staleEntries(journal, new Map())).toHaveLength(1)
  })

  it('tolerates a missing live map', () => {
    const journal = withEntry(createJournal(), entry())
    expect(recoverableEntries(journal, null)).toEqual([])
    expect(staleEntries(journal, null)).toHaveLength(1)
  })

  it('tolerates a missing journal', () => {
    expect(recoverableEntries(null, new Map())).toEqual([])
    expect(staleEntries(null, new Map())).toEqual([])
  })
})

describe('entryKey', () => {
  it('separates two processes that shared a pid', () => {
    expect(entryKey(entry())).not.toBe(entryKey(entry({ startTime: 'later' })))
  })
})
