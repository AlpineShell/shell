const fs = require('node:fs')
const path = require('node:path')
const { packBundle } = require('./pluginBundle')
const { readManifestFile, assertPluginId, assertPluginVersion } = require('./pluginManifestFile')
const { publishBundle } = require('./pluginPublisher')
const { resolveSigningKey } = require('./pluginSigning')
const { createStorage } = require('./pluginStorage')

function firstPartyManifest(pluginDir) {
  const manifest = readManifestFile(pluginDir)
  const basename = path.basename(pluginDir)
  const id = manifest.id || basename
  assertPluginId(id)
  if (id !== basename) throw new Error(`Plugin id "${id}" must match folder name "${basename}"`)
  assertPluginVersion(manifest.version)
  return { ...manifest, id }
}

async function publishPlugin(pluginDir) {
  const resolved = path.resolve(pluginDir)
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new Error(`Plugin directory not found: ${resolved}`)
  }
  const manifest = firstPartyManifest(resolved)
  const signingKey = resolveSigningKey()
  const storage = createStorage()
  const { bundle } = packBundle(resolved)
  const latest = await publishBundle({ storage, pluginDir: resolved, bundle, manifest, signingKey })
  console.log(`Published ${latest.id}@${latest.version} (${latest.size} bytes, signed)`)
}

function fail(message) {
  console.error(message)
  process.exit(1)
}

const pluginDir = process.argv[2]
if (!pluginDir) fail('Usage: node scripts/publishPlugin.js <pluginDir>')
publishPlugin(pluginDir).catch((error) => fail(error.message))
