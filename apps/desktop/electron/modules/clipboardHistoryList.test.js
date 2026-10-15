import { describe, it, expect } from 'vitest'
import clipboardHistoryList from './clipboardHistoryList.js'

const { MAX_ENTRIES, addEntry, removeEntry, findEntry, isWorthKeeping, summarizeEntries } = clipboardHistoryList

function textEntry(id, text) {
  return { id, kind: 'text', contentKey: text, text, copiedAt: 1 }
}

describe('addEntry', () => {
  it('puts the newest copy first', () => {
    const entries = addEntry([textEntry('1', 'first')], textEntry('2', 'second'))
    expect(entries.map((entry) => entry.id)).toEqual(['2', '1'])
  })

  it('moves a copy of something already in the history to the top instead of keeping both', () => {
    const entries = addEntry([textEntry('1', 'same'), textEntry('2', 'other')], textEntry('3', 'same'))
    expect(entries.map((entry) => entry.id)).toEqual(['3', '2'])
  })

  it('keeps a text and an image with the same key apart', () => {
    const image = { id: '2', kind: 'image', contentKey: 'same', copiedAt: 1 }
    expect(addEntry([textEntry('1', 'same')], image)).toHaveLength(2)
  })

  it('drops the oldest copy once the history is full', () => {
    let entries = []
    for (let index = 0; index <= MAX_ENTRIES; index++) entries = addEntry(entries, textEntry(String(index), `text ${index}`))
    expect(entries).toHaveLength(MAX_ENTRIES)
    expect(findEntry(entries, '0')).toBeNull()
    expect(entries[0].id).toBe(String(MAX_ENTRIES))
  })
})

describe('removeEntry and findEntry', () => {
  it('removes only the entry with that id', () => {
    const entries = removeEntry([textEntry('1', 'a'), textEntry('2', 'b')], '1')
    expect(entries.map((entry) => entry.id)).toEqual(['2'])
    expect(findEntry(entries, '2')?.text).toBe('b')
  })
})

describe('isWorthKeeping', () => {
  it('skips empty and whitespace-only text', () => {
    expect(isWorthKeeping('')).toBe(false)
    expect(isWorthKeeping('  \r\n\t')).toBe(false)
    expect(isWorthKeeping(' hello ')).toBe(true)
  })
})

describe('summarizeEntries', () => {
  it('sends the renderer a shortened preview of long text and leaves out rich formats', () => {
    const entry = { ...textEntry('1', 'x'.repeat(5000)), html: '<b>x</b>' }
    const [summary] = summarizeEntries([entry])
    expect(summary.text).toHaveLength(2000)
    expect(summary).not.toHaveProperty('html')
  })

  it('sends an image as its thumbnail, never the full picture', () => {
    const image = { id: '2', kind: 'image', contentKey: 'k', copiedAt: 1, png: Buffer.from('png'), thumbnail: 'data:image/png;base64,', width: 10, height: 20 }
    const [summary] = summarizeEntries([image])
    expect(summary).toEqual({ id: '2', kind: 'image', copiedAt: 1, thumbnail: 'data:image/png;base64,', width: 10, height: 20 })
  })
})
