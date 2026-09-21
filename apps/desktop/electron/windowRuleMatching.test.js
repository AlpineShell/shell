import { describe, it, expect } from 'vitest'
import { ruleMatchesWindow, findWindowRule, appTitleFor, shortcutNameForTitle } from './windowRuleMatching'

const WSLG_RULE = { process: 'msrdc.exe', className: 'RAIL_WINDOW', titleSuffix: ' (Ubuntu)' }
const WSLG_WINDOW = { exePath: 'msrdc.exe', className: 'RAIL_WINDOW', title: 'Calculator (Ubuntu)' }

describe('ruleMatchesWindow', () => {
  it('matches the process, class and title suffix', () => {
    expect(ruleMatchesWindow(WSLG_RULE, WSLG_WINDOW)).toBe(true)
  })

  it('compares the process by file name, ignoring case and folders', () => {
    expect(ruleMatchesWindow(WSLG_RULE, { ...WSLG_WINDOW, exePath: 'some/folder/MSRDC.EXE' })).toBe(true)
  })

  it('rejects another window class of the same process', () => {
    expect(ruleMatchesWindow(WSLG_RULE, { ...WSLG_WINDOW, className: 'TscShellContainerClass' })).toBe(false)
  })

  it('rejects a window from another distribution', () => {
    expect(ruleMatchesWindow(WSLG_RULE, { ...WSLG_WINDOW, title: 'Calculator (Debian)' })).toBe(false)
  })

  it('matches any title when the rule names no suffix', () => {
    const { titleSuffix, ...anyTitle } = WSLG_RULE
    expect(ruleMatchesWindow(anyTitle, { ...WSLG_WINDOW, title: 'Calculator' })).toBe(true)
  })

  it('rejects a window without a title', () => {
    expect(ruleMatchesWindow(WSLG_RULE, { ...WSLG_WINDOW, title: '' })).toBe(false)
  })
})

describe('findWindowRule', () => {
  it('returns the first matching rule', () => {
    const debian = { ...WSLG_RULE, titleSuffix: ' (Debian)' }
    expect(findWindowRule([debian, WSLG_RULE], WSLG_WINDOW)).toBe(WSLG_RULE)
  })

  it('returns null when nothing matches', () => {
    expect(findWindowRule([WSLG_RULE], { ...WSLG_WINDOW, exePath: 'notepad.exe' })).toBeNull()
  })
})

describe('appTitleFor', () => {
  it('drops the rule suffix', () => {
    expect(appTitleFor(WSLG_RULE, 'New Tab - Google Chrome (Ubuntu)')).toBe('New Tab - Google Chrome')
  })

  it('keeps a title without the suffix', () => {
    expect(appTitleFor(WSLG_RULE, 'Calculator')).toBe('Calculator')
  })
})

describe('shortcutNameForTitle', () => {
  const shortcuts = ['Calculator', 'Google Chrome', 'Chrome', 'LibreOffice Calc']

  it('picks the shortcut named exactly like the window', () => {
    expect(shortcutNameForTitle('calculator', shortcuts)).toBe('Calculator')
  })

  it('picks the longest shortcut the title ends with after a separator', () => {
    expect(shortcutNameForTitle('New Tab - Google Chrome', shortcuts)).toBe('Google Chrome')
  })

  it('ignores a shortcut that only appears inside a word', () => {
    expect(shortcutNameForTitle('Untitled 1 - LibreOffice Calculator', shortcuts)).toBeNull()
  })

  it('returns null when no shortcut fits', () => {
    expect(shortcutNameForTitle('Home', shortcuts)).toBeNull()
  })
})
