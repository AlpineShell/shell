const fs = require('fs')
const path = require('path')
const { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand } = require('@aws-sdk/client-s3')

const requiredEnvVars = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET']
const releaseDir = path.join(__dirname, '..', 'release')
const uploadExtensions = ['.exe', '.exe.blockmap', '.yml']
const installerKeyPattern = /^Alpine Shell Setup (.+)\.exe$/
const versionsToKeep = 2

function readEnv() {
  const missing = requiredEnvVars.filter((name) => !process.env[name])
  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(', ')}`)
    process.exit(1)
  }
  return {
    accountId: process.env.R2_ACCOUNT_ID,
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    bucket: process.env.R2_BUCKET,
  }
}

function createClient(config) {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  })
}

function isUploadable(fileName) {
  return uploadExtensions.some((extension) => fileName.endsWith(extension))
}

function contentTypeFor(fileName) {
  return fileName.endsWith('.yml') ? 'text/yaml' : 'application/octet-stream'
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
  const body = fs.readFileSync(path.join(releaseDir, fileName))
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: fileName,
      Body: body,
      ContentType: contentTypeFor(fileName),
    })
  )
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
  const config = readEnv()
  const client = createClient(config)
  const artifacts = collectArtifacts()

  if (artifacts.length === 0) {
    console.error(`No uploadable artifacts found in ${releaseDir}`)
    process.exit(1)
  }

  for (const fileName of artifacts) {
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
