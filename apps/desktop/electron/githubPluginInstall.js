const crypto = require('crypto')
const { resolveRelease, downloadReleaseBundle } = require('./githubPluginRelease')
const { githubTrust } = require('./pluginTrust')

const PENDING_TTL_MS = 15 * 60 * 1000

function confirmationOf(release) {
  const { owner, repo, tag, commit, assetName, size } = release
  return { owner, repo, tag, commit, assetName, size }
}

function installConflict(existingSource) {
  return existingSource && existingSource !== 'github' ? 'already-installed' : null
}

function createGithubInstaller({
  installBundle,
  maxBytes,
  sourceOf,
  recordTrust,
  fetchImpl = (...args) => fetch(...args),
  now = () => Date.now(),
}) {
  const pending = new Map()

  function forgetExpired() {
    const time = now()
    for (const [token, entry] of pending) if (entry.expiresAt <= time) pending.delete(token)
  }

  async function resolve(releaseUrl) {
    const result = await resolveRelease(releaseUrl, { fetchImpl })
    if (!result.ok) return result
    forgetExpired()
    const token = crypto.randomUUID()
    pending.set(token, { release: result.release, expiresAt: now() + PENDING_TTL_MS })
    return { ok: true, token, release: confirmationOf(result.release) }
  }

  async function install(token, { pluginsDir, withPluginStopped, onChange } = {}) {
    forgetExpired()
    const entry = typeof token === 'string' ? pending.get(token) : undefined
    if (!entry) return { ok: false, error: 'expired' }
    pending.delete(token)
    const { release } = entry
    const download = await downloadReleaseBundle(release, { maxBytes, fetchImpl })
    if (!download.ok) return download
    const sha256 = crypto.createHash('sha256').update(download.bundle).digest('hex')
    const installed = await installBundle(download.bundle, {
      pluginsDir,
      withPluginStopped,
      accept: ({ id }) => installConflict(sourceOf(id)),
    })
    if (!installed.ok) return installed
    const repository = `${release.owner}/${release.repo}`
    recordTrust(installed.id, githubTrust({ repository, tag: release.tag, commit: release.commit, sha256 }))
    if (typeof onChange === 'function') onChange()
    return { ok: true, id: installed.id, version: installed.version, repository, tag: release.tag, commit: release.commit, sha256 }
  }

  return { resolve, install }
}

module.exports = { createGithubInstaller, installConflict, PENDING_TTL_MS }
