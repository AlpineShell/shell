import { describe, expect, it } from 'vitest'

const { resolvePluginsBase, DEFAULT_BASE } = await import('./marketplaceConfig.js')

const BAKED = 'https://plugins.example.com/alpine-plugins/'
const ENV = 'http://attacker.example/alpine-plugins'

describe('resolvePluginsBase', () => {
  it('ignores the environment and .env in a release build', () => {
    expect(resolvePluginsBase({ isReleaseBuild: true, env: ENV, baked: BAKED, dotEnv: ENV })).toBe('https://plugins.example.com/alpine-plugins')
    expect(resolvePluginsBase({ isReleaseBuild: true, env: ENV, baked: '', dotEnv: ENV })).toBe(DEFAULT_BASE)
  })

  it('falls back to the default when a release build baked a base that is not https', () => {
    expect(resolvePluginsBase({ isReleaseBuild: true, env: '', baked: 'http://plugins.example.com', dotEnv: '' })).toBe(DEFAULT_BASE)
  })

  it('lets the environment, then the baked value, then .env choose the base in a development build', () => {
    expect(resolvePluginsBase({ isReleaseBuild: false, env: ENV, baked: BAKED, dotEnv: '' })).toBe(ENV)
    expect(resolvePluginsBase({ isReleaseBuild: false, env: '', baked: BAKED, dotEnv: ENV })).toBe('https://plugins.example.com/alpine-plugins')
    expect(resolvePluginsBase({ isReleaseBuild: false, env: '', baked: '', dotEnv: 'http://localhost:9000/alpine-plugins/' })).toBe('http://localhost:9000/alpine-plugins')
    expect(resolvePluginsBase({ isReleaseBuild: false, env: '', baked: '', dotEnv: '' })).toBe(DEFAULT_BASE)
  })
})
