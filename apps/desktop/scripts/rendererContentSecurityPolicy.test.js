import { describe, expect, it } from 'vitest'
import config from '../vite.config.ts'

function policyPlugin() {
  return config.plugins.flat(Infinity).find((plugin) => plugin && plugin.name === 'alpine-renderer-content-security-policy')
}

function injectedTag() {
  const [tag] = policyPlugin().transformIndexHtml()
  return tag
}

function directives() {
  const entries = injectedTag().attrs.content.split(';').map((part) => part.trim().split(/\s+/))
  return Object.fromEntries(entries.map(([name, ...sources]) => [name, sources]))
}

describe('renderer content security policy', () => {
  it('is written into the built page only, ahead of every script', () => {
    expect(policyPlugin().apply).toBe('build')
    expect(injectedTag()).toMatchObject({ tag: 'meta', injectTo: 'head-prepend', attrs: { 'http-equiv': 'Content-Security-Policy' } })
  })

  it('runs the app bundle and plugin modules, never inline, evaluated or remote script', () => {
    const policy = directives()
    expect(policy['default-src']).toEqual(["'self'"])
    expect(policy['script-src']).toEqual(["'self'", 'alpine-plugin:'])
    expect(policy['object-src']).toEqual(["'none'"])
    expect(policy['base-uri']).toEqual(["'none'"])
    expect(policy['frame-src']).toEqual(["'none'"])
  })

  it('still lets the launcher and plugin widgets fetch from the web and show wallpapers and icons', () => {
    const policy = directives()
    expect(policy['connect-src']).toEqual(expect.arrayContaining(["'self'", 'https:', 'alpine-plugin:']))
    expect(policy['img-src']).toEqual(expect.arrayContaining(["'self'", 'https:', 'data:', 'alpine-plugin:', 'alpine-wallpaper:']))
    expect(policy['font-src']).toEqual(expect.arrayContaining(["'self'", 'data:']))
  })
})
