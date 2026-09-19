const PLATFORM_CRYPTO_PROVIDER = 'Microsoft Platform Crypto Provider'
const ECDSA_P256_ALGORITHM = 'ECDSA_P256'
const ECC_PUBLIC_BLOB_TYPE = 'ECCPUBLICBLOB'
const LICENCE_BINDING_KEY_NAME = 'AlpineShell.LicenceBinding'
const NCRYPT_SILENT_FLAG = 0x40
const NCRYPT_OVERWRITE_KEY_FLAG = 0x80
const NO_LEGACY_KEY_SPEC = 0
const NO_HANDLE = 0n
const HANDLE_BYTES = 8
const SIZE_BYTES = 4
const STATUS_SUCCESS = 0

let loadedApi = null

function loadNcryptApi() {
  if (loadedApi) return loadedApi
  const koffi = require('koffi')
  const ncrypt = koffi.load('ncrypt.dll')
  loadedApi = {
    NCryptOpenStorageProvider: ncrypt.func('__stdcall', 'NCryptOpenStorageProvider', 'int32', ['void *', 'str16', 'uint32']),
    NCryptCreatePersistedKey: ncrypt.func('__stdcall', 'NCryptCreatePersistedKey', 'int32', ['uintptr_t', 'void *', 'str16', 'str16', 'uint32', 'uint32']),
    NCryptFinalizeKey: ncrypt.func('__stdcall', 'NCryptFinalizeKey', 'int32', ['uintptr_t', 'uint32']),
    NCryptOpenKey: ncrypt.func('__stdcall', 'NCryptOpenKey', 'int32', ['uintptr_t', 'void *', 'str16', 'uint32', 'uint32']),
    NCryptExportKey: ncrypt.func('__stdcall', 'NCryptExportKey', 'int32', ['uintptr_t', 'uintptr_t', 'str16', 'void *', 'void *', 'uint32', 'void *', 'uint32']),
    NCryptSignHash: ncrypt.func('__stdcall', 'NCryptSignHash', 'int32', ['uintptr_t', 'void *', 'void *', 'uint32', 'void *', 'uint32', 'void *', 'uint32']),
    NCryptDeleteKey: ncrypt.func('__stdcall', 'NCryptDeleteKey', 'int32', ['uintptr_t', 'uint32']),
    NCryptFreeObject: ncrypt.func('__stdcall', 'NCryptFreeObject', 'int32', ['uintptr_t']),
  }
  return loadedApi
}

function handleFrom(buffer) {
  return buffer.readBigUInt64LE(0)
}

function createPlatformKeyProvider({ keyName = LICENCE_BINDING_KEY_NAME, loadApi = loadNcryptApi } = {}) {
  function api() {
    try {
      return loadApi()
    } catch {
      return null
    }
  }

  function withProvider(work) {
    const ncrypt = api()
    if (!ncrypt) return null
    const providerOut = Buffer.alloc(HANDLE_BYTES)
    if (ncrypt.NCryptOpenStorageProvider(providerOut, PLATFORM_CRYPTO_PROVIDER, 0) !== STATUS_SUCCESS) return null
    const hProvider = handleFrom(providerOut)
    try {
      return work(ncrypt, hProvider)
    } finally {
      ncrypt.NCryptFreeObject(hProvider)
    }
  }

  function withOpenKey(work) {
    return withProvider((ncrypt, hProvider) => {
      const keyOut = Buffer.alloc(HANDLE_BYTES)
      if (ncrypt.NCryptOpenKey(hProvider, keyOut, keyName, NO_LEGACY_KEY_SPEC, NCRYPT_SILENT_FLAG) !== STATUS_SUCCESS) return null
      const hKey = handleFrom(keyOut)
      try {
        return work(ncrypt, hKey)
      } finally {
        ncrypt.NCryptFreeObject(hKey)
      }
    })
  }

  function exportPublicBlob(ncrypt, hKey) {
    const sizeOut = Buffer.alloc(SIZE_BYTES)
    if (ncrypt.NCryptExportKey(hKey, NO_HANDLE, ECC_PUBLIC_BLOB_TYPE, null, null, 0, sizeOut, 0) !== STATUS_SUCCESS) return null
    const size = sizeOut.readUInt32LE(0)
    const blob = Buffer.alloc(size)
    if (ncrypt.NCryptExportKey(hKey, NO_HANDLE, ECC_PUBLIC_BLOB_TYPE, null, blob, size, sizeOut, 0) !== STATUS_SUCCESS) return null
    return blob.subarray(0, sizeOut.readUInt32LE(0))
  }

  function signDigest(ncrypt, hKey, digest) {
    const sizeOut = Buffer.alloc(SIZE_BYTES)
    if (ncrypt.NCryptSignHash(hKey, null, digest, digest.length, null, 0, sizeOut, NCRYPT_SILENT_FLAG) !== STATUS_SUCCESS) return null
    const size = sizeOut.readUInt32LE(0)
    const signature = Buffer.alloc(size)
    if (ncrypt.NCryptSignHash(hKey, null, digest, digest.length, signature, size, sizeOut, NCRYPT_SILENT_FLAG) !== STATUS_SUCCESS) return null
    return signature.subarray(0, sizeOut.readUInt32LE(0))
  }

  function available() {
    return withProvider(() => true) === true
  }

  function publicBlob() {
    return withOpenKey(exportPublicBlob)
  }

  function createKey() {
    return withProvider((ncrypt, hProvider) => {
      const keyOut = Buffer.alloc(HANDLE_BYTES)
      const created = ncrypt.NCryptCreatePersistedKey(hProvider, keyOut, ECDSA_P256_ALGORITHM, keyName, NO_LEGACY_KEY_SPEC, NCRYPT_OVERWRITE_KEY_FLAG)
      if (created !== STATUS_SUCCESS) return null
      const hKey = handleFrom(keyOut)
      try {
        if (ncrypt.NCryptFinalizeKey(hKey, NCRYPT_SILENT_FLAG) !== STATUS_SUCCESS) return null
        return exportPublicBlob(ncrypt, hKey)
      } finally {
        ncrypt.NCryptFreeObject(hKey)
      }
    })
  }

  function sign(digest) {
    if (!Buffer.isBuffer(digest) || digest.length === 0) return null
    return withOpenKey((ncrypt, hKey) => signDigest(ncrypt, hKey, digest))
  }

  function deleteKey() {
    return withProvider((ncrypt, hProvider) => {
      const keyOut = Buffer.alloc(HANDLE_BYTES)
      if (ncrypt.NCryptOpenKey(hProvider, keyOut, keyName, NO_LEGACY_KEY_SPEC, NCRYPT_SILENT_FLAG) !== STATUS_SUCCESS) return false
      return ncrypt.NCryptDeleteKey(handleFrom(keyOut), 0) === STATUS_SUCCESS
    }) === true
  }

  return { available, publicBlob, createKey, sign, deleteKey }
}

module.exports = {
  PLATFORM_CRYPTO_PROVIDER,
  ECDSA_P256_ALGORITHM,
  LICENCE_BINDING_KEY_NAME,
  createPlatformKeyProvider,
}
