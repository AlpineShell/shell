const fs = require('fs')
const path = require('path')
const { createBindingLadder } = require('./licenceBinding')
const { createPlatformKeyProvider } = require('./platformCrypto')
const { createBindingSecretStore, BINDING_SECRET_FILE_NAME } = require('./bindingSecretStore')
const { createMachineFingerprintProvider } = require('./machineFingerprint')

function createLicenceBindingLadder({ userDataDirectory, fileSystem = fs, log = () => undefined }) {
  return createBindingLadder({
    tpm: createPlatformKeyProvider(),
    dpapi: createBindingSecretStore({ filePath: () => path.join(userDataDirectory(), BINDING_SECRET_FILE_NAME), fileSystem, log }),
    machine: createMachineFingerprintProvider(),
    log,
  })
}

module.exports = { createLicenceBindingLadder }
