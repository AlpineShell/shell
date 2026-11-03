const UPDATE_CHANNELS = ['stable', 'nightly']
const FEED_NAME_BY_CHANNEL = { stable: 'latest', nightly: 'nightly' }
const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/
const NIGHTLY_PRERELEASE_PATTERN = /^nightly\.\d{8}\.\d+$/
const FIRST_DATE_BASED_MINOR = 20000000

function parseVersion(version) {
  const match = typeof version === 'string' ? version.trim().match(VERSION_PATTERN) : null
  if (!match) return null
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split('.') : [],
  }
}

function isVersion(value) {
  return parseVersion(value) !== null
}

function isUpdateChannel(value) {
  return UPDATE_CHANNELS.includes(value)
}

function isDateBasedVersion(version) {
  const parsed = parseVersion(version)
  return Boolean(parsed) && parsed.major === 0 && parsed.minor >= FIRST_DATE_BASED_MINOR && parsed.prerelease.length === 0
}

function isNightlyVersion(version) {
  const parsed = parseVersion(version)
  return Boolean(parsed) && NIGHTLY_PRERELEASE_PATTERN.test(parsed.prerelease.join('.'))
}

function isStableVersion(version) {
  const parsed = parseVersion(version)
  return Boolean(parsed) && parsed.prerelease.length === 0
}

function channelOfVersion(version) {
  return isNightlyVersion(version) ? 'nightly' : 'stable'
}

function feedNameForChannel(channel) {
  return FEED_NAME_BY_CHANNEL[channel] ?? FEED_NAME_BY_CHANNEL.stable
}

function comparePrereleaseIdentifiers(a, b) {
  if (a.length === 0 || b.length === 0) return b.length - a.length
  const length = Math.max(a.length, b.length)
  for (let index = 0; index < length; index++) {
    if (a[index] === undefined) return -1
    if (b[index] === undefined) return 1
    const numericA = /^\d+$/.test(a[index])
    const numericB = /^\d+$/.test(b[index])
    if (numericA && numericB) {
      const difference = Number(a[index]) - Number(b[index])
      if (difference !== 0) return Math.sign(difference)
    } else if (numericA !== numericB) {
      return numericA ? -1 : 1
    } else if (a[index] !== b[index]) {
      return a[index] < b[index] ? -1 : 1
    }
  }
  return 0
}

function compareVersions(a, b) {
  const dateBasedA = isDateBasedVersion(a)
  const dateBasedB = isDateBasedVersion(b)
  if (dateBasedA !== dateBasedB) return dateBasedA ? -1 : 1
  const parsedA = parseVersion(a)
  const parsedB = parseVersion(b)
  if (!parsedA || !parsedB) return parsedA ? 1 : parsedB ? -1 : 0
  for (const segment of ['major', 'minor', 'patch']) {
    if (parsedA[segment] !== parsedB[segment]) return Math.sign(parsedA[segment] - parsedB[segment])
  }
  return comparePrereleaseIdentifiers(parsedA.prerelease, parsedB.prerelease)
}

module.exports = {
  UPDATE_CHANNELS,
  channelOfVersion,
  compareVersions,
  feedNameForChannel,
  isDateBasedVersion,
  isNightlyVersion,
  isStableVersion,
  isUpdateChannel,
  isVersion,
}
