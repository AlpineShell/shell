const fs = require('fs')
const path = require('path')
const { PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand } = require('@aws-sdk/client-s3')
const { Upload } = require('@aws-sdk/lib-storage')
const { readStorageEnv, createStorageClient } = require('./storage')

const releaseDir = path.join(__dirname, '..', 'release')
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

publish()
