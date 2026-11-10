import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

const { compareVersionsDescending, manifestVersion, readPackedLicenceConfig, releaseReadinessProblems, staleVersionsOnChannel } = await import('./publish.js')
const { renderModule } = await import('./generateLicenceConfig.js')
const { createPackage } = await import('@electron/asar')

const feedUrl = 'https://auth.alpineshell.com/releases/'
const releaseLicenceConfig = { isReleaseBuild: true, publicKeys: [{ kid: 'lic-2026-09', spkiPem: 'pem' }] }
const appUpdateConfig = `provider: generic\r\nurl: ${feedUrl}\r\nchannel: latest\r\nupdaterCacheDirName: alpine-shell-updater\r\n`

function feedManifestFor(version, sha512 = 'c2hhNTEy') {
  return `version: ${version}\nfiles:\n  - url: Alpine-Shell-Setup-${version}.exe\n    sha512: ${sha512}\npath: Alpine-Shell-Setup-${version}.exe\n`
}

function readyRelease(overrides = {}) {
  return {
    licenceConfig: releaseLicenceConfig,
    appUpdateConfig,
    feedUrl,
    releaseManifest: feedManifestFor('0.20260928.0'),
    feedManifest: feedManifestFor('0.20260925.0'),
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
  it('sorts numerically per segment, newest first, with the date-based versions below 0.1.0', () => {
    expect(['0.9.0', '0.20260925.0', '0.1.0', '0.20260917.1', '0.10.0'].sort(compareVersionsDescending)).toEqual(['0.10.0', '0.9.0', '0.1.0', '0.20260925.0', '0.20260917.1'])
  })
})

describe('staleVersionsOnChannel', () => {
  const installerVersions = [
    '0.20260925.0',
    '0.20261102.1',
    '0.1.0',
    '0.1.1-nightly.20261103.0',
    '0.1.1-nightly.20261104.0',
    '0.1.1-nightly.20261105.0',
  ]

  it('prunes stable installers without touching a nightly one', () => {
    expect(staleVersionsOnChannel(installerVersions, 'stable', 1)).toEqual(['0.20261102.1', '0.20260925.0'])
  })

  it('prunes nightly installers without touching a stable one', () => {
    expect(staleVersionsOnChannel(installerVersions, 'nightly', 2)).toEqual(['0.1.1-nightly.20261103.0'])
  })
})

describe('releaseReadinessProblems', () => {
  it('lets a baked release build that is newer than the feed through', () => {
    expect(releaseReadinessProblems(readyRelease())).toEqual([])
  })

  it('lets the very first release through when the feed has no latest.yml yet', () => {
    expect(releaseReadinessProblems(readyRelease({ feedManifest: null }))).toEqual([])
  })

  it('refuses when the latest.yml in the bucket names no version', () => {
    expect(releaseReadinessProblems(readyRelease({ feedManifest: 'files: []\n' }))).toEqual(['the latest.yml in the bucket names no version, so 0.20260928.0 cannot be checked against it'])
  })

  it('lets an interrupted publish of the same build run again', () => {
    const liveManifest = feedManifestFor('0.20260928.0')
    expect(releaseReadinessProblems(readyRelease({ releaseManifest: liveManifest, feedManifest: liveManifest }))).toEqual([])
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

  it('refuses a local build once the feed is ahead of it', () => {
    expect(releaseReadinessProblems(readyRelease({ releaseManifest: feedManifestFor('0.1.0'), feedManifest: feedManifestFor('0.1.1') }))).toEqual(['version 0.1.0 is not newer than 0.1.1, which the update feed already offers'])
  })

  it('lets 0.1.0 replace a date-based release on the stable feed', () => {
    expect(releaseReadinessProblems(readyRelease({ releaseManifest: feedManifestFor('0.1.0'), feedManifest: feedManifestFor('0.20261102.1') }))).toEqual([])
  })

  it('publishes a nightly that is newer than the nightly feed', () => {
    const nightly = { channel: 'nightly', releaseManifest: feedManifestFor('0.1.1-nightly.20261103.0'), feedManifest: feedManifestFor('0.1.1-nightly.20261102.0') }
    expect(releaseReadinessProblems(readyRelease(nightly))).toEqual([])
  })

  it('keeps a nightly out of latest.yml and a stable release out of nightly.yml', () => {
    expect(releaseReadinessProblems(readyRelease({ releaseManifest: feedManifestFor('0.1.1-nightly.20261103.0') }))).toEqual(['version 0.1.1-nightly.20261103.0 is not a stable version, so it does not belong in latest.yml'])
    expect(releaseReadinessProblems(readyRelease({ channel: 'nightly', releaseManifest: feedManifestFor('0.1.1'), feedManifest: null }))).toEqual(['version 0.1.1 is not a nightly version, so it does not belong in nightly.yml'])
  })

  it('refuses a different build of the version the feed already offers', () => {
    const rebuilt = feedManifestFor('0.20260925.0', 'cmVidWlsdA==')
    expect(releaseReadinessProblems(readyRelease({ releaseManifest: rebuilt }))).toEqual(['version 0.20260925.0 is not newer than 0.20260925.0, which the update feed already offers'])
  })

  it('refuses when latest.yml names no version', () => {
    expect(releaseReadinessProblems(readyRelease({ releaseManifest: 'files: []\n' }))).toEqual(['release/latest.yml names no version'])
    expect(releaseReadinessProblems(readyRelease({ releaseManifest: null }))).toEqual(['release/latest.yml names no version'])
  })

  it('reports every problem at once', () => {
    expect(releaseReadinessProblems({ licenceConfig: null, appUpdateConfig: null, feedUrl, releaseManifest: feedManifestFor('0.1.0'), feedManifest: feedManifestFor('0.2.0') })).toHaveLength(3)
  })
})

describe('readPackedLicenceConfig', () => {
  let dir

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'alpinepublish-'))
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  async function packApp(files) {
    const appDir = path.join(dir, 'app')
    for (const [relativePath, content] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(appDir, relativePath)), { recursive: true })
      fs.writeFileSync(path.join(appDir, relativePath), content)
    }
    const archivePath = path.join(dir, 'app.asar')
    await createPackage(appDir, archivePath)
    return archivePath
  }

  it('reads the licence config the installer ships, not the one in the source tree', async () => {
    const archivePath = await packApp({ 'electron/licenceConfig.generated.js': renderModule(releaseLicenceConfig), 'electron/main.js': '' })
    expect(readPackedLicenceConfig(archivePath)).toEqual(releaseLicenceConfig)
  })

  it('returns null when the archive holds no licence config', async () => {
    const archivePath = await packApp({ 'electron/main.js': '' })
    expect(readPackedLicenceConfig(archivePath)).toBeNull()
  })

  it('returns null when there is no packed app', () => {
    expect(readPackedLicenceConfig(path.join(dir, 'missing.asar'))).toBeNull()
  })
})
