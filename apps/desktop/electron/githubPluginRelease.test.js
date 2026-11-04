import { describe, expect, it, vi } from 'vitest'

const { parseReleaseUrl, resolveRelease, downloadReleaseBundle } = await import('./githubPluginRelease.js')

const RELEASE_URL = 'https://github.com/octo/notes/releases/tag/v1.2.0'
const COMMIT = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'
const ASSET_URL = 'https://github.com/octo/notes/releases/download/v1.2.0/notes-1.2.0.alpineplugin'

function bundleAsset(name = 'notes-1.2.0.alpineplugin', url = ASSET_URL) {
  return { name, size: 2048, browser_download_url: url }
}

function githubApi({ release = { draft: false, assets: [bundleAsset()] }, commit = { sha: COMMIT }, failWith = null } = {}) {
  return vi.fn(async (url) => {
    if (failWith) throw failWith
    if (url === 'https://api.github.com/repos/octo/notes/releases/tags/v1.2.0') {
      return release ? new Response(JSON.stringify(release)) : new Response(null, { status: 404 })
    }
    if (url === 'https://api.github.com/repos/octo/notes/commits/v1.2.0') {
      return commit ? new Response(JSON.stringify(commit)) : new Response(null, { status: 404 })
    }
    return new Response(null, { status: 404 })
  })
}

describe('reading a GitHub release link', () => {
  it('takes owner, repository and tag from a release link', () => {
    expect(parseReleaseUrl(RELEASE_URL)).toEqual({ owner: 'octo', repo: 'notes', tag: 'v1.2.0' })
    expect(parseReleaseUrl(' https://github.com/octo/notes/releases/tag/release%2F1.0 ')).toEqual({ owner: 'octo', repo: 'notes', tag: 'release/1.0' })
  })

  it('refuses anything that is not a release on github.com', () => {
    expect(parseReleaseUrl('http://github.com/octo/notes/releases/tag/v1.2.0')).toBeNull()
    expect(parseReleaseUrl('https://evil.example/octo/notes/releases/tag/v1.2.0')).toBeNull()
    expect(parseReleaseUrl('https://github.com/octo/notes/releases')).toBeNull()
    expect(parseReleaseUrl('https://github.com/octo/notes')).toBeNull()
    expect(parseReleaseUrl('https://github.com/octo/../releases/tag/v1')).toBeNull()
    expect(parseReleaseUrl('not a link')).toBeNull()
    expect(parseReleaseUrl(null)).toBeNull()
  })
})

describe('resolving a release', () => {
  it('names the repository, the tag, the commit and the one bundle', async () => {
    const result = await resolveRelease(RELEASE_URL, { fetchImpl: githubApi() })
    expect(result).toEqual({
      ok: true,
      release: { owner: 'octo', repo: 'notes', tag: 'v1.2.0', commit: COMMIT, assetName: 'notes-1.2.0.alpineplugin', assetUrl: ASSET_URL, size: 2048 },
    })
  })

  it('ignores assets that are not plugin bundles', async () => {
    const release = { draft: false, assets: [{ name: 'source.zip', browser_download_url: ASSET_URL }, bundleAsset()] }
    expect(await resolveRelease(RELEASE_URL, { fetchImpl: githubApi({ release }) })).toMatchObject({ ok: true })
  })

  it('needs exactly one .alpineplugin asset', async () => {
    const none = { draft: false, assets: [{ name: 'source.zip', browser_download_url: ASSET_URL }] }
    const two = { draft: false, assets: [bundleAsset('a.alpineplugin'), bundleAsset('b.alpineplugin')] }
    expect(await resolveRelease(RELEASE_URL, { fetchImpl: githubApi({ release: none }) })).toEqual({ ok: false, error: 'no-bundle' })
    expect(await resolveRelease(RELEASE_URL, { fetchImpl: githubApi({ release: two }) })).toEqual({ ok: false, error: 'several-bundles' })
  })

  it('refuses a bundle served from another repository', async () => {
    const release = { draft: false, assets: [bundleAsset('notes.alpineplugin', 'https://github.com/evil/notes/releases/download/v1/notes.alpineplugin')] }
    expect(await resolveRelease(RELEASE_URL, { fetchImpl: githubApi({ release }) })).toEqual({ ok: false, error: 'no-bundle' })
  })

  it('refuses a draft release', async () => {
    const release = { draft: true, assets: [bundleAsset()] }
    expect(await resolveRelease(RELEASE_URL, { fetchImpl: githubApi({ release }) })).toEqual({ ok: false, error: 'release-is-draft' })
  })

  it('says so when the release or its commit is missing', async () => {
    expect(await resolveRelease(RELEASE_URL, { fetchImpl: githubApi({ release: null }) })).toEqual({ ok: false, error: 'release-not-found' })
    expect(await resolveRelease(RELEASE_URL, { fetchImpl: githubApi({ commit: null }) })).toEqual({ ok: false, error: 'release-not-found' })
  })

  it('says GitHub is unavailable when it cannot be reached', async () => {
    expect(await resolveRelease(RELEASE_URL, { fetchImpl: githubApi({ failWith: new Error('offline') }) })).toEqual({ ok: false, error: 'github-unavailable' })
    const rateLimited = vi.fn(async () => new Response(null, { status: 403 }))
    expect(await resolveRelease(RELEASE_URL, { fetchImpl: rateLimited })).toEqual({ ok: false, error: 'github-unavailable' })
  })

  it('refuses a link before asking GitHub anything', async () => {
    const fetchImpl = githubApi()
    expect(await resolveRelease('https://example.com/x', { fetchImpl })).toEqual({ ok: false, error: 'bad-release-url' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('downloading the bundle', () => {
  const release = { owner: 'octo', repo: 'notes', tag: 'v1.2.0', commit: COMMIT, assetName: 'notes.alpineplugin', assetUrl: ASSET_URL, size: 4 }

  it('returns the bytes of the asset', async () => {
    const fetchImpl = vi.fn(async () => new Response(Buffer.from('ZIP!')))
    const result = await downloadReleaseBundle(release, { maxBytes: 1024, fetchImpl })
    expect(result.ok).toBe(true)
    expect(result.bundle.toString()).toBe('ZIP!')
    expect(fetchImpl.mock.calls[0][0]).toBe(ASSET_URL)
  })

  it('stops at the size cap', async () => {
    const fetchImpl = vi.fn(async () => new Response(Buffer.alloc(64)))
    expect(await downloadReleaseBundle({ ...release, size: null }, { maxBytes: 32, fetchImpl })).toEqual({ ok: false, error: 'too-large' })
    expect(await downloadReleaseBundle({ ...release, size: 64 }, { maxBytes: 32, fetchImpl })).toEqual({ ok: false, error: 'too-large' })
  })

  it('refuses an asset url outside the release', async () => {
    const fetchImpl = vi.fn()
    expect(await downloadReleaseBundle({ ...release, assetUrl: 'https://evil.example/notes.alpineplugin' }, { maxBytes: 32, fetchImpl })).toEqual({
      ok: false,
      error: 'no-bundle',
    })
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
