import { describe, expect, it } from 'vitest'

const { pageUrl } = await import('./pluginWindows.js')

describe('plugin window page resolution', () => {
  it('serves a page from the plugin that asked for it', () => {
    expect(pageUrl('com.alpine.android', 'window.html')).toBe('alpine-plugin://com.alpine.android/window.html')
    expect(pageUrl('com.alpine.android', 'ui/app.html')).toBe('alpine-plugin://com.alpine.android/ui/app.html')
  })

  it('refuses to escape the plugin folder, in either slash', () => {
    expect(pageUrl('com.alpine.android', '../other/window.html')).toBeNull()
    expect(pageUrl('com.alpine.android', 'ui/../../window.html')).toBeNull()
    expect(pageUrl('com.alpine.android', '..\\other\\window.html')).toBeNull()
  })

  it('refuses an absolute url, so a window cannot be pointed off the machine', () => {
    expect(pageUrl('com.alpine.android', 'https://example.com/x.html')).toBeNull()
    expect(pageUrl('com.alpine.android', 'file:///c:/windows/x.html')).toBeNull()
    expect(pageUrl('com.alpine.android', 'alpine-plugin://other/window.html')).toBeNull()
  })

  it('refuses anything that is not a page', () => {
    expect(pageUrl('com.alpine.android', 'backend.js')).toBeNull()
    expect(pageUrl('com.alpine.android', '')).toBeNull()
    expect(pageUrl('com.alpine.android', null)).toBeNull()
  })

  it('treats a leading slash as relative rather than absolute', () => {
    expect(pageUrl('com.alpine.android', '/window.html')).toBe('alpine-plugin://com.alpine.android/window.html')
  })

  it('keeps each plugin in its own origin', () => {
    expect(pageUrl('a.plugin', 'window.html')).toBe('alpine-plugin://a.plugin/window.html')
    expect(pageUrl('b.plugin', 'window.html')).toBe('alpine-plugin://b.plugin/window.html')
  })
})
