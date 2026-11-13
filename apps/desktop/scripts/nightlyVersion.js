const releaseVersions = require('../electron/releaseVersions')

const FIRST_STABLE_VERSION = '1.0.0'

function versionOfTag(tag) {
  return tag.trim().replace(/^v/, '')
}

function newestVersion(versions) {
  return versions.reduce((newest, version) => (newest === null || releaseVersions.compareVersions(version, newest) > 0 ? version : newest), null)
}

function nightlyBaseVersion(versions) {
  const stableVersions = versions.filter((version) => releaseVersions.isStableVersion(version) && !releaseVersions.isDateBasedVersion(version))
  const latestStable = newestVersion(stableVersions)
  if (!latestStable) return FIRST_STABLE_VERSION
  const [major, minor, patch] = latestStable.split('.').map(Number)
  return `${major}.${minor}.${patch + 1}`
}

function utcDateStamp(date) {
  return date.toISOString().slice(0, 10).replace(/-/g, '')
}

function nextNightly(tags, date) {
  const versions = tags.map(versionOfTag).filter(releaseVersions.isVersion)
  const base = nightlyBaseVersion(versions)
  const prefix = `${base}-nightly.${utcDateStamp(date)}.`
  const buildsToday = versions.filter((version) => version.startsWith(prefix)).map((version) => Number(version.slice(prefix.length)))
  const build = buildsToday.length === 0 ? 0 : Math.max(...buildsToday) + 1
  const previous = newestVersion(versions)
  return { version: `${prefix}${build}`, previousTag: previous ? `v${previous}` : '' }
}

function readStandardInput() {
  return require('fs').readFileSync(0, 'utf8')
}

if (require.main === module) {
  const tags = readStandardInput().split(/\r?\n/).filter((line) => line.trim() !== '')
  const { version, previousTag } = nextNightly(tags, new Date())
  console.log(`${version} ${previousTag}`.trim())
}

module.exports = { nextNightly }
