const { S3Client } = require('@aws-sdk/client-s3')

function isR2Endpoint(endpoint) {
  try {
    return /\.r2\.cloudflarestorage\.com$/.test(new URL(endpoint).host)
  } catch {
    return false
  }
}

function readStorageEnv() {
  const e = process.env
  const endpoint =
    e.STORAGE_ENDPOINT ||
    (e.R2_ACCOUNT_ID ? `https://${e.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : undefined)
  const usingR2 = !e.STORAGE_ENDPOINT || (endpoint ? isR2Endpoint(endpoint) : false)
  const cfg = {
    endpoint,
    region: e.STORAGE_REGION || (usingR2 ? 'auto' : 'us-east-1'),
    accessKeyId: e.STORAGE_ACCESS_KEY_ID || e.R2_ACCESS_KEY_ID,
    secretAccessKey: e.STORAGE_SECRET_ACCESS_KEY || e.R2_SECRET_ACCESS_KEY,
    bucket: e.STORAGE_BUCKET || e.R2_BUCKET,
    publicUrl: e.STORAGE_PUBLIC_URL,
    forcePathStyle:
      e.STORAGE_FORCE_PATH_STYLE === 'true' || (!!endpoint && !isR2Endpoint(endpoint) && !!e.STORAGE_ENDPOINT),
  }
  const missing = ['endpoint', 'accessKeyId', 'secretAccessKey', 'bucket'].filter((k) => !cfg[k])
  if (missing.length > 0) {
    console.error(`Missing storage config: ${missing.join(', ')}`)
    process.exit(1)
  }
  return cfg
}

function createStorageClient(cfg) {
  return new S3Client({
    region: cfg.region,
    endpoint: cfg.endpoint,
    forcePathStyle: cfg.forcePathStyle,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  })
}

function publicUrlBase(cfg) {
  const base = cfg.publicUrl || process.env.STORAGE_PUBLIC_URL
  if (!base) return undefined
  return base.endsWith('/') ? base : `${base}/`
}

module.exports = { readStorageEnv, createStorageClient, publicUrlBase }
