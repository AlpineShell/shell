const crypto = require('crypto')
const os = require('os')
const { regQuery } = require('./registryRead')

const MACHINE_GUID_KEY = 'HKLM\\SOFTWARE\\Microsoft\\Cryptography'
const MACHINE_GUID_VALUE = 'MachineGuid'
const DEVICE_ID_PREFIX = 'alpine-shell:'
const DEVICE_NAME_MAX_LENGTH = 64
const FALLBACK_DEVICE_NAME = 'Windows PC'
const MACHINE_GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isMachineGuid(value) {
  return typeof value === 'string' && MACHINE_GUID_PATTERN.test(value.trim())
}

function hashMachineGuid(machineGuid) {
  if (!isMachineGuid(machineGuid)) return null
  return crypto.createHash('sha256').update(DEVICE_ID_PREFIX + machineGuid.trim()).digest('hex')
}

function readDeviceId(readRegistryValue = regQuery) {
  try {
    return hashMachineGuid(readRegistryValue(MACHINE_GUID_KEY, MACHINE_GUID_VALUE))
  } catch {
    return null
  }
}

function capDeviceName(hostname) {
  const name = typeof hostname === 'string' ? hostname.trim() : ''
  if (!name) return FALLBACK_DEVICE_NAME
  return name.slice(0, DEVICE_NAME_MAX_LENGTH)
}

function readDeviceName(hostname = os.hostname) {
  try {
    return capDeviceName(hostname())
  } catch {
    return FALLBACK_DEVICE_NAME
  }
}

module.exports = {
  MACHINE_GUID_KEY,
  MACHINE_GUID_VALUE,
  DEVICE_ID_PREFIX,
  DEVICE_NAME_MAX_LENGTH,
  FALLBACK_DEVICE_NAME,
  isMachineGuid,
  hashMachineGuid,
  readDeviceId,
  capDeviceName,
  readDeviceName,
}
