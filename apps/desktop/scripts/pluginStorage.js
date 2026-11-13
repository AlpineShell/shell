const fs = require('node:fs')
const path = require('node:path')

function localObjectPath(storeDir, key) {
  const root = path.resolve(storeDir)
  const segments = typeof key === 'string' ? key.split('/') : []
  if (segments.length === 0 || segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error(`Unsafe storage key: ${key}`)
  }
  return path.join(root, ...segments)
}

function createLocalStorage(storeDir) {
  return {
    async put(key, body) {
      const target = localObjectPath(storeDir, key)
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, body)
      console.log(`Wrote ${key}`)
    },
    async get(key) {
      const target = localObjectPath(storeDir, key)
      return fs.existsSync(target) ? fs.readFileSync(target) : null
    },
  }
}

function isMissingObject(error) {
  return error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404
}

function createBucketStorage() {
  const { PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3')
  const { readStorageEnv, createStorageClient } = require('./storage')
  const config = readStorageEnv()
  const client = createStorageClient(config)
  return {
    async put(key, body, contentType, cacheControl) {
      await client.send(
        new PutObjectCommand({ Bucket: config.bucket, Key: key, Body: body, ContentType: contentType, CacheControl: cacheControl })
      )
      console.log(`Uploaded ${key}`)
    },
    async get(key) {
      try {
        const response = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }))
        return Buffer.from(await response.Body.transformToByteArray())
      } catch (error) {
        if (isMissingObject(error)) return null
        throw error
      }
    },
  }
}

function createStorage(storeDir) {
  return storeDir ? createLocalStorage(storeDir) : createBucketStorage()
}

async function getJson(storage, key) {
  const body = await storage.get(key)
  return body ? JSON.parse(body.toString('utf8')) : null
}

module.exports = { createStorage, getJson }
