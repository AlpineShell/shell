import { describe, it, expect } from 'vitest'
import browserTabsParser from './browserTabsParser.js'

const { cleanTabTitle, parseTabs } = browserTabsParser

describe('cleanTabTitle', () => {
  it('strips the Chrome memory usage annotation', () => {
    expect(cleanTabTitle('Welcome · Alpine Shell Docs - Memory usage - 117 MB')).toBe('Welcome · Alpine Shell Docs')
    expect(cleanTabTitle('Review Sprint - Confluence - High memory usage - 1.0 GB')).toBe('Review Sprint - Confluence')
  })

  it('strips audio annotations', () => {
    expect(cleanTabTitle('Lo-fi beats - YouTube - Audio playing')).toBe('Lo-fi beats - YouTube')
    expect(cleanTabTitle('Lo-fi beats - YouTube - Audio muted')).toBe('Lo-fi beats - YouTube')
  })

  it('keeps titles without annotations intact', () => {
    expect(cleanTabTitle('Inbox - user@example.com - Gmail')).toBe('Inbox - user@example.com - Gmail')
    expect(cleanTabTitle('Memory usage guide')).toBe('Memory usage guide')
  })
})

describe('parseTabs', () => {
  it('parses tab rows into typed objects', () => {
    const raw = [
      '459136\tchrome\t0\t0\tSign in to your account',
      '459136\tchrome\t1\t1\tTasks',
      '43190010\tfirefox\t0\t0\tExample Domain',
    ].join('\n')
    expect(parseTabs(raw)).toEqual([
      { hwnd: 459136, browser: 'chrome', index: 0, selected: false, title: 'Sign in to your account' },
      { hwnd: 459136, browser: 'chrome', index: 1, selected: true, title: 'Tasks' },
      { hwnd: 43190010, browser: 'firefox', index: 0, selected: false, title: 'Example Domain' },
    ])
  })

  it('keeps tabs whose titles contain the separator by rejoining trailing fields', () => {
    const raw = '1\tchrome\t2\t0\tleft\tright'
    expect(parseTabs(raw)).toEqual([{ hwnd: 1, browser: 'chrome', index: 2, selected: false, title: 'left\tright' }])
  })

  it('drops malformed rows and empty input', () => {
    expect(parseTabs('')).toEqual([])
    expect(parseTabs('not-a-number\tchrome\t0\t0\tTitle')).toEqual([])
    expect(parseTabs('1\tchrome\tNaN\t0\tTitle')).toEqual([])
    expect(parseTabs('1\tchrome\t0\t0\t')).toEqual([])
    expect(parseTabs('too\tfew\tfields')).toEqual([])
  })

  it('handles CRLF output from PowerShell', () => {
    const raw = '1\tchrome\t0\t0\tAlpha\r\n2\tfirefox\t1\t1\tBeta'
    expect(parseTabs(raw).map((t) => t.title)).toEqual(['Alpha', 'Beta'])
  })
})
