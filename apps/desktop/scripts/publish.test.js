import { describe, expect, it } from 'vitest'

const { compareVersionsDescending, manifestVersion, releaseReadinessProblems } = await import('./publish.js')

const feedUrl = 'https://auth.alpineshell.com/releases/'
const releaseLicenceConfig = { isReleaseBuild: true, publicKeys: [{ kid: 'lic-2026-09', spkiPem: 'pem' }] }
const appUpdateConfig = `provider: generic\r\nurl: ${feedUrl}\r\nchannel: latest\r\nupdaterCacheDirName: alpine-shell-updater\r\n`

function readyRelease(overrides = {}) {
  return {
    licenceConfig: releaseLicenceConfig,
    appUpdateConfig,
    feedUrl,
    releaseVersion: '0.20260928.0',
    feedVersion: '0.20260925.0',
    ...overrides,
  }
}

describe('manifestVersion', () => {
  it('reads the version electron-builder writes into latest.yml', () => {
    expect(manifestVersion("version: 0.20260928.0\nfiles:\n  - url: Alpine-Shell-Setup-0.20260928.0.exe\nreleaseDate: '2026-09-28T10:00:00.000Z'\n")).toBe('0.20260928.0')
  })

  it('accepts a quoted version and Windows line endings', () => {
    expect(manifestVersion("files: []\r\nversion: '1.2.3'\r\n")).toBe('1.2.3')
  })

  it('returns null when there is no manifest or no version line', () => {
    expect(manifestVersion(null)).toBeNull()
    expect(manifestVersion('files: []\n')).toBeNull()
  })
})

describe('compareVersionsDescending', () => {
  it('sorts numerically per segment, newest first', () => {
    expect(['0.9.0', '0.20260925.0', '0.1.0', '0.20260917.1'].sort(compareVersionsDescending)).toEqual(['0.20260925.0', '0.20260917.1', '0.9.0', '0.1.0'])
  })
})

describe('releaseReadinessProblems', () => {
  it('lets a baked release build that is newer than the feed through', () => {
    expect(releaseReadinessProblems(readyRelease())).toEqual([])
  })

  it('lets the very first release through when the feed has no latest.yml yet', () => {
    expect(releaseReadinessProblems(readyRelease({ feedVersion: null }))).toEqual([])
  })

  it('refuses a development licence config', () => {
    const problems = releaseReadinessProblems(readyRelease({ licenceConfig: { isReleaseBuild: false, publicKeys: [] } }))
    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatch(/not a release build/)
  })

  it('refuses a release config without a single licence key', () => {
    expect(releaseReadinessProblems(readyRelease({ licenceConfig: { isReleaseBuild: true, publicKeys: [{ spkiPem: 'pem' }] } }))[0]).toMatch(/at least one licence key/)
  })

  it('refuses when the licence config was never baked', () => {
    expect(releaseReadinessProblems(readyRelease({ licenceConfig: null }))[0]).toMatch(/not a release build/)
  })

  it('refuses a build whose app-update.yml points anywhere but the feed', () => {
    const bucket = appUpdateConfig.replace(feedUrl, 'https://bucket.example.com/alpine-shell/')
    expect(releaseReadinessProblems(readyRelease({ appUpdateConfig: bucket }))).toEqual([`release/win-unpacked/resources/app-update.yml does not point at ${feedUrl}`])
    expect(releaseReadinessProblems(readyRelease({ appUpdateConfig: `url: ${feedUrl}evil/\n` }))).toHaveLength(1)
    expect(releaseReadinessProblems(readyRelease({ appUpdateConfig: null }))).toHaveLength(1)
  })

  it('refuses the unbumped 0.1.0 of a local build once the feed is ahead of it', () => {
    expect(releaseReadinessProblems(readyRelease({ releaseVersion: '0.1.0' }))).toEqual(['version 0.1.0 is not newer than 0.20260925.0, which the update feed already offers'])
  })

  it('refuses to publish the version the feed already offers again', () => {
    expect(releaseReadinessProblems(readyRelease({ releaseVersion: '0.20260925.0' }))).toHaveLength(1)
  })

  it('refuses when latest.yml names no version', () => {
    expect(releaseReadinessProblems(readyRelease({ releaseVersion: null }))).toEqual(['release/latest.yml names no version'])
  })

  it('reports every problem at once', () => {
    expect(releaseReadinessProblems({ licenceConfig: null, appUpdateConfig: null, feedUrl, releaseVersion: '0.1.0', feedVersion: '0.2.0' })).toHaveLength(3)
  })
})
