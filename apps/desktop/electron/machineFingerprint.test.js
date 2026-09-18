import { describe, expect, it, vi } from 'vitest'
import crypto from 'crypto'

const {
  MACHINE_FINGERPRINT_PREFIX,
  HARDWARE_IDS_SCRIPT,
  machineFingerprintHash,
  parseHardwareIds,
  readMachineFingerprint,
  createMachineFingerprintProvider,
} = await import('./machineFingerprint.js')
const { MACHINE_GUID_KEY, MACHINE_GUID_VALUE } = await import('./deviceIdentity.js')

const MACHINE_GUID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301'
const VOLUME_SERIAL = '1A2B3C4D'
const SMBIOS_UUID = '4C4C4544-0059-4B10-8052-B4C04F503732'
const IDS = { machineGuid: MACHINE_GUID, volumeSerial: VOLUME_SERIAL, smbiosUuid: SMBIOS_UUID }

function expectedHash({ machineGuid, volumeSerial, smbiosUuid }) {
  return crypto.createHash('sha256').update(`${MACHINE_FINGERPRINT_PREFIX}${machineGuid}|${volumeSerial}|${smbiosUuid}`).digest('base64url')
}

describe('the machine fingerprint', () => {
  it('hashes the MachineGuid, the system volume serial and the SMBIOS UUID together as base64url sha256', () => {
    expect(machineFingerprintHash(IDS)).toBe(expectedHash(IDS))
    expect(machineFingerprintHash(IDS)).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })

  it('changes when any one of the three changes', () => {
    const base = machineFingerprintHash(IDS)
    expect(machineFingerprintHash({ ...IDS, machineGuid: '00000000-0000-0000-0000-000000000000' })).not.toBe(base)
    expect(machineFingerprintHash({ ...IDS, volumeSerial: 'FFFFFFFF' })).not.toBe(base)
    expect(machineFingerprintHash({ ...IDS, smbiosUuid: '00000000-0000-0000-0000-000000000001' })).not.toBe(base)
  })

  it('is stable across whitespace and letter case in the raw values', () => {
    const base = machineFingerprintHash(IDS)
    expect(machineFingerprintHash({ machineGuid: ` ${MACHINE_GUID.toUpperCase()}\r\n`, volumeSerial: ` ${VOLUME_SERIAL.toLowerCase()} `, smbiosUuid: SMBIOS_UUID.toLowerCase() })).toBe(base)
  })

  it('refuses to hash when any value is missing, so a partial identity never binds', () => {
    expect(machineFingerprintHash({ ...IDS, machineGuid: null })).toBeNull()
    expect(machineFingerprintHash({ ...IDS, volumeSerial: '' })).toBeNull()
    expect(machineFingerprintHash({ ...IDS, smbiosUuid: '   ' })).toBeNull()
    expect(machineFingerprintHash({})).toBeNull()
  })
})

describe('the hardware id read', () => {
  it('asks PowerShell for the system drive serial and the SMBIOS UUID through Get-CimInstance, never wmic', () => {
    expect(HARDWARE_IDS_SCRIPT).toContain('Get-CimInstance -ClassName Win32_LogicalDisk')
    expect(HARDWARE_IDS_SCRIPT).toContain('$env:SystemDrive')
    expect(HARDWARE_IDS_SCRIPT).toContain('Get-CimInstance -ClassName Win32_ComputerSystemProduct')
    expect(HARDWARE_IDS_SCRIPT.toLowerCase()).not.toContain('wmic')
  })

  it('parses the serial and UUID line and tolerates surrounding output', () => {
    expect(parseHardwareIds(`\r\n${VOLUME_SERIAL}|${SMBIOS_UUID}\r\n`)).toEqual({ volumeSerial: VOLUME_SERIAL, smbiosUuid: SMBIOS_UUID })
    expect(parseHardwareIds(`|${SMBIOS_UUID}`)).toEqual({ volumeSerial: null, smbiosUuid: SMBIOS_UUID })
    expect(parseHardwareIds('')).toEqual({ volumeSerial: null, smbiosUuid: null })
    expect(parseHardwareIds(undefined)).toEqual({ volumeSerial: null, smbiosUuid: null })
  })
})

describe('reading the fingerprint', () => {
  it('combines the registry MachineGuid with the PowerShell ids', () => {
    const readRegistryValue = vi.fn(() => MACHINE_GUID)
    const readHardwareIds = vi.fn(() => ({ volumeSerial: VOLUME_SERIAL, smbiosUuid: SMBIOS_UUID }))
    expect(readMachineFingerprint({ readRegistryValue, readHardwareIds })).toBe(expectedHash(IDS))
    expect(readRegistryValue).toHaveBeenCalledWith(MACHINE_GUID_KEY, MACHINE_GUID_VALUE)
  })

  it('returns null when the MachineGuid is not a GUID, an id is missing or a read throws', () => {
    const readHardwareIds = () => ({ volumeSerial: VOLUME_SERIAL, smbiosUuid: SMBIOS_UUID })
    expect(readMachineFingerprint({ readRegistryValue: () => 'ERROR: not found', readHardwareIds })).toBeNull()
    expect(readMachineFingerprint({ readRegistryValue: () => MACHINE_GUID, readHardwareIds: () => ({ volumeSerial: null, smbiosUuid: SMBIOS_UUID }) })).toBeNull()
    expect(readMachineFingerprint({ readRegistryValue: () => MACHINE_GUID, readHardwareIds: () => { throw new Error('powershell blocked') } })).toBeNull()
  })

  it('reads the ids once per process through the provider', () => {
    const readHardwareIds = vi.fn(() => ({ volumeSerial: VOLUME_SERIAL, smbiosUuid: SMBIOS_UUID }))
    const provider = createMachineFingerprintProvider({ readRegistryValue: () => MACHINE_GUID, readHardwareIds })
    expect(provider.fingerprint()).toBe(expectedHash(IDS))
    expect(provider.fingerprint()).toBe(expectedHash(IDS))
    expect(readHardwareIds).toHaveBeenCalledTimes(1)
  })
})
