const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const BINDING_SECRET_FILE_NAME = 'licence-binding.json'
const BINDING_SECRET_BYTES = 32

function electronSafeStorage() {
  return require('electron').safeStorage
}

function parseSealedRecord(text) {
  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' && typeof parsed.sealed === 'string' ? parsed : null
  } catch {
    return null
  }
}

function createBindingSecretStore({ filePath, fileSystem = fs, safeStorage = electronSafeStorage, randomBytes = crypto.randomBytes, log = () => undefined }) {
  function available() {
    try {
      return safeStorage().isEncryptionAvailable() === true
    } catch {
      return false
    }
  }

  function readSealed() {
    let text
    try {
      text = fileSystem.readFileSync(filePath(), 'utf8')
    } catch {
      return null
    }
    const record = parseSealedRecord(text)
    return record ? Buffer.from(record.sealed, 'base64') : null
  }

  function unseal() {
    const sealed = readSealed()
    if (!sealed || sealed.length === 0) return null
    try {
      const secret = Buffer.from(safeStorage().decryptString(sealed), 'base64')
      return secret.length === BINDING_SECRET_BYTES ? secret : null
    } catch {
      return null
    }
  }

  function writeSealed(sealed) {
    const file = filePath()
    fileSystem.mkdirSync(path.dirname(file), { recursive: true })
    const tempFile = `${file}.tmp`
    fileSystem.writeFileSync(tempFile, JSON.stringify({ sealed: sealed.toString('base64') }, null, 2))
    fileSystem.renameSync(tempFile, file)
  }

  function seal() {
    if (!available()) return null
    const secret = randomBytes(BINDING_SECRET_BYTES)
    try {
      writeSealed(safeStorage().encryptString(secret.toString('base64')))
      return secret
    } catch (error) {
      log(`could not seal the binding secret: ${error.message}`)
      return null
    }
  }

  function discard() {
    try {
      fileSystem.unlinkSync(filePath())
    } catch {
      void 0
    }
  }

  return { available, unseal, seal, discard }
}

module.exports = {
  BINDING_SECRET_FILE_NAME,
  BINDING_SECRET_BYTES,
  createBindingSecretStore,
}
