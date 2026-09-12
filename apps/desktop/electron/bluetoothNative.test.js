import { describe, it, expect } from 'vitest'
import {
  IOCTL_BTH_DISCONNECT_DEVICE,
  IOCTL_KS_PROPERTY,
  controlCode,
  decodeDevpropString,
  decodeGuid,
  decodeMultiSz,
  encodeBthAddress,
  encodeGuid,
  encodeKsProperty,
  propertyKeyBuffer,
} from './bluetoothNative.js'

const FRIENDLY_NAME = { guid: '{a45c254e-df1c-4efd-8020-67d146a850e0}', pid: 14 }
const CONTAINER_ID = { guid: '{8c7ed206-3f8a-4827-b3ab-ae9e1faefc6c}', pid: 2 }
const KSPROPSETID_BT_AUDIO = '{7fa06c40-b8f6-4c7e-8556-e8c33a12e54d}'

describe('decodeMultiSz', () => {
  it('splits a double-null-terminated UTF-16 list', () => {
    const buffer = Buffer.from('BTH\\MS_BTHLE\\1\0BTH\\MS_BTHBRB\\2\0\0', 'utf16le')

    expect(decodeMultiSz(buffer)).toEqual(['BTH\\MS_BTHLE\\1', 'BTH\\MS_BTHBRB\\2'])
  })

  it('returns an empty list for an empty multi-string', () => {
    expect(decodeMultiSz(Buffer.from('\0', 'utf16le'))).toEqual([])
  })
})

describe('decodeDevpropString', () => {
  it('stops at the terminator', () => {
    expect(decodeDevpropString(Buffer.from('Headset\0garbage', 'utf16le'))).toBe('Headset')
  })

  it('keeps non-ASCII names intact', () => {
    expect(decodeDevpropString(Buffer.from('Kopfhörer’s\0', 'utf16le'))).toBe('Kopfhörer’s')
  })
})

describe('GUID and property key encoding', () => {
  it.each([FRIENDLY_NAME, CONTAINER_ID])('round-trips $guid with the pid after the GUID', (key) => {
    const buffer = propertyKeyBuffer(key)

    expect(buffer).toHaveLength(20)
    expect(decodeGuid(buffer)).toBe(key.guid)
    expect(buffer.readUInt32LE(16)).toBe(key.pid)
  })

  it('stores the first three GUID fields little-endian', () => {
    expect(encodeGuid(KSPROPSETID_BT_AUDIO).subarray(0, 8).toString('hex')).toBe('406ca07ff6b87e4c')
  })

  it('rejects text that is not a GUID', () => {
    expect(() => encodeGuid('{not-a-guid}')).toThrow()
  })

  it('refuses to decode a short buffer', () => {
    expect(decodeGuid(Buffer.alloc(8))).toBeNull()
  })
})

describe('encodeKsProperty', () => {
  it('lays out a 24-byte KSPROPERTY for the Bluetooth audio one-shot request', () => {
    const buffer = encodeKsProperty(KSPROPSETID_BT_AUDIO, 1, 1)

    expect(buffer).toHaveLength(24)
    expect(decodeGuid(buffer)).toBe(KSPROPSETID_BT_AUDIO)
    expect(buffer.readUInt32LE(16)).toBe(1)
    expect(buffer.readUInt32LE(20)).toBe(1)
  })
})

describe('controlCode', () => {
  it('matches CTL_CODE for IOCTL_KS_PROPERTY and IOCTL_BTH_DISCONNECT_DEVICE', () => {
    expect(controlCode(0x2f, 0, 3, 0)).toBe(0x002f0003)
    expect(controlCode(0x41, 3, 0, 0)).toBe(0x0041000c)
    expect(IOCTL_KS_PROPERTY).toBe(0x002f0003)
    expect(IOCTL_BTH_DISCONNECT_DEVICE).toBe(0x0041000c)
  })
})

describe('encodeBthAddress', () => {
  it('encodes the address as an 8-byte little-endian BTH_ADDR', () => {
    expect(encodeBthAddress('001122334455').toString('hex')).toBe('5544332211000000')
  })

  it('rejects anything that is not 12 hex digits', () => {
    expect(() => encodeBthAddress('00112233445')).toThrow()
    expect(() => encodeBthAddress('00112233445g')).toThrow()
  })
})
