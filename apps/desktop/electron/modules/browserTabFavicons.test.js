import { describe, it, expect } from 'vitest'
import browserTabFavicons from './browserTabFavicons.js'

const { titleHostMapFromRows } = browserTabFavicons

describe('titleHostMapFromRows', () => {
  it('maps each title to the host of its most recent url', () => {
    const rows = [
      ['GitHub - alpine', 'https://github.com/AlpineShell/shell'],
      ['Inbox', 'https://mail.google.com/mail/u/0'],
    ]
    const map = titleHostMapFromRows(rows)
    expect(map.get('GitHub - alpine')).toBe('github.com')
    expect(map.get('Inbox')).toBe('mail.google.com')
  })

  it('keeps the first occurrence when titles repeat', () => {
    const rows = [
      ['Dashboard', 'https://recent.example.com/a'],
      ['Dashboard', 'https://older.example.com/b'],
    ]
    expect(titleHostMapFromRows(rows).get('Dashboard')).toBe('recent.example.com')
  })

  it('skips empty titles and unparseable urls', () => {
    const rows = [
      ['', 'https://example.com'],
      [null, 'https://example.com'],
      ['Broken', 'not a url'],
    ]
    const map = titleHostMapFromRows(rows)
    expect(map.size).toBe(0)
  })
})
