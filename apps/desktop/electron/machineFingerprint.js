const crypto = require('crypto')
const { execFileSync } = require('child_process')
const { regQuery } = require('./registryRead')
const { MACHINE_GUID_KEY, MACHINE_GUID_VALUE, isMachineGuid } = require('./deviceIdentity')

const MACHINE_FINGERPRINT_PREFIX = 'alpine-shell-binding:machine:'
const HARDWARE_IDS_SEPARATOR = '|'
const HARDWARE_IDS_TIMEOUT_MS = 15000
const HARDWARE_IDS_SCRIPT = [
  "$ErrorActionPreference = 'SilentlyContinue'",
  "$drive = $env:SystemDrive",
  "$serial = (Get-CimInstance -ClassName Win32_LogicalDisk -Filter \"DeviceID='$drive'\").VolumeSerialNumber",
  '$uuid = (Get-CimInstance -ClassName Win32_ComputerSystemProduct).UUID',
  '"$serial|$uuid"',
].join('; ')

function cleanIdentifier(value) {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  return trimmed.length > 0 ? trimmed : null
}

function machineFingerprintHash({ machineGuid, volumeSerial, smbiosUuid }) {
  const guid = cleanIdentifier(machineGuid)
  const serial = cleanIdentifier(volumeSerial)
  const uuid = cleanIdentifier(smbiosUuid)
  if (!guid || !serial || !uuid) return null
  const material = [guid.toLowerCase(), serial.toUpperCase(), uuid.toUpperCase()].join(HARDWARE_IDS_SEPARATOR)
  return crypto.createHash('sha256').update(MACHINE_FINGERPRINT_PREFIX + material).digest('base64url')
}

function parseHardwareIds(output) {
  const line = String(output || '').split(/\r?\n/).map((entry) => entry.trim()).find((entry) => entry.includes(HARDWARE_IDS_SEPARATOR))
  if (!line) return { volumeSerial: null, smbiosUuid: null }
  const separator = line.indexOf(HARDWARE_IDS_SEPARATOR)
  return {
    volumeSerial: cleanIdentifier(line.slice(0, separator)),
    smbiosUuid: cleanIdentifier(line.slice(separator + 1)),
  }
}

function readHardwareIdsWithPowerShell() {
  const output = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', HARDWARE_IDS_SCRIPT], {
    windowsHide: true,
    encoding: 'utf8',
    timeout: HARDWARE_IDS_TIMEOUT_MS,
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  return parseHardwareIds(output)
}

function readMachineFingerprint({ readRegistryValue = regQuery, readHardwareIds = readHardwareIdsWithPowerShell } = {}) {
  try {
    const machineGuid = readRegistryValue(MACHINE_GUID_KEY, MACHINE_GUID_VALUE)
    if (!isMachineGuid(machineGuid)) return null
    const { volumeSerial, smbiosUuid } = readHardwareIds()
    return machineFingerprintHash({ machineGuid, volumeSerial, smbiosUuid })
  } catch {
    return null
  }
}

function createMachineFingerprintProvider(reads = {}) {
  let remembered = undefined
  return {
    fingerprint() {
      if (remembered === undefined) remembered = readMachineFingerprint(reads)
      return remembered
    },
  }
}

module.exports = {
  MACHINE_FINGERPRINT_PREFIX,
  HARDWARE_IDS_SCRIPT,
  machineFingerprintHash,
  parseHardwareIds,
  readHardwareIdsWithPowerShell,
  readMachineFingerprint,
  createMachineFingerprintProvider,
}
