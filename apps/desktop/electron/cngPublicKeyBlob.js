const crypto = require('crypto')

const BCRYPT_ECDSA_PUBLIC_P256_MAGIC = 0x31534345
const ECC_BLOB_HEADER_BYTES = 8
const P256_COORDINATE_BYTES = 32
const CHALLENGE_DIGEST_ALGORITHM = 'sha256'
const CNG_SIGNATURE_ENCODING = 'ieee-p1363'

function coordinatesFromEccBlob(blob) {
  if (!Buffer.isBuffer(blob) || blob.length < ECC_BLOB_HEADER_BYTES) return null
  if (blob.readUInt32LE(0) !== BCRYPT_ECDSA_PUBLIC_P256_MAGIC) return null
  const coordinateBytes = blob.readUInt32LE(4)
  if (coordinateBytes !== P256_COORDINATE_BYTES) return null
  if (blob.length !== ECC_BLOB_HEADER_BYTES + 2 * coordinateBytes) return null
  return {
    x: blob.subarray(ECC_BLOB_HEADER_BYTES, ECC_BLOB_HEADER_BYTES + coordinateBytes),
    y: blob.subarray(ECC_BLOB_HEADER_BYTES + coordinateBytes),
  }
}

function publicKeyFromEccBlob(blob) {
  const coordinates = coordinatesFromEccBlob(blob)
  if (!coordinates) return null
  try {
    return crypto.createPublicKey({
      key: { kty: 'EC', crv: 'P-256', x: coordinates.x.toString('base64url'), y: coordinates.y.toString('base64url') },
      format: 'jwk',
    })
  } catch {
    return null
  }
}

function eccBlobFromPublicKey(publicKey) {
  const jwk = publicKey.export({ format: 'jwk' })
  if (jwk.kty !== 'EC' || jwk.crv !== 'P-256') return null
  const header = Buffer.alloc(ECC_BLOB_HEADER_BYTES)
  header.writeUInt32LE(BCRYPT_ECDSA_PUBLIC_P256_MAGIC, 0)
  header.writeUInt32LE(P256_COORDINATE_BYTES, 4)
  return Buffer.concat([header, Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')])
}

function challengeDigest(challenge) {
  return crypto.createHash(CHALLENGE_DIGEST_ALGORITHM).update(challenge).digest()
}

function verifyChallengeSignature(publicKey, challenge, signature) {
  if (!publicKey || !Buffer.isBuffer(challenge) || !Buffer.isBuffer(signature)) return false
  try {
    return crypto.verify(CHALLENGE_DIGEST_ALGORITHM, challenge, { key: publicKey, dsaEncoding: CNG_SIGNATURE_ENCODING }, signature)
  } catch {
    return false
  }
}

module.exports = {
  BCRYPT_ECDSA_PUBLIC_P256_MAGIC,
  P256_COORDINATE_BYTES,
  publicKeyFromEccBlob,
  eccBlobFromPublicKey,
  challengeDigest,
  verifyChallengeSignature,
}
