import { describe, expect, it } from 'vitest'
import { createRequire } from 'module'

const releaseVersions = createRequire(import.meta.url)('./releaseVersions.js')

describe('channelOfVersion', () => {
  it('puts a nightly build on the nightly channel and everything else on stable', () => {
    expect(releaseVersions.channelOfVersion('0.1.1-nightly.20261102.0')).toBe('nightly')
    expect(releaseVersions.channelOfVersion('0.1.0')).toBe('stable')
    expect(releaseVersions.channelOfVersion('0.20261102.1')).toBe('stable')
    expect(releaseVersions.channelOfVersion('0.2.0-beta.1')).toBe('stable')
  })
})

describe('feedNameForChannel', () => {
  it('reads latest.yml for stable and nightly.yml for nightly', () => {
    expect(releaseVersions.feedNameForChannel('stable')).toBe('latest')
    expect(releaseVersions.feedNameForChannel('nightly')).toBe('nightly')
    expect(releaseVersions.feedNameForChannel('anything')).toBe('latest')
  })
})

describe('isDateBasedVersion', () => {
  it('recognises the versions released before 0.1.0', () => {
    expect(releaseVersions.isDateBasedVersion('0.20261102.1')).toBe(true)
    expect(releaseVersions.isDateBasedVersion('0.1.0')).toBe(false)
    expect(releaseVersions.isDateBasedVersion('1.20261102.0')).toBe(false)
    expect(releaseVersions.isDateBasedVersion('0.1.1-nightly.20261102.0')).toBe(false)
  })
})

describe('compareVersions', () => {
  it('sorts stable releases, nightlies and the old date-based versions, oldest first', () => {
    const versions = [
      '0.1.1-nightly.20261103.0',
      '0.20261102.1',
      '0.2.0',
      '0.1.0',
      '0.1.1-nightly.20261102.1',
      '0.20260925.0',
      '0.1.1',
      '0.1.1-nightly.20261102.0',
      '0.1.0-nightly.20261101.0',
    ]
    expect(versions.sort(releaseVersions.compareVersions)).toEqual([
      '0.20260925.0',
      '0.20261102.1',
      '0.1.0-nightly.20261101.0',
      '0.1.0',
      '0.1.1-nightly.20261102.0',
      '0.1.1-nightly.20261102.1',
      '0.1.1-nightly.20261103.0',
      '0.1.1',
      '0.2.0',
    ])
  })

  it('treats equal versions as equal', () => {
    expect(releaseVersions.compareVersions('0.1.0', '0.1.0')).toBe(0)
    expect(releaseVersions.compareVersions('0.1.1-nightly.20261102.0', '0.1.1-nightly.20261102.0')).toBe(0)
  })
})

describe('isUpdateChannel', () => {
  it('accepts stable and nightly only', () => {
    expect(releaseVersions.UPDATE_CHANNELS).toEqual(['stable', 'nightly'])
    expect(releaseVersions.isUpdateChannel('nightly')).toBe(true)
    expect(releaseVersions.isUpdateChannel('latest')).toBe(false)
    expect(releaseVersions.isUpdateChannel(undefined)).toBe(false)
  })
})
