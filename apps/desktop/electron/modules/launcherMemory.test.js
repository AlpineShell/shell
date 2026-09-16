import { describe, it, expect } from 'vitest'
import launcherMemory from './launcherMemory.js'

const {
  QUERY_CAP_PER_ITEM,
  QUERY_HALF_LIFE_MS,
  emptyMemory,
  normalizeKey,
  normalizeQuery,
  migrateMemory,
  recordSelection,
  snapshotMemory,
  pruneMemory,
} = launcherMemory

const NOW = Date.UTC(2026, 8, 16, 12)
const DAY = 24 * 60 * 60 * 1000
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'

describe('normalization', () => {
  it('normalizes keys the way launcher targets are normalized', () => {
    expect(normalizeKey('  "C:\\Apps\\Code.EXE" ')).toBe('c:\\apps\\code.exe')
    expect(normalizeKey('')).toBe('')
  })

  it('lowercases queries and collapses whitespace', () => {
    expect(normalizeQuery('  YT   Music ')).toBe('yt music')
    expect(normalizeQuery(undefined)).toBe('')
  })
})

describe('migrateMemory', () => {
  it('carries version 1 launch history over without query memory', () => {
    const migrated = migrateMemory({ version: 1, apps: { [normalizeKey(CHROME)]: { count: 3, lastLaunchedAt: NOW, recent: [NOW, NOW - DAY] } } })
    expect(migrated).toEqual({
      version: 2,
      items: { [normalizeKey(CHROME)]: { count: 3, recent: [NOW, NOW - DAY], queries: {} } },
    })
  })

  it('keeps version 2 query memory and drops malformed entries', () => {
    const migrated = migrateMemory({
      version: 2,
      items: {
        good: { count: 1, recent: [NOW], queries: { yt: { count: 2, last: NOW }, broken: { count: 'x' } } },
        bad: 'nope',
      },
    })
    expect(migrated.items).toEqual({ good: { count: 1, recent: [NOW], queries: { yt: { count: 2, last: NOW } } } })
  })

  it('starts empty from garbage', () => {
    expect(migrateMemory(null)).toEqual(emptyMemory())
    expect(migrateMemory({ version: 2 })).toEqual(emptyMemory())
  })
})

describe('recordSelection', () => {
  it('counts the pick and remembers the query it was picked for', () => {
    const memory = emptyMemory()
    recordSelection(memory, CHROME, ' YT ', NOW)
    recordSelection(memory, CHROME, 'yt', NOW + 1)
    const record = memory.items[normalizeKey(CHROME)]
    expect(record.count).toBe(2)
    expect(record.recent).toEqual([NOW + 1, NOW])
    expect(record.queries).toEqual({ yt: { count: 2, last: NOW + 1 } })
  })

  it('records a launch without a query as usage only', () => {
    const memory = emptyMemory()
    recordSelection(memory, CHROME, '', NOW)
    expect(memory.items[normalizeKey(CHROME)].queries).toEqual({})
  })

  it('ignores an empty key', () => {
    const memory = emptyMemory()
    expect(recordSelection(memory, '  ', 'yt', NOW)).toBe(false)
    expect(memory.items).toEqual({})
  })

  it('keeps only the strongest queries per item', () => {
    const memory = emptyMemory()
    for (let index = 0; index < QUERY_CAP_PER_ITEM + 5; index += 1) {
      recordSelection(memory, 'item', `query ${index}`, NOW + index)
    }
    recordSelection(memory, 'item', 'query 0', NOW + 100)
    const queries = Object.keys(memory.items.item.queries)
    expect(queries).toHaveLength(QUERY_CAP_PER_ITEM)
    expect(queries).toContain('query 0')
  })
})

describe('snapshotMemory', () => {
  it('reports usage and decaying query weights per item', () => {
    const memory = emptyMemory()
    recordSelection(memory, 'youtube', 'yt', NOW - QUERY_HALF_LIFE_MS)
    recordSelection(memory, 'youtube', 'yt', NOW - QUERY_HALF_LIFE_MS)
    const snapshot = snapshotMemory(memory, NOW)
    expect(snapshot.queries).toEqual({ youtube: { yt: 1 } })
    expect(snapshot.usage.youtube).toBeGreaterThan(0)
  })

  it('omits queries that have faded away and items never used recently', () => {
    const memory = emptyMemory()
    recordSelection(memory, 'old', 'yt', NOW - 20 * QUERY_HALF_LIFE_MS)
    const snapshot = snapshotMemory(memory, NOW)
    expect(snapshot.queries).toEqual({})
    expect(snapshot.usage).toEqual({})
  })
})

describe('pruneMemory', () => {
  it('forgets items unused for over a year', () => {
    const memory = emptyMemory()
    recordSelection(memory, 'fresh', 'a', NOW - DAY)
    recordSelection(memory, 'stale', 'b', NOW - 400 * DAY)
    pruneMemory(memory, NOW)
    expect(Object.keys(memory.items)).toEqual(['fresh'])
  })
})
