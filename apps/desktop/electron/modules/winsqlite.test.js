import { describe, it, expect } from 'vitest'
import winsqlite from './winsqlite.js'

const { readOnlyUri } = winsqlite

describe('readOnlyUri', () => {
  it('opens the live file read-only instead of a copy', () => {
    expect(readOnlyUri('C:\\Users\\x\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\History')).toBe(
      'file:C:/Users/x/AppData/Local/Google/Chrome/User Data/Default/History?mode=ro',
    )
  })

  it('escapes the characters sqlite reads as uri syntax', () => {
    expect(readOnlyUri('C:\\a?b#c%d\\Favicons')).toBe('file:C:/a%3Fb%23c%25d/Favicons?mode=ro')
  })
})
