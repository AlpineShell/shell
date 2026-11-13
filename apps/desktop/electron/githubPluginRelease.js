const { readCappedBody } = require('./cappedBody')

const GITHUB_API = 'https://api.github.com'
const BUNDLE_EXTENSION = '.alpineplugin'
const REQUEST_TIMEOUT_MS = 10000
const DOWNLOAD_TIMEOUT_MS = 60000
const NAME_PART = /^[A-Za-z0-9_.-]+$/
const COMMIT_SHA = /^[0-9a-f]{40}$/

class GithubReleaseError extends Error {
  constructor(code) {
    super(code)
    this.code = code
  }
}

function parseReleaseUrl(value) {
  if (typeof value !== 'string') return null
  let url
  try {
    url = new URL(value.trim())
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'github.com') return null
  const parts = url.pathname.split('/').filter(Boolean)
  if (parts.length < 5 || parts[2] !== 'releases' || parts[3] !== 'tag') return null
  const [owner, repo] = parts
  if (!NAME_PART.test(owner) || !NAME_PART.test(repo) || repo === '.' || repo === '..') return null
  let tag
  try {
    tag = parts.slice(4).map(decodeURIComponent).join('/')
  } catch {
    return null
  }
  if (!tag) return null
  return { owner, repo, tag }
}

function encodeRef(ref) {
  return ref.split('/').map(encodeURIComponent).join('/')
}

function githubHeaders() {
  return { Accept: 'application/vnd.github+json', 'User-Agent': 'Alpine-Shell', 'X-GitHub-Api-Version': '2022-11-28' }
}

async function withDeadline(ms, run) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await run(controller.signal)
  } finally {
    clearTimeout(timer)
  }
}

async function getJson(fetchImpl, url) {
  let res
  try {
    res = await withDeadline(REQUEST_TIMEOUT_MS, async (signal) => {
      const response = await fetchImpl(url, { signal, headers: githubHeaders(), redirect: 'follow' })
      return { status: response.status, ok: response.ok, body: response.ok ? await response.json() : null }
    })
  } catch {
    throw new GithubReleaseError('github-unavailable')
  }
  if (res.status === 404) return null
  if (!res.ok) throw new GithubReleaseError('github-unavailable')
  return res.body
}

function bundleAssetsOf(release) {
  const assets = Array.isArray(release && release.assets) ? release.assets : []
  return assets.filter((asset) => asset && typeof asset.name === 'string' && asset.name.toLowerCase().endsWith(BUNDLE_EXTENSION))
}

function isOwnDownloadUrl(value, owner, repo) {
  if (typeof value !== 'string') return false
  let url
  try {
    url = new URL(value)
  } catch {
    return false
  }
  return (
    url.protocol === 'https:' &&
    url.hostname.toLowerCase() === 'github.com' &&
    url.pathname.toLowerCase().startsWith(`/${owner}/${repo}/releases/download/`.toLowerCase())
  )
}

async function resolveRelease(releaseUrl, { fetchImpl = (...args) => fetch(...args) } = {}) {
  const parsed = parseReleaseUrl(releaseUrl)
  if (!parsed) return { ok: false, error: 'bad-release-url' }
  const { owner, repo, tag } = parsed
  const repoPath = `${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
  try {
    const release = await getJson(fetchImpl, `${repoPath}/releases/tags/${encodeRef(tag)}`)
    if (!release) return { ok: false, error: 'release-not-found' }
    if (release.draft === true) return { ok: false, error: 'release-is-draft' }
    const bundles = bundleAssetsOf(release)
    if (bundles.length === 0) return { ok: false, error: 'no-bundle' }
    if (bundles.length > 1) return { ok: false, error: 'several-bundles' }
    const asset = bundles[0]
    if (!isOwnDownloadUrl(asset.browser_download_url, owner, repo)) return { ok: false, error: 'no-bundle' }
    const commit = await getJson(fetchImpl, `${repoPath}/commits/${encodeRef(tag)}`)
    const sha = commit && typeof commit.sha === 'string' ? commit.sha.toLowerCase() : null
    if (!sha || !COMMIT_SHA.test(sha)) return { ok: false, error: 'release-not-found' }
    return {
      ok: true,
      release: {
        owner,
        repo,
        tag,
        commit: sha,
        assetName: asset.name,
        assetUrl: asset.browser_download_url,
        size: typeof asset.size === 'number' ? asset.size : null,
      },
    }
  } catch (e) {
    if (e instanceof GithubReleaseError) return { ok: false, error: e.code }
    return { ok: false, error: 'github-unavailable' }
  }
}

async function downloadReleaseBundle(release, { maxBytes, fetchImpl = (...args) => fetch(...args) }) {
  if (!release || !isOwnDownloadUrl(release.assetUrl, release.owner, release.repo)) return { ok: false, error: 'no-bundle' }
  if (typeof release.size === 'number' && release.size > maxBytes) return { ok: false, error: 'too-large' }
  let body
  try {
    body = await withDeadline(DOWNLOAD_TIMEOUT_MS, async (signal) => {
      const res = await fetchImpl(release.assetUrl, { signal, redirect: 'follow', headers: { 'User-Agent': 'Alpine-Shell' } })
      if (!res.ok) throw new Error(`http-${res.status}`)
      return readCappedBody(res, maxBytes)
    })
  } catch (e) {
    return { ok: false, error: 'download-failed', detail: String((e && e.message) || e) }
  }
  if (body === null) return { ok: false, error: 'too-large' }
  if (body.length === 0) return { ok: false, error: 'empty-bundle' }
  return { ok: true, bundle: body }
}

module.exports = { parseReleaseUrl, resolveRelease, downloadReleaseBundle }
