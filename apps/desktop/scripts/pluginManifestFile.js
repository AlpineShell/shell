const fs = require('node:fs')
const path = require('node:path')

const SAFE_ID = /^[a-z0-9][a-z0-9._-]*$/
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/

function readManifestFile(pluginDir) {
  const manifestPath = path.join(pluginDir, 'plugin.json')
  if (!fs.existsSync(manifestPath)) throw new Error(`No plugin.json found in ${pluginDir}`)
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/, ''))
  } catch (error) {
    throw new Error(`Invalid plugin.json: ${error.message}`)
  }
}

function assertPluginId(id) {
  if (typeof id !== 'string' || !SAFE_ID.test(id)) throw new Error(`Invalid plugin id "${id}" (expected lowercase reverse-DNS)`)
}

function assertPluginVersion(version) {
  if (typeof version !== 'string' || !SEMVER.test(version)) {
    throw new Error(`Invalid or missing version "${version}" (expected strict semver)`)
  }
}

module.exports = { readManifestFile, assertPluginId, assertPluginVersion }
