import { describe, expect, it, vi } from 'vitest'
import crypto from 'crypto'

const {
  hashMachineGuid,
  readDeviceId,
  capDeviceName,
  readDeviceName,
  isMachineGuid,
  DEVICE_ID_PREFIX,
  DEVICE_NAME_MAX_LENGTH,
  FALLBACK_DEVICE_NAME,
  MACHINE_GUID_KEY,
  MACHINE_GUID_VALUE,
} = await import('./deviceIdentity.js')

const MACHINE_GUID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301'

function sha256Hex(text) {
  return crypto.createHash('sha256').update(text).digest('hex')
}

describe('hashMachineGuid', () => {
  it('hashes the prefixed MachineGuid to 64 hex characters', () => {
    const hash = hashMachineGuid(MACHINE_GUID)
    expect(hash).toBe(sha256Hex(`${DEVICE_ID_PREFIX}${MACHINE_GUID}`))
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('trims surrounding whitespace before hashing', () => {
    expect(hashMachineGuid(`  ${MACHINE_GUID}\r\n`)).toBe(hashMachineGuid(MACHINE_GUID))
  })

  it('never hashes a null, undefined or empty value', () => {
    expect(hashMachineGuid(null)).toBeNull()
    expect(hashMachineGuid(undefined)).toBeNull()
    expect(hashMachineGuid('')).toBeNull()
    expect(hashMachineGuid('   ')).toBeNull()
  })

  it('refuses anything that is not a GUID', () => {
    expect(hashMachineGuid('ERROR: The system was unable to find the specified registry key')).toBeNull()
    expect(hashMachineGuid('not-a-guid')).toBeNull()
    expect(hashMachineGuid(12345)).toBeNull()
  })

  it('accepts upper case GUIDs', () => {
    expect(isMachineGuid(MACHINE_GUID.toUpperCase())).toBe(true)
    expect(hashMachineGuid(MACHINE_GUID.toUpperCase())).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('readDeviceId', () => {
  it('reads MachineGuid from the cryptography key and hashes it', () => {
    const readRegistryValue = vi.fn().mockReturnValue(MACHINE_GUID)
    expect(readDeviceId(readRegistryValue)).toBe(hashMachineGuid(MACHINE_GUID))
    expect(readRegistryValue).toHaveBeenCalledWith(MACHINE_GUID_KEY, MACHINE_GUID_VALUE)
  })

  it('returns null when the registry value is missing', () => {
    expect(readDeviceId(() => null)).toBeNull()
  })

  it('returns null when the registry read throws', () => {
    expect(readDeviceId(() => { throw new Error('reg.exe missing') })).toBeNull()
  })
})

describe('device names', () => {
  it('caps the hostname at the server limit', () => {
    const long = 'x'.repeat(DEVICE_NAME_MAX_LENGTH + 20)
    expect(capDeviceName(long)).toHaveLength(DEVICE_NAME_MAX_LENGTH)
  })

  it('keeps a short hostname as it is', () => {
    expect(capDeviceName('DESKTOP-ABC123')).toBe('DESKTOP-ABC123')
  })

  it('falls back to a generic name when the hostname is empty or unreadable', () => {
    expect(capDeviceName('')).toBe(FALLBACK_DEVICE_NAME)
    expect(capDeviceName(null)).toBe(FALLBACK_DEVICE_NAME)
    expect(readDeviceName(() => { throw new Error('no hostname') })).toBe(FALLBACK_DEVICE_NAME)
    expect(readDeviceName(() => 'MY-PC')).toBe('MY-PC')
  })
})
