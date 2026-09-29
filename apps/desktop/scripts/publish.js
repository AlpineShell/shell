const fs = require('fs')
const path = require('path')
const { PutObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectCommand } = require('@aws-sdk/client-s3')
const { Upload } = require('@aws-sdk/lib-storage')
const { readStorageEnv, createStorageClient } = require('./storage')

const appDir = path.join(__dirname, '..')
const releaseDir = path.join(appDir, 'release')
const licenceConfigPath = path.join(appDir, 'electron', 'licenceConfig.generated.js')
const appUpdateConfigPath = path.join(releaseDir, 'win-unpacked', 'resources', 'app-update.yml')
const feedManifestKey = 'latest.yml'
const uploadExtensions = ['.exe', '.exe.blockmap', '.yml']
const installerKeyPattern = /^Alpine Shell Setup (.+)\.exe$/
const versionsToKeep = 5

function isUploadable(fileName) {
  return uploadExtensions.some((extension) => fileName.endsWith(extension))
}

function contentTypeFor(fileName) {
  return fileName.endsWith('.yml') ? 'text/yaml' : 'application/octet-stream'
}

function cacheControlFor(fileName) {
  if (fileName.endsWith('.yml')) return 'no-cache'
  if (fileName.endsWith('.exe') || fileName.endsWith('.exe.blockmap')) return 'public, max-age=31536000, immutable'
  return undefined
}

function collectArtifacts() {
  if (!fs.existsSync(releaseDir)) {
    console.error(`Release directory not found: ${releaseDir}`)
    process.exit(1)
  }
  return fs
    .readdirSync(releaseDir)
    .filter((fileName) => isUploadable(fileName) && fs.statSync(path.join(releaseDir, fileName)).isFile())
}

async function uploadArtifact(client, bucket, fileName) {
  const filePath = path.join(releaseDir, fileName)
  const params = {
    Bucket: bucket,
    Key: fileName,
    ContentType: contentTypeFor(fileName),
    CacheControl: cacheControlFor(fileName),
  }
  if (fileName.endsWith('.exe')) {
    const upload = new Upload({ client, params: { ...params, Body: fs.createReadStream(filePath) } })
    await upload.done()
  } else {
    await client.send(new PutObjectCommand({ ...params, Body: fs.readFileSync(filePath) }))
  }
  console.log(`Uploaded ${fileName}`)
}

function compareVersionsDescending(a, b) {
  const segmentsA = a.split('.').map((segment) => parseInt(segment, 10) || 0)
  const segmentsB = b.split('.').map((segment) => parseInt(segment, 10) || 0)
  const length = Math.max(segmentsA.length, segmentsB.length)
  for (let index = 0; index < length; index++) {
    const valueA = segmentsA[index] || 0
    const valueB = segmentsB[index] || 0
    if (valueA !== valueB) return valueB - valueA
  }
  return 0
}

function manifestVersion(manifestText) {
  if (typeof manifestText !== 'string') return null
  const match = manifestText.match(/^version:\s*['"]?([^'"\s]+)['"]?\s*$/m)
  return match ? match[1] : null
}

function licenceKeyIds(licenceConfig) {
  const publicKeys = licenceConfig && Array.isArray(licenceConfig.publicKeys) ? licenceConfig.publicKeys : []
  return publicKeys.map((key) => key && key.kid).filter(Boolean)
}

function pointsAtFeed(appUpdateConfig, feedUrl) {
  if (typeof appUpdateConfig !== 'string') return false
  return appUpdateConfig.split(/\r?\n/).some((line) => line.trim() === `url: ${feedUrl}`)
}

function releaseReadinessProblems({ licenceConfig, appUpdateConfig, feedUrl, releaseVersion, feedVersion }) {
  const problems = []
  if (!licenceConfig || licenceConfig.isReleaseBuild !== true || licenceKeyIds(licenceConfig).length === 0) {
    problems.push('electron/licenceConfig.generated.js is not a release build with at least one licence key; bake it with ALPINE_RELEASE_BUILD=1 and ALPINE_LICENCE_PUBLIC_KEYS set')
  }
  if (!pointsAtFeed(appUpdateConfig, feedUrl)) {
    problems.push(`release/win-unpacked/resources/app-update.yml does not point at ${feedUrl}`)
  }
  if (!releaseVersion) {
    problems.push(`release/${feedManifestKey} names no version`)
  } else if (feedVersion && compareVersionsDescending(releaseVersion, feedVersion) >= 0) {
    problems.push(`version ${releaseVersion} is not newer than ${feedVersion}, which the update feed already offers`)
  }
  return problems
}

function readTextOrNull(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8')
  } catch {
    return null
  }
}

function readLicenceConfig() {
  try {
    return require(licenceConfigPath)
  } catch {
    return null
  }
}

async function readFeedVersion(client, bucket) {
  try {
    const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: feedManifestKey }))
    return manifestVersion(await response.Body.transformToString())
  } catch (error) {
    if (error.name === 'NoSuchKey' || (error.$metadata && error.$metadata.httpStatusCode === 404)) return null
    throw error
  }
}

async function refuseUnlessReadyToPublish(client, bucket) {
  let feedVersion
  try {
    feedVersion = await readFeedVersion(client, bucket)
  } catch (error) {
    console.error(`Could not read ${feedManifestKey} from bucket ${bucket}: ${error.message}`)
    process.exit(1)
  }
  const problems = releaseReadinessProblems({
    licenceConfig: readLicenceConfig(),
    appUpdateConfig: readTextOrNull(appUpdateConfigPath),
    feedUrl: require('../package.json').build.publish.url,
    releaseVersion: manifestVersion(readTextOrNull(path.join(releaseDir, feedManifestKey))),
    feedVersion,
  })
  if (problems.length === 0) return
  for (const problem of problems) console.error(`Refusing to publish: ${problem}`)
  process.exit(1)
}

async function listInstallerVersions(client, bucket) {
  const versions = []
  let continuationToken
  do {
    const response = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: continuationToken })
    )
    for (const object of response.Contents || []) {
      const match = object.Key.match(installerKeyPattern)
      if (match) versions.push(match[1])
    }
    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined
  } while (continuationToken)
  return versions
}

async function pruneOldReleases(client, bucket, keepCount) {
  const staleVersions = (await listInstallerVersions(client, bucket))
    .sort(compareVersionsDescending)
    .slice(keepCount)

  for (const version of staleVersions) {
    for (const key of [`Alpine Shell Setup ${version}.exe`, `Alpine Shell Setup ${version}.exe.blockmap`]) {
      try {
        await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
        console.log(`Pruned ${key}`)
      } catch (error) {
        console.error(`Failed to prune ${key}: ${error.message}`)
      }
    }
  }
}

async function publish() {
  const config = readStorageEnv()
  const client = createStorageClient(config)
  const artifacts = collectArtifacts()

  if (artifacts.length === 0) {
    console.error(`No uploadable artifacts found in ${releaseDir}`)
    process.exit(1)
  }

  await refuseUnlessReadyToPublish(client, config.bucket)

  const manifestFiles = artifacts.filter((fileName) => fileName.endsWith('.yml'))
  const binaryFiles = artifacts.filter((fileName) => !fileName.endsWith('.yml'))

  try {
    await Promise.all(binaryFiles.map((fileName) => uploadArtifact(client, config.bucket, fileName)))
  } catch (error) {
    console.error(`Failed to upload binaries: ${error.message}`)
    process.exit(1)
  }

  for (const fileName of manifestFiles) {
    try {
      await uploadArtifact(client, config.bucket, fileName)
    } catch (error) {
      console.error(`Failed to upload ${fileName}: ${error.message}`)
      process.exit(1)
    }
  }

  console.log(`Published ${artifacts.length} artifact(s) to bucket ${config.bucket}`)

  await pruneOldReleases(client, config.bucket, versionsToKeep)
}

if (require.main === module) publish()

module.exports = { compareVersionsDescending, manifestVersion, releaseReadinessProblems }
