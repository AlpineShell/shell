import { describe, expect, it } from 'vitest'

const { shellLinkInShortcut } = await import('./launcherDeepLink.js')

const APP_LINK = 'alpine-shell://open-app?plugin=com.alpine.android&app=com.supercell.brawlstars'

describe('finding a shell link in a shortcut', () => {
  it('reads the link out of the arguments', () => {
    expect(shellLinkInShortcut({ target: 'C:\\app\\electron.exe', args: APP_LINK })).toBe(APP_LINK)
  })

  it('finds it behind an app directory, which is where a dev shell puts it', () => {
    const args = `C:\\repo\\apps\\desktop ${APP_LINK}`
    expect(shellLinkInShortcut({ target: 'C:\\repo\\electron.exe', args })).toBe(APP_LINK)
  })

  it('finds it in a quoted argument list', () => {
    expect(shellLinkInShortcut({ args: `"C:\\Some One\\desktop" "${APP_LINK}"` })).toBe(APP_LINK)
  })

  it('reads a .url shortcut, which carries the link as its target', () => {
    expect(shellLinkInShortcut({ target: APP_LINK })).toBe(APP_LINK)
  })

  it('leaves an ordinary shortcut alone', () => {
    expect(shellLinkInShortcut({ target: 'C:\\Windows\\notepad.exe', args: '' })).toBeNull()
    expect(shellLinkInShortcut({ target: 'C:\\app.exe', args: '--flag value' })).toBeNull()
  })

  it('is not fooled by a lookalike scheme', () => {
    expect(shellLinkInShortcut({ args: 'alpine-shellx://open-app?a=b' })).toBeNull()
    expect(shellLinkInShortcut({ args: 'https://alpine-shell.app/open-app' })).toBeNull()
  })

  it('survives a shortcut it could not read', () => {
    expect(shellLinkInShortcut(null)).toBeNull()
    expect(shellLinkInShortcut({})).toBeNull()
    expect(shellLinkInShortcut({ target: null, args: undefined })).toBeNull()
  })
})
