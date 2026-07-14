import { describe, it, expect } from 'vitest'
import browserTabFavicons from './browserTabFavicons.js'

const { titleHostMapFromRows, applyMaps } = browserTabFavicons

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

describe('applyMaps', () => {
  it('attaches host even when no favicon exists and counts each enriched tab', () => {
    const tabs = [
      { title: 'Pull requests', browser: 'chrome' },
      { title: 'Unknown page', browser: 'chrome' },
    ]
    const maps = {
      titleHost: new Map([['Pull requests', 'github.com']]),
      iconByHost: new Map(),
    }
    expect(applyMaps(tabs, maps)).toBe(1)
    expect(tabs[0].host).toBe('github.com')
    expect(tabs[0].favicon).toBeUndefined()
    expect(tabs[1].host).toBeUndefined()
  })

  it('attaches favicon alongside host and tolerates null maps', () => {
    const tabs = [{ title: 'Inbox', browser: 'firefox' }]
    const maps = {
      titleHost: new Map([['Inbox', 'mail.example.com']]),
      iconByHost: new Map([['mail.example.com', 'data:image/png;base64,AAAA']]),
    }
    expect(applyMaps(tabs, maps)).toBe(1)
    expect(tabs[0].favicon).toBe('data:image/png;base64,AAAA')
    expect(applyMaps(tabs, null)).toBe(0)
  })
})
