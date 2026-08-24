import { describe, it, expect } from 'vitest'
import { buildInterfaceGeneration, decodeRadioState, decodeSsid } from './networkNative.js'

const CONNECTION_SSID_LENGTH_OFFSET = 520
const CONNECTION_SSID_OFFSET = 524
const CONNECTION_STRUCT_BYTES = 604

function connectionBufferFor(ssid) {
  const buffer = Buffer.alloc(CONNECTION_STRUCT_BYTES)
  const encoded = Buffer.from(ssid, 'utf8')
  buffer.writeUInt32LE(encoded.length, CONNECTION_SSID_LENGTH_OFFSET)
  encoded.copy(buffer, CONNECTION_SSID_OFFSET)
  return buffer
}

function radioBufferFor(phyStates) {
  const buffer = Buffer.alloc(4 + phyStates.length * 12)
  buffer.writeUInt32LE(phyStates.length, 0)
  phyStates.forEach(([software, hardware], index) => {
    const base = 4 + index * 12
    buffer.writeUInt32LE(index, base)
    buffer.writeUInt32LE(software, base + 4)
    buffer.writeUInt32LE(hardware, base + 8)
  })
  return buffer
}

describe('decodeSsid', () => {
  it('reads exactly the declared number of bytes', () => {
    expect(decodeSsid(connectionBufferFor('LAN SOLO'))).toBe('LAN SOLO')
  })

  it('decodes a multi-byte utf8 name', () => {
    expect(decodeSsid(connectionBufferFor('Café Réseau'))).toBe('Café Réseau')
  })

  it('returns null for a hidden network with no name', () => {
    expect(decodeSsid(connectionBufferFor(''))).toBeNull()
  })

  it('never reads past the 32-byte dot11 ssid field', () => {
    const buffer = connectionBufferFor('')
    buffer.writeUInt32LE(4096, CONNECTION_SSID_LENGTH_OFFSET)
    buffer.fill(0x41, CONNECTION_SSID_OFFSET, CONNECTION_SSID_OFFSET + 64)
    expect(decodeSsid(buffer)).toBe('A'.repeat(32))
  })
})

describe('decodeRadioState', () => {
  it('reports on when every radio is on', () => {
    expect(decodeRadioState(radioBufferFor([[1, 1], [1, 1]]))).toBe('on')
  })

  it('reports off when the software radio is off', () => {
    expect(decodeRadioState(radioBufferFor([[1, 1], [2, 1]]))).toBe('off')
  })

  it('reports off when the hardware radio is off', () => {
    expect(decodeRadioState(radioBufferFor([[1, 2]]))).toBe('off')
  })

  it('reports unavailable when the adapter exposes no radio', () => {
    expect(decodeRadioState(radioBufferFor([]))).toBe('unavailable')
  })

  it('reports unavailable rather than reading past a truncated buffer', () => {
    const truncated = radioBufferFor([[1, 1]]).subarray(0, 10)
    expect(decodeRadioState(truncated)).toBe('unavailable')
  })
})

describe('buildInterfaceGeneration', () => {
  it('changes when an interface goes up', () => {
    const down = buildInterfaceGeneration([{ ifIndex: 27, ifType: 6, operStatus: 2 }])
    const up = buildInterfaceGeneration([{ ifIndex: 27, ifType: 6, operStatus: 1 }])
    expect(up).not.toBe(down)
  })

  it('changes when an interface appears', () => {
    const one = buildInterfaceGeneration([{ ifIndex: 24, ifType: 71, operStatus: 1 }])
    const two = buildInterfaceGeneration([
      { ifIndex: 24, ifType: 71, operStatus: 1 },
      { ifIndex: 27, ifType: 6, operStatus: 1 },
    ])
    expect(two).not.toBe(one)
  })

  it('is stable across enumeration order', () => {
    const forward = buildInterfaceGeneration([
      { ifIndex: 1, ifType: 24, operStatus: 1 },
      { ifIndex: 24, ifType: 71, operStatus: 1 },
    ])
    const reversed = buildInterfaceGeneration([
      { ifIndex: 24, ifType: 71, operStatus: 1 },
      { ifIndex: 1, ifType: 24, operStatus: 1 },
    ])
    expect(reversed).toBe(forward)
  })
})
